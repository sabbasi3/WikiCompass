// The retention-quiz journey workflow.
//
// Shape (per journey, one workflow run):
//
//   sendWelcome
//   for round in [1, 2, 3]:
//     wait `duration[round]` racing skip + cancel
//     if cancelled: mark cancelled, exit
//     generate quiz, verify, store, send email
//   send completion email, mark completed
//
// Why each Workflows primitive earns its place here:
//   - 'use workflow' — journey lives ~7 days across many deploys
//   - 'use step'     — each AI call + DB write retries independently
//   - sleep('1 day') — pause without compute (the killer primitive)
//   - defineHook     — skip-ahead button on the status page resumes
//                       the workflow mid-sleep; that's the demo move
//
// Demo-mode env var (JOURNEY_DEMO_MODE=1) shrinks all sleeps to 5-min
// windows so the whole lifecycle runs in ~15 minutes locally.

import { defineHook, sleep } from "workflow";
import {
  getJourney,
  getMapFromJourney,
  storeQuizAndAdvance,
  updateJourneyStatus,
} from "@/lib/journey/db";
import { sendJourneyEmail } from "@/lib/email";
import { generateQuiz, verifyQuiz, type Quiz } from "@/lib/quiz";

// ── Configuration ────────────────────────────────────────────────────

// Demo mode shrinks day-scale sleeps to 5-minute windows so the whole
// lifecycle runs in ~15 minutes naturally, AND so a human has enough
// time to click "skip ahead" before the sleep elapses (10s windows
// raced with ~5s step time → unreliable). Real durations are cumulative
// day 1 / day 3 / day 7 — so 1d, 2d, 4d gaps.
const DEMO_MODE = process.env.JOURNEY_DEMO_MODE === "1";
const DURATIONS = DEMO_MODE
  ? (["5m", "5m", "5m"] as const)
  : (["1d", "2d", "4d"] as const);

// Token convention: `<action>:<journeyId>`. Action routes reconstruct
// these tokens from the URL path param when calling .resume().
const skipToken = (journeyId: string) => `skip:${journeyId}`;
const cancelToken = (journeyId: string) => `cancel:${journeyId}`;

// Hooks are exported so the action routes can call .resume() on them.
export const skipAheadHook = defineHook<Record<string, never>>();
export const cancelHook = defineHook<{ reason?: string }>();

// ── The workflow ─────────────────────────────────────────────────────

export async function quizJourneyWorkflow(input: {
  journeyId: string;
}): Promise<void> {
  "use workflow";

  const { journeyId } = input;

  await sendJourneyEmailStep(journeyId, { kind: "welcome" });

  for (const [index, duration] of DURATIONS.entries()) {
    const round = (index + 1) as 1 | 2 | 3;

    const outcome = await raceSleepAgainstHooks(journeyId, duration);
    if (outcome === "cancelled") {
      await markStatus(journeyId, "cancelled");
      return;
    }

    try {
      const quiz = await generateAndStoreQuiz(journeyId, round);
      await sendJourneyEmailStep(journeyId, { kind: "quiz", round, quiz });
    } catch (err) {
      // Step retries already exhausted by the runtime. Better to mark
      // stuck and stop than to push bad data through subsequent rounds.
      console.error(
        `[journey:${journeyId}] round ${round} failed after retries:`,
        err,
      );
      await markStatus(journeyId, "stuck");
      return;
    }
  }

  await sendJourneyEmailStep(journeyId, { kind: "completion" });
  await markStatus(journeyId, "completed");
}

// ── Wait + race helper ───────────────────────────────────────────────
// Not a step — this races primitives (sleep + hooks) that the workflow
// runtime tracks directly in its event log for deterministic replay.

type WaitOutcome = "continue" | "skip" | "cancelled";

