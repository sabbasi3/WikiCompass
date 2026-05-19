// POST /api/journey/[id]/action?action=skip|cancel|unsubscribe
//
// One endpoint for every workflow control + the email opt-out. Single
// route keeps the URL surface tiny (one path per journey) and lets
// emails embed action links with just a `?action=` swap.
//
// All actions require a valid HMAC token (?token=...). Same token works
// for the lifetime of the journey — possession of the URL = identity.
//
// Action behaviors:
//   skip        — fire skipAheadHook → workflow exits current sleep
//   cancel      — fire cancelHook    → workflow marks status=cancelled
//   unsubscribe — DB-only: null out the email column. Workflow keeps
//                  running; future email steps no-op gracefully.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getJourney, unsubscribeJourney } from "@/lib/journey/db";
import { verifyJourneyToken } from "@/lib/journey/tokens";
import { cancelHook, skipAheadHook } from "@/app/workflows/quiz-journey";

const actionSchema = z.enum(["skip", "cancel", "unsubscribe"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await params;
  const url = new URL(req.url);
  const rawAction = url.searchParams.get("action");
  const rawToken = url.searchParams.get("token");

  // ── Validation ─────────────────────────────────────────────────────
  const parsed = actionSchema.safeParse(rawAction);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const action = parsed.data;

  if (!rawToken || !verifyJourneyToken(journeyId, rawToken)) {
    return NextResponse.json(
      { error: "Invalid or missing token" },
      { status: 403 },
    );
  }

  // ── Journey existence check ────────────────────────────────────────
  // Saves us hitting the workflow API for a journey that doesn't exist.
  const journey = await getJourney(journeyId);
  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  // ── Action dispatch ────────────────────────────────────────────────
  try {
    switch (action) {
      case "skip": {
        // Hook tokens follow `<action>:<journeyId>` — see quiz-journey.ts.
        // If the workflow isn't currently in a sleep, resume throws — we
        // surface that as a 409 so the UI can show "no quiz pending right
        // now" rather than a generic error.
        await skipAheadHook.resume(`skip:${journeyId}`, {});
        return NextResponse.json({ ok: true, action });
      }
      case "cancel": {
        await cancelHook.resume(`cancel:${journeyId}`, {});
        return NextResponse.json({ ok: true, action });
      }
      case "unsubscribe": {
        // Pure DB operation — no workflow involvement. The workflow
        // keeps running, but sendQuizEmail step now no-ops because
        // journey.email is null.
        await unsubscribeJourney(journeyId);
        return NextResponse.json({ ok: true, action });
      }
    }
  } catch (err) {
    console.error(
      `[journey/${journeyId}/action] action=${action} failed:`,
      err,
    );
    // Hook resume fails when no hook is currently waiting (e.g., user
    // clicked skip while the workflow is in a step rather than a sleep).
    // 409 conveys "valid request but the state doesn't allow it now."
    return NextResponse.json(
      {
        error: "Action could not be applied — the journey may not be waiting",
      },
      { status: 409 },
    );
  }
}
