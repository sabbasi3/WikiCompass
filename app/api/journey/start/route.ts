// POST /api/journey/start
//
// Starts a retention-quiz journey: generates the day-0 map synchronously
// (the user is on the form waiting for it), persists it, kicks off the
// background workflow, and returns the journey URL.
//
// Composition strategy:
//   - Reuses generateMapResponse() so map generation is identical to the
//     existing /api/wiki/map endpoint. Disambiguation / not_found /
//     ai_failed are bubbled to the client unchanged — UI shows the same
//     cards it does on the lookup path.
//   - Reuses checkRateLimit() — same throttle envelope as the lookup route.

import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import {
  generateMapResponse,
  type MapResponse,
} from "@/lib/generate-map-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRequestSchema } from "@/lib/schemas";
import {
  createJourney,
  deleteJourney,
  findActiveJourney,
} from "@/lib/journey/db";
import { signJourneyToken } from "@/lib/journey/tokens";
import { quizJourneyWorkflow } from "@/app/workflows/quiz-journey";

// Extends the map request with an optional email. Empty string → null
// before insert so the optional-email branch in the workflow works.
const startRequestSchema = mapRequestSchema.extend({
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

type StartResponse =
  | {
      kind: "started";
      journeyId: string;
      journeyUrl: string;
      token: string;
    }
  | { kind: "duplicate"; journeyId: string; journeyUrl: string }
  | Exclude<MapResponse, { kind: "map" }>;

function statusFor(kind: StartResponse["kind"]): number {
  switch (kind) {
    case "started":
    case "duplicate":
      return 200;
    case "disambiguation":
      return 409;
    case "not_found":
      return 404;
    case "ai_failed":
    case "error":
      return 502;
  }
}

export async function POST(req: Request) {
  // ── Body parsing ───────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn(
      "[journey/start] invalid JSON body:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { kind: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = startRequestSchema.safeParse(body);
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
  const { topic, level, userGoal, email } = parsed.data;

  // ── Rate limit ─────────────────────────────────────────────────────
  const rate = await checkRateLimit(req);
  if (!rate.ok) return rate.response;

  // ── Dedupe: existing active journey for (email, topic) wins ────────
  // Without this, mashing the form button would start parallel workflows.
  // Anonymous (null-email) journeys never collide — each gets its own row.
  const normalizedEmail = email?.toLowerCase().trim() ?? null;
  const existing = await findActiveJourney(normalizedEmail, topic);
  if (existing) {
    const response: StartResponse = {
      kind: "duplicate",
      journeyId: existing.id,
      journeyUrl: `/journey/${existing.id}`,
    };
    return NextResponse.json(response, {
      status: statusFor(response.kind),
      headers: rate.headers,
    });
  }

  // ── Generate the map (synchronous — user is waiting) ───────────────
  const mapResult = await generateMapResponse(topic, level, userGoal);
  if (mapResult.kind !== "map") {
    // Bubble disambiguation / not_found / ai_failed / error verbatim.
    // The form already knows how to render these from the lookup route.
    return NextResponse.json(mapResult, {
      status: statusFor(mapResult.kind),
      headers: rate.headers,
    });
  }

  // ── Persist the journey row ────────────────────────────────────────
  const journey = await createJourney({
    email: normalizedEmail,
    topic,
    level,
    userGoal: userGoal ?? null,
    mapJson: mapResult.map,
    // status defaults to 'active', currentRound to 0 via schema defaults
  });

  // ── Start the workflow (rollback the row on failure) ───────────────
  // The workflow runs out-of-band from this request — we kick it off
  // and return immediately. The user gets their map + journey URL now;
  // quizzes arrive over the next ~7 days.
  try {
    await start(quizJourneyWorkflow, [{ journeyId: journey.id }]);
  } catch (err) {
    console.error(
      `[journey/start] workflow start failed for journey ${journey.id}:`,
      err,
    );
    await deleteJourney(journey.id);
    return NextResponse.json(
      { kind: "error", message: "Failed to start journey workflow" },
      { status: 502, headers: rate.headers },
    );
  }

  const response: StartResponse = {
    kind: "started",
    journeyId: journey.id,
    journeyUrl: `/journey/${journey.id}`,
    token: signJourneyToken(journey.id),
  };
  return NextResponse.json(response, {
    status: statusFor(response.kind),
    headers: rate.headers,
  });
}
