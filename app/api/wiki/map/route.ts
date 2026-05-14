import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DisambiguationError,
  WikipediaNotFoundError,
  getWikipediaContext,
  searchWikipedia,
} from "@/lib/wiki";
import { generateWikiMap } from "@/lib/ai/generateWikiMap";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  overrideGrounding,
  stripHallucinatedUrls,
} from "@/lib/validation";

const mapRequestSchema = z.object({
  topic: z.string().min(1).max(200),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  userGoal: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
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

  let context;
  try {
    context = await getWikipediaContext(topic, level, userGoal);
  } catch (err) {
    if (err instanceof DisambiguationError) {
      const candidates = await searchWikipedia(topic, 8).catch(() => []);
      return NextResponse.json(
        { kind: "disambiguation", title: err.title, candidates },
        { status: 409 },
      );
    }
    if (err instanceof WikipediaNotFoundError) {
      return NextResponse.json(
        { kind: "not_found", title: err.title },
        { status: 404 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Wikipedia fetch failed";
    return NextResponse.json({ kind: "error", message }, { status: 502 });
  }

  let mapResult;
  let retries = 0;
  try {
    mapResult = await generateWikiMap(context);
  } catch (firstErr) {
    retries = 1;
    try {
      mapResult = await generateWikiMap(context);
    } catch (secondErr) {
      const message =
        secondErr instanceof Error ? secondErr.message : "AI generation failed";
      return NextResponse.json(
        {
          kind: "ai_failed",
          message,
          fallback: {
            title: context.title,
            canonicalUrl: context.canonicalUrl,
            summary: context.summary,
            candidateLinks: context.candidateLinks,
          },
        },
        { status: 502 },
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

  return NextResponse.json({
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
    },
  });
}
