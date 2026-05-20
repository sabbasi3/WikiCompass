// The timeline UI for the quiz-journey status page. Renders three
// rounds with their delivery state, the quiz contents when delivered,
// and a "skip ahead" button on the next-up round when the journey is
// still active.
//
// Server-fetched `journey` + `quizzes` come from the page; this
// component just renders + handles the action POSTs.

"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ROUND_DAYS,
  getQuestionsFromQuiz,
  type JourneyRow,
  type JourneyStatus,
  type QuizRow,
} from "@/lib/journey/schema";
import type { QuizQuestion } from "@/lib/quiz";
const ROUND_DIFFICULTY: Record<1 | 2 | 3, string> = {
  1: "recognition",
  2: "recall",
  3: "application",
};

export function JourneyTimeline({
  journey,
  quizzes,
  token,
}: {
  journey: JourneyRow;
  quizzes: QuizRow[];
  token: string;
}) {
  const rounds = [1, 2, 3] as const;
  // Derive delivered-count from the quizzes array, not journey.currentRound.
  // The two writes (insert + counter bump) do commit together via
  // db.batch — but the UI only ever needs to know "how many quizzes
  // have landed", and the quizzes array is the direct answer. Reading
  // from the column would just add an indirection that has to stay in
  // sync; treating quizzes.length as the source of truth removes that
  // failure mode entirely.
  const deliveredCount = quizzes.length;
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
          <span className="text-amber-700">★</span>
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Retention quizzes
          </h3>
          <p className="text-sm text-muted-foreground">
            {statusLabel(journey, deliveredCount)}
          </p>
        </div>
      </div>

      <ol className="space-y-4">
        {rounds.map((round) => {
          const quiz = quizzes.find((q) => q.round === round);
          return (
            <RoundRow
              key={round}
              round={round}
              quiz={quiz ?? null}
              journey={journey}
              deliveredCount={deliveredCount}
              token={token}
            />
          );
        })}
      </ol>
    </section>
  );
}

function RoundRow({
  round,
  quiz,
  journey,
  deliveredCount,
  token,
}: {
  round: 1 | 2 | 3;
  quiz: QuizRow | null;
  journey: JourneyRow;
  deliveredCount: number;
  token: string;
}) {
  // Three orthogonal states drive what to render:
  //   delivered = the quiz row exists
  //   upNext    = no quiz yet AND this round is the immediate next one
  //   active    = journey can still be advanced (not cancelled/stuck/completed)
  const delivered = quiz !== null;
  const upNext = !delivered && round === deliveredCount + 1;
  const active = journey.status === "active";
  const isFuture = !delivered && !upNext;

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold ${
              delivered
                ? "bg-emerald-100 text-emerald-700"
                : upNext && active
                  ? "bg-amber-100 text-amber-700"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {delivered ? "✓" : round}
          </div>
          <div>
            <div className="font-serif font-semibold tracking-tight text-foreground">
              Day {ROUND_DAYS[round]} — {ROUND_DIFFICULTY[round]} round
            </div>
            <div className="text-sm text-muted-foreground">
              {delivered
                ? `Delivered ${formatDate(quiz!.sentAt)}`
                : upNext && active
                  ? "Next up"
                  : isFuture && active
                    ? "Queued"
                    : journey.status === "cancelled"
                      ? "Cancelled"
                      : journey.status === "stuck"
                        ? "Skipped — generation failed"
                        : "Pending"}
            </div>
          </div>
        </div>

        {upNext && active && (
          <SkipButton journeyId={journey.id} token={token} />
        )}
      </div>

      {delivered && <QuizQuestions questions={getQuestionsFromQuiz(quiz!)} />}
    </li>
  );
}

function QuizQuestions({ questions }: { questions: QuizQuestion[] }) {
  return (
    <ol className="mt-4 space-y-3 border-l-2 border-emerald-200 pl-4">
      {questions.map((q, i) => (
        <li key={q.id} className="text-sm">
          <div className="font-medium text-foreground">
            {i + 1}. {q.prompt}
          </div>
          <details className="mt-1 group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Reveal answer
            </summary>
            <div className="mt-2 rounded bg-muted px-3 py-2 text-foreground">
              {q.answer}
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

function SkipButton({
  journeyId,
  token,
}: {
  journeyId: string;
  token: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSkip() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/journey/${journeyId}/action?action=skip&token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        // 409 means the workflow wasn't currently waiting on a hook — most
        // often because the page is stale (workflow already advanced past
        // this sleep). Reload to pick up the real state instead of showing
        // a confusing "could not be applied" message. Other errors still
        // surface inline.
        if (res.status === 409) {
          location.reload();
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        setPending(false);
        return;
      }
      // Workflow runs out-of-band — give it a beat for the quiz to be
      // written, then refresh to pick up the new row.
      setTimeout(() => location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={handleSkip}
        disabled={pending}
      >
        {pending ? "Skipping…" : "Skip ahead"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function statusLabel(journey: JourneyRow, deliveredCount: number): string {
  switch (journey.status as JourneyStatus) {
    case "active":
      return `${deliveredCount}/3 quizzes delivered`;
    case "completed":
      return "Completed — all 3 quizzes delivered";
    case "cancelled":
      return "Cancelled";
    case "stuck":
      return "Paused — generation failed and was halted";
  }
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
