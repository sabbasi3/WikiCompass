// Pure orchestration for a map-generation request. Takes a topic +
// audience level, returns a typed discriminated union covering every
// outcome the UI knows how to render. HTTP concerns (request parsing,
// rate limiting, status codes, NextResponse) live in the route; this
// file is HTTP-agnostic so the eval suite can call it directly and
// exercise the exact same code path users hit.
//
// New failure states get added by adding a `kind` to MapResponse —
// the compiler then forces every consumer (route, eval, useWikiMap)
// to handle it.

import {
  DisambiguationError,
  WikipediaNotFoundError,
  fetchAmbiguousCandidates,
  getWikipediaContext,
  suggestWikipediaTitles,
  verifyWikipediaUrls,
  type WikiContext,
  type WikiSearchResult,
} from "./wiki";
import {
  generateWikiMap,
  type GenerateWikiMapResult,
} from "./ai/generateWikiMap";
import type { Grounding, WikiMap } from "./schemas";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  collectUnknownUrls,
  computeGrounding,
  stripHallucinatedUrls,
} from "./validation";

export type Level = "beginner" | "intermediate" | "advanced";

export type MapMeta = {
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  retries: number;
  graphIssues: Array<{ kind: string; detail: string }>;
  unknownUrls: number;
  verifiedUrls: number;
  strippedUrls: number;
  // Dev-only: exposes the actual stripped URLs for debugging the model's
  // drift pattern. Omitted in production responses.
  internal?: {
    strippedNodeUrls: string[];
    strippedPathUrls: string[];
  };
};

export type MapResponse =
  | {
      kind: "map";
      map: WikiMap;
      grounding: Grounding;
      meta: MapMeta;
    }
  | {
      kind: "disambiguation";
      title: string;
      candidates: WikiSearchResult[];
    }
  | {
      kind: "not_found";
      title: string;
      suggestions: WikiSearchResult[];
    }
  | {
      kind: "ai_failed";
      message: string;
      fallback: {
        title: string;
        canonicalUrl: string;
        summary: string;
        candidateLinks: Array<{ title: string; url: string }>;
      };
    }
  | { kind: "error"; message: string };

// Orchestrates one map generation end-to-end. Mirrors the prior inline
// flow in app/api/wiki/map/route.ts: Wikipedia fetch → AI generate →
// URL verify-then-strip → grounding compute → typed response.
export async function generateMapResponse(
  topic: string,
  level: Level,
  userGoal?: string,
): Promise<MapResponse> {
  // ── Wikipedia context ────────────────────────────────────────────
  let context: WikiContext;
  try {
    context = await getWikipediaContext(topic, level, userGoal);
  } catch (err) {
    // Ambiguous topic ("Mercury" → planet/element/myth/…). Don't ask
    // the model to guess — let the human pick from a chooser.
    if (err instanceof DisambiguationError) {
      const candidates = await fetchAmbiguousCandidates(err.title, 15).catch(
        () => [],
      );
      return { kind: "disambiguation", title: err.title, candidates };
    }
    // Not found = typo. Soft-fail did-you-mean via opensearch; still
    // return a not_found shape even if suggestion lookup itself dies.
    if (err instanceof WikipediaNotFoundError) {
      const suggestions = await suggestWikipediaTitles(topic, 5).catch(
        () => [],
      );
      return { kind: "not_found", title: err.title, suggestions };
    }
    // Security: full err to server logs, generic message to caller.
    console.error(
      "[generateMapResponse] Wikipedia fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { kind: "error", message: "Wikipedia fetch failed" };
  }

  // ── AI generation (with one content-level retry) ─────────────────
  // Two retry layers compose: AI SDK handles transport (maxRetries=2
  // default → up to 3 attempts), we handle content here (one retry,
  // then degrade). When generateWikiMap() throws, transport was
  // already retried — it's a content failure (Zod rejected the shape,
  // or JSON truncated).
  let mapResult: GenerateWikiMapResult;
  let retries = 0;
  try {
    mapResult = await generateWikiMap(context);
  } catch (firstErr) {
    console.error(
      "[generateMapResponse] first attempt failed, retrying:",
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    retries = 1;
    try {
      mapResult = await generateWikiMap(context);
    } catch (secondErr) {
      console.error(
        "[generateMapResponse] retry also failed, returning ai_failed:",
        secondErr instanceof Error ? secondErr.message : String(secondErr),
      );
      return {
        kind: "ai_failed",
        message: "AI generation failed",
        fallback: {
          title: context.title,
          canonicalUrl: context.canonicalUrl,
          summary: context.summary,
          candidateLinks: context.candidateLinks,
        },
      };
    }
  }

  // ── Verify-then-strip URLs ───────────────────────────────────────
  // Model still writes URLs outside candidates ~3% of the time (cap=150).
  // Most are real articles we didn't include — hit Wikipedia in parallel
  // + title-match check (Jaccard ≥ 0.6) to keep the reals; everything
  // else gets stripped to null.
  let map = mapResult.map;
  const allowedUrls = buildAllowedUrlSet(context);
  const unknownUrls = collectUnknownUrls(map, allowedUrls);
  const verified =
    unknownUrls.length > 0
      ? await verifyWikipediaUrls(unknownUrls)
      : new Set<string>();
  for (const url of verified) allowedUrls.add(url);
  if (unknownUrls.length > 0) {
    console.log(
      `[generateMapResponse] URL verification for "${context.title}": ${verified.size}/${unknownUrls.length} model-supplied URLs verified, ${unknownUrls.length - verified.size} will be stripped`,
    );
  }

  const stripResult = stripHallucinatedUrls(map, allowedUrls);
  map = stripResult.map;
  const totalStripped =
    stripResult.strippedNodeUrls.length + stripResult.strippedPathUrls.length;
  // Silent strip from the user's POV; loud server logs so we can track
  // the model's drift pattern over time in Vercel function logs.
  if (totalStripped > 0) {
    console.warn(
      `[generateMapResponse] stripped ${totalStripped} unverified URL(s) for topic "${context.title}":`,
      {
        nodes: stripResult.strippedNodeUrls,
        path: stripResult.strippedPathUrls,
      },
    );
  }

  // ── Compute response metadata ────────────────────────────────────
  const grounding = computeGrounding(map, context);
  const graphIssues = checkGraphIntegrity(map); // non-blocking, see checkGraphIntegrity
  const internalMeta =
    process.env.NODE_ENV !== "production"
      ? {
          strippedNodeUrls: stripResult.strippedNodeUrls,
          strippedPathUrls: stripResult.strippedPathUrls,
        }
      : undefined;

  return {
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
      strippedUrls: totalStripped,
      internal: internalMeta,
    },
  };
}
