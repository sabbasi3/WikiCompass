import { NextResponse } from "next/server";

import {
  DisambiguationError,
  WikipediaNotFoundError,
  getWikipediaContext,
  searchWikipedia,
} from "@/lib/wiki";
import { generateWikiMap } from "@/lib/ai/generateWikiMap";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRequestSchema } from "@/lib/schemas";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  overrideGrounding,
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

  const parsed = mapRequestSchema.safeParse(body);
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

  let context;
  try {
    context = await getWikipediaContext(topic, level, userGoal);
  } catch (err) {
    if (err instanceof DisambiguationError) {
      const candidates = await searchWikipedia(topic, 8).catch(() => []);
      return NextResponse.json(
        { kind: "disambiguation", title: err.title, candidates },
        { status: 409, headers: rateHeaders },
      );
    }
    if (err instanceof WikipediaNotFoundError) {
      return NextResponse.json(
        { kind: "not_found", title: err.title },
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

  let mapResult;
  let retries = 0;
  try {
    mapResult = await generateWikiMap(context);
  } catch (firstErr) {
    // Server-side log only - safe to log Zod/AI error messages here
    // because route handlers run on the server, never visible to the
    // client DevTools console. Goes to next dev terminal locally and
    // Vercel function logs in production.
    console.error(
      "[wiki/map] first attempt failed, retrying:",
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    retries = 1;
    try {
      mapResult = await generateWikiMap(context);
    } catch (secondErr) {
      // Log detail server-side; return a generic message to the client.
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
  const stripResult = stripHallucinatedUrls(map, allowed);
  map = stripResult.map;
  if (
    stripResult.strippedNodeUrls.length + stripResult.strippedPathUrls.length >
    0
  ) {
    map = {
      ...map,
      warnings: [
        ...map.warnings,
        `Removed ${stripResult.strippedNodeUrls.length + stripResult.strippedPathUrls.length} hallucinated URL(s) before rendering.`,
      ],
    };
  }

  map = overrideGrounding(map, context);

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
      meta: {
        latencyMs: mapResult.latencyMs,
        usage: mapResult.usage,
        retries,
        graphIssues,
        strippedUrls:
          stripResult.strippedNodeUrls.length +
          stripResult.strippedPathUrls.length,
        internal: internalMeta,
      },
    },
    { headers: rateHeaders },
  );
}
