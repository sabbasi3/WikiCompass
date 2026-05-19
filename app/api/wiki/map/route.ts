// Thin HTTP wrapper over generateMapResponse. Handles only the things
// that are genuinely HTTP-shaped: body parsing, request validation,
// rate limiting, and mapping the typed response `kind` to an HTTP
// status code. All map-generation logic lives in lib/generate-map-response.ts
// so the eval suite can exercise the exact same code path.

import { NextResponse } from "next/server";

import {
  generateMapResponse,
  type MapResponse,
} from "@/lib/generate-map-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRequestSchema } from "@/lib/schemas";

// HTTP status for each successful response kind. Errors that map to
// 4xx/5xx are still part of the typed response — the UI can render a
// useful degraded state instead of just seeing a generic failure.
function statusFor(kind: MapResponse["kind"]): number {
  switch (kind) {
    case "map":
      return 200;
    case "disambiguation":
      return 409;
    case "not_found":
      return 404;
    case "ai_failed":
      return 502;
    case "error":
      return 502;
  }
}

export async function POST(req: Request) {
  // Body parsing — malformed JSON is a client error, surface it cleanly.
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

  // Schema validation — catches missing/wrong-typed fields before they
  // hit our orchestration. Surface the Zod issues so the UI can show
  // field-specific errors during development.
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

  // Sliding window via Upstash. Fail-open if KV isn't configured
  // (see lib/rate-limit.ts).
  const rate = await checkRateLimit(req);
  if (!rate.ok) return rate.response;
  const rateHeaders = rate.headers;

  // Everything else lives in generateMapResponse — context fetch, AI
  // generation, verify-then-strip, grounding, meta.
  const result = await generateMapResponse(topic, level, userGoal);
  return NextResponse.json(result, {
    status: statusFor(result.kind),
    headers: rateHeaders,
  });
}