async function raceSleepAgainstHooks(
  journeyId: string,
  duration: (typeof DURATIONS)[number],
): Promise<WaitOutcome> {
  // Hooks created with a fixed token reserve that token for the
  // lifetime of the hook. Without explicit disposal, the next
  // iteration's create() throws HookConflictError because the token
  // is still bound to the previous iteration's subscription. The
  // try/finally guarantees release on every exit path — sleep elapsed,
  // skip fired, cancel fired, or an upstream throw.
  const skip = skipAheadHook.create({ token: skipToken(journeyId) });
  const cancel = cancelHook.create({ token: cancelToken(journeyId) });
  try {
    return await Promise.race([
      sleep(duration).then(() => "continue" as const),
      skip.then(() => "skip" as const),
      cancel.then(() => "cancelled" as const),
    ]);
  } finally {
    skip.dispose();
    cancel.dispose();
  }
}

// ── Steps ────────────────────────────────────────────────────────────
// Each step runs in its own function invocation with automatic retry
// on throw (3x default). Keep them short and idempotent where possible.

// The core step: generate one round's quiz, verify it grounds against
// the stored map, persist, advance the round counter. Throws if all
// questions fail verification — step retry will try a fresh generation.
// Returns the verified Quiz so the caller can hand the payload to the
// email step without re-fetching — step return values are stored in
// the workflow event log and survive replays.
async function generateAndStoreQuiz(
  journeyId: string,
  round: 1 | 2 | 3,
): Promise<Quiz> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  const map = getMapFromJourney(journey);
  const { quiz } = await generateQuiz(map, round, journey.level);
  const verified = verifyQuiz(quiz, map);
  if (verified.quiz.questions.length === 0) {
    // Log the actual paraphrases so we can tune the matcher when this
    // fires — the unknown-node strings are the model's drift signature.
    console.warn(
      `[journey:${journeyId}] round ${round} verification stripped all ${quiz.questions.length} questions. Unknown refs:`,
      verified.strippedReasons.map((r) => r.unknownNode),
    );
    throw new Error(
      `All quiz questions failed verification for round ${round} — retrying`,
    );
  }
  // Single batched write — quiz row + current_round bump commit together
  // so the status page never sees a half-written state where the quiz
  // exists but the round counter is stale.
  await storeQuizAndAdvance(journeyId, round, verified.quiz.questions);
  if (verified.strippedCount > 0) {
    console.warn(
      `[journey:${journeyId}] round ${round} stripped ${verified.strippedCount} question(s):`,
      verified.strippedReasons.map((r) => r.unknownNode),
    );
  }
  console.log(
    `[journey:${journeyId}] round ${round} stored: ${verified.quiz.questions.length} questions, ${verified.strippedCount} stripped`,
  );
  return verified.quiz;
}

// Single step that handles welcome / quiz / completion emails. The
// caller passes just what varies per kind; topic + level come from
// the journey row. Anonymous journeys (no email on file) log and
// return — the workflow keeps running, future email steps no-op the
// same way.
type EmailStepArgs =
  | { kind: "welcome" }
  | { kind: "quiz"; round: 1 | 2 | 3; quiz: Quiz }
  | { kind: "completion" };

async function sendJourneyEmailStep(
  journeyId: string,
  args: EmailStepArgs,
): Promise<void> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  if (!journey.email) {
    console.log(
      `[journey:${journeyId}] no email on file — ${args.kind} email skipped`,
    );
    return;
  }

  const payload =
    args.kind === "welcome"
      ? {
          kind: "welcome" as const,
          topic: journey.topic,
          level: journey.level,
        }
      : args.kind === "quiz"
        ? {
            kind: "quiz" as const,
            topic: journey.topic,
            round: args.round,
            quiz: args.quiz,
          }
        : { kind: "completion" as const, topic: journey.topic };

  await sendJourneyEmail(journeyId, journey.email, payload);
  console.log(
    `[journey:${journeyId}] ${args.kind} email sent to ${journey.email}`,
  );
}

async function markStatus(
  journeyId: string,
  status: "completed" | "cancelled" | "stuck",
): Promise<void> {
  "use step";
  await updateJourneyStatus(journeyId, status);
}
