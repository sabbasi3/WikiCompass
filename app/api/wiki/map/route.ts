// Orchestrates one map generation: Wikipedia fetch → AI generate → URL
// verify-then-strip → grounding compute → response. Every catch block
// below is a deliberate failure mode that returns a degraded-but-useful
// response — kind: "ai_failed", "disambiguation", "not_found", or "error".
// Every response carries a `kind` field so the UI can switch on it. New
// failure states are added by adding a `kind` — the compiler then forces
// the UI to handle the new case.

import { NextResponse } from "next/server";

import {
  DisambiguationError,
  WikipediaNotFoundError,
  fetchAmbiguousCandidates,
  getWikipediaContext,
  suggestWikipediaTitles,
  verifyWikipediaUrls,
  type WikiContext,
} from "@/lib/wiki";
import {
  generateWikiMap,
  type GenerateWikiMapResult,
} from "@/lib/ai/generateWikiMap";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRequestSchema } from "@/lib/schemas";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  collectUnknownUrls,
  computeGrounding,
  stripHallucinatedUrls,
} from "@/lib/validation";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn(
      "[wiki/map] invalid JSON body:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { kind: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = mapRequestSchema.safeParse(body); //validate input against schema
  if (!parsed.success) {
    return NextResponse.json(
      {
        kind: "error",
        message: "Invalid request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { topic, level, userGoal } = parsed.data;

  // Sliding window via Upstash. Fail-open if KV isn't configured (see lib/rate-limit.ts).
  const rate = await checkRateLimit(req);
  if (!rate.ok) return rate.response;
  const rateHeaders = rate.headers;

  let context: WikiContext;
  try {
    context = await getWikipediaContext(topic, level, userGoal);
  } catch (err) {
    // Ambiguous topic ("Mercury" → planet/element/myth/…). Don't ask the
    // model to guess — let the human pick from a chooser.
    if (err instanceof DisambiguationError) {
      const candidates = await fetchAmbiguousCandidates(err.title, 15).catch(
        () => [],
      );
      return NextResponse.json(
        { kind: "disambiguation", title: err.title, candidates },
        { status: 409, headers: rateHeaders },
      );
    }
    // Not found = typo. Soft-fail did-you-mean via opensearch; still
    // return 404 even if the suggestion lookup itself dies.
    if (err instanceof WikipediaNotFoundError) {
      const suggestions = await suggestWikipediaTitles(topic, 5).catch(
        () => [],
      );
      return NextResponse.json(
        { kind: "not_found", title: err.title, suggestions },
        { status: 404, headers: rateHeaders },
      );
    }
    // Security: full err to server logs, generic message to client. No
    // library version, upstream identifier, or stack trace in 5xx bodies.
    console.error(
      "[wiki/map] Wikipedia fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { kind: "error", message: "Wikipedia fetch failed" },
      { status: 502, headers: rateHeaders },
    );
  }

  // Two retry layers compose: AI SDK handles transport (maxRetries=2
  // default → up to 3 attempts), we handle content here (one retry, then
  // degrade). When generateWikiMap() throws, transport was already retried
  // — it's a content failure (Zod rejected the shape, or JSON truncated).
  let mapResult: GenerateWikiMapResult;
  let retries = 0;
  try {
    mapResult = await generateWikiMap(context);
  } catch (firstErr) {
    console.error(
      "[wiki/map] first attempt failed, retrying:",
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    retries = 1;
    try {
      mapResult = await generateWikiMap(context);
    } catch (secondErr) {
      console.error(
        "[wiki/map] retry also failed, returning ai_failed:",
        secondErr instanceof Error ? secondErr.message : String(secondErr),
      );
      return NextResponse.json(
        {
          kind: "ai_failed",
          message: "AI generation failed",
          fallback: {
            title: context.title,
            canonicalUrl: context.canonicalUrl,
            summary: context.summary,
            candidateLinks: context.candidateLinks,
          },
        },
        { status: 502, headers: rateHeaders },
      );
    }
  }

  let map = mapResult.map;
  const allowed = buildAllowedUrlSet(context);

  // Verify-then-strip: model still writes URLs outside candidates ~3% of
  // the time (cap=150). Most are real articles we didn't include — hit
  // Wikipedia in parallel + title-match check (Jaccard ≥ 0.6) to keep
  // the reals; everything else gets stripped to null.
  const unknownUrls = collectUnknownUrls(map, allowed);
  const verified =
    unknownUrls.length > 0
      ? await verifyWikipediaUrls(unknownUrls)
      : new Set<string>();
  for (const url of verified) allowed.add(url);
  if (unknownUrls.length > 0) {
    console.log(
      `[wiki/map] URL verification for "${context.title}": ${verified.size}/${unknownUrls.length} model-supplied URLs verified, ${unknownUrls.length - verified.size} will be stripped`,
    );
  }

  const stripResult = stripHallucinatedUrls(map, allowed);
  map = stripResult.map;
  // Silent strip from the user's POV; loud server logs so we can track
  // the model's drift pattern over time in Vercel function logs.
  const totalStripped =
    stripResult.strippedNodeUrls.length + stripResult.strippedPathUrls.length;
  if (totalStripped > 0) {
    console.warn(
      `[wiki/map] stripped ${totalStripped} unverified URL(s) for topic "${context.title}":`,
      {
        nodes: stripResult.strippedNodeUrls,
        path: stripResult.strippedPathUrls,
      },
    );
  }

  // Build the grounding metadata for the response.
  const grounding = computeGrounding(map, context);

  // graphIssues is non-blocking (see checkGraphIntegrity).
  // internalMeta exposes stripped URLs in dev only (debugging).
  const graphIssues = checkGraphIntegrity(map);
  const internalMeta =
    process.env.NODE_ENV !== "production"
      ? {
          strippedNodeUrls: stripResult.strippedNodeUrls,
          strippedPathUrls: stripResult.strippedPathUrls,
        }
      : undefined;

  return NextResponse.json(
    {
      kind: "map",
      map,
      grounding,
      meta: {
        latencyMs: mapResult.latencyMs,
        usage: mapResult.usage,
        retries,
        graphIssues,
        unknownUrls: unknownUrls.length,
        verifiedUrls: verified.size,
        strippedUrls:
          stripResult.strippedNodeUrls.length +
          stripResult.strippedPathUrls.length,
        internal: internalMeta,
      },
    },
    { headers: rateHeaders },
  );
}
