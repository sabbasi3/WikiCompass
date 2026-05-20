// GET  /api/journey/[id]/action?action=skip|cancel|unsubscribe&token=...
// POST /api/journey/[id]/action?action=skip|cancel|unsubscribe&token=...
//
// One endpoint for every workflow control + the email opt-out. Single
// route keeps the URL surface tiny (one path per journey) and lets
// emails embed action links with just a `?action=` swap.
//
// Why both verbs: emails render the controls as anchor tags (skip /
// unsubscribe / view), and anchors fire GET. The route can't be POST-only
// or every email click would 405. GET runs the same action but
// redirects to the journey page so the user lands somewhere readable
// instead of a JSON blob. POST is kept for in-page JS clients
// (JourneyTimeline's SkipButton) so they get a JSON response they can
// react to without a navigation.
//
// Trade-off worth flagging: GET means link-preview bots can fire the
// action when an email lands. Acceptable for the demo — worst case is
// an early quiz delivery or premature unsubscribe. Production hardening
// would route GET to a 2-step confirm page that POSTs from a form.
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
type Action = z.infer<typeof actionSchema>;

type ActionResult = { ok: true } | { ok: false; status: number; error: string };

// Validates the request, fires the action, returns a result-shape both
// HTTP handlers can render however they want (POST → JSON, GET → redirect).
async function runAction(
  journeyId: string,
  rawAction: string | null,
  rawToken: string | null,
): Promise<ActionResult> {
  const parsed = actionSchema.safeParse(rawAction);
  if (!parsed.success)
    return { ok: false, status: 400, error: "Invalid action" };
  const action: Action = parsed.data;

  if (!rawToken || !verifyJourneyToken(journeyId, rawToken)) {
    return { ok: false, status: 403, error: "Invalid or missing token" };
  }

  const journey = await getJourney(journeyId);
  if (!journey) return { ok: false, status: 404, error: "Journey not found" };

  try {
    switch (action) {
      case "skip":
        await skipAheadHook.resume(`skip:${journeyId}`, {});
        return { ok: true };
      case "cancel":
        await cancelHook.resume(`cancel:${journeyId}`, {});
        return { ok: true };
      case "unsubscribe":
        await unsubscribeJourney(journeyId);
        return { ok: true };
    }
  } catch (err) {
    console.error(
      `[journey/${journeyId}/action] action=${action} failed:`,
      err,
    );
    return {
      ok: false,
      status: 409,
      error: "Action could not be applied — the journey may not be waiting",
    };
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await params;
  const url = new URL(req.url);
  const result = await runAction(
    journeyId,
    url.searchParams.get("action"),
    url.searchParams.get("token"),
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    action: url.searchParams.get("action"),
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await params;
  const url = new URL(req.url);
  await runAction(
    journeyId,
    url.searchParams.get("action"),
    url.searchParams.get("token"),
  );
  // Always send the user to the journey page — successful or not. The
  // page itself reflects the new state (status badge, timeline, etc.)
  // and errors are no worse than a stale view, which the user can refresh.
  // Returning JSON or 405-style errors from an email link click is hostile.
  return NextResponse.redirect(new URL(`/journey/${journeyId}`, req.url));
}
