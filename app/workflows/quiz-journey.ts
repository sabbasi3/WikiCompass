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
// Demo-mode env var (JOURNEY_DEMO_MODE=1) shrinks all sleeps to 10s so
// we can watch the whole lifecycle in 30s during local development.
//
// Email is currently a no-op (server log). Resend wiring is the last
// piece; the workflow shape doesn't change when it lands.

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

// ── Hooks (exported so action routes can call .resume()) ─────────────

export const skipAheadHook = defineHook<Record<string, never>>();
export const cancelHook = defineHook<{ reason?: string }>();

// ── Steps ────────────────────────────────────────────────────────────
// Each step runs in its own function invocation with automatic retry
// on throw (3x default). Keep them short and idempotent where possible.

async function sendWelcomeEmail(journeyId: string): Promise<void> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  if (!journey.email) {
    console.log(
      `[journey:${journeyId}] no email on file — welcome notification skipped`,
    );
    return;
  }
  await sendJourneyEmail(journeyId, journey.email, {
    kind: "welcome",
    topic: journey.topic,
    level: journey.level,
  });
  console.log(`[journey:${journeyId}] welcome email sent to ${journey.email}`);
}

// The core step: generate one round's quiz, verify it grounds against
// the stored map, persist, advance the round counter. Throws if all
// questions fail verification — step retry will try a fresh generation.
// Returns the verified Quiz so the next step (sendQuizEmail) gets the
// payload without re-fetching — step return values are stored in the
// workflow event log and survive replays.
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

async function sendQuizEmail(
  journeyId: string,
  round: 1 | 2 | 3,
  quiz: Quiz,
): Promise<void> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  if (!journey.email) {
    console.log(
      `[journey:${journeyId}] no email on file — round ${round} email skipped`,
    );
    return;
  }
  await sendJourneyEmail(journeyId, journey.email, {
    kind: "quiz",
    topic: journey.topic,
    round,
    quiz,
  });
  console.log(
    `[journey:${journeyId}] round ${round} email sent to ${journey.email}`,
  );
}

async function sendCompletionEmail(journeyId: string): Promise<void> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  if (!journey.email) {
    console.log(
      `[journey:${journeyId}] no email on file — completion email skipped`,
    );
    return;
  }
  await sendJourneyEmail(journeyId, journey.email, {
    kind: "completion",
    topic: journey.topic,
  });
  console.log(
    `[journey:${journeyId}] completion email sent to ${journey.email}`,
  );
}

async function markStatus(
  journeyId: string,
  status: "completed" | "cancelled" | "stuck",
): Promise<void> {
  "use step";
  await updateJourneyStatus(journeyId, status);
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

// ── The workflow ─────────────────────────────────────────────────────

export async function quizJourneyWorkflow(input: {
  journeyId: string;
}): Promise<void> {
  "use workflow";

  const { journeyId } = input;

  await sendWelcomeEmail(journeyId);

  for (const [index, duration] of DURATIONS.entries()) {
    const round = (index + 1) as 1 | 2 | 3;

    const outcome = await raceSleepAgainstHooks(journeyId, duration);
    if (outcome === "cancelled") {
      await markStatus(journeyId, "cancelled");
      return;
    }

    try {
      const quiz = await generateAndStoreQuiz(journeyId, round);
      await sendQuizEmail(journeyId, round, quiz);
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

  await sendCompletionEmail(journeyId);
  await markStatus(journeyId, "completed");
}
