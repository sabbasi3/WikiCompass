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

  const rate = await checkRateLimit(req);
  if (!rate.ok) return rate.response;
  const rateHeaders = rate.headers;

  let context: WikiContext;
  try {
    context = await getWikipediaContext(topic, level, userGoal);
  } catch (err) {
    if (err instanceof DisambiguationError) {
      const candidates = await fetchAmbiguousCandidates(err.title, 15).catch(
        () => [],
      );
      return NextResponse.json(
        { kind: "disambiguation", title: err.title, candidates },
        { status: 409, headers: rateHeaders },
      );
    }
    if (err instanceof WikipediaNotFoundError) {
      // Surface up to 5 "Did you mean..." suggestions via Wikipedia's
      // opensearch (fuzzy/typo-tolerant) so a misspelling doesn't dead-
      // end the user. Soft-fail on search error — we still want to
      // return the 404 even if the suggestion lookup dies.
      const suggestions = await suggestWikipediaTitles(topic, 5).catch(
        () => [],
      );
      return NextResponse.json(
        { kind: "not_found", title: err.title, suggestions },
        { status: 404, headers: rateHeaders },
      );
    }
    // Log the detail server-side; return a generic message to the client
    // so we don't leak internal error strings, library version hints, or
    // upstream identifiers in the public response.
    console.error(
      "[wiki/map] Wikipedia fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { kind: "error", message: "Wikipedia fetch failed" },
      { status: 502, headers: rateHeaders },
    );
  }

  // Two retry layers compose:
  //   1. The AI SDK retries transport failures internally (network,
  //      rate-limit 429s, provider 5xx). Default maxRetries = 2 means
  //      generateWikiMap() can attempt up to 3 calls before throwing.
  //   2. When generateWikiMap() throws here, it's a *content* failure
  //      that survived the SDK's transport retries — Zod schema rejected
  //      the model's output, or parsing failed. We give the model one
  //      more shot in case the next generation is shaped better; if that
  //      fails too, degrade to ai_failed with the Wikipedia fallback so
  //      the user can still explore the topic.
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

  // The model can write URLs not in our candidateLinks set. Most are real
  // Wikipedia articles we just didn't include (cap is 60; popular topics
  // have hundreds of outgoing links). Verify them against Wikipedia in
  // parallel before stripping — keep the reals, drop the genuinely fake.
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
  // Strip silently from the user's perspective — the map still renders
  // (with null URLs replaced). Log to server console so we capture the
  // pattern of hallucinations in Vercel function logs / dev terminal.
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

  // Grounding is server-computed metadata about the generation. It
  // lives alongside the map in the response, not inside it — the AI
  // schema only describes AI output, and grounding is provably not
  // AI output.
  const grounding = computeGrounding(map, context);

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
