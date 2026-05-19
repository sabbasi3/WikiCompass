// Status page for a learning journey. Server component — fetches the
// journey + its quizzes from Postgres and renders everything in one
// shot. Interactive bits (skip-ahead button, knowledge graph, node
// details panel) live inside the imported client components.
//
// Render layout:
//   Header     — topic, level, status, started date
//   Timeline   — 3 quiz rounds with delivery state + skip-ahead control
//   MapResult  — the canonical map UI (TopicOverview / WarningsPanel /
//                KnowledgeGraph / LearningPath / GroundingPanel). Same
//                component the one-shot lookup uses, so journey users
//                get a strict superset: the full map PLUS the quizzes.
//
// force-dynamic: this page reflects rapidly-changing workflow state
// (currentRound bumps every time a quiz lands). A normal reload must
// re-fetch — caching would make the skip-ahead button race the DB.

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { JourneyTimeline } from "@/components/JourneyTimeline";
import { LearningPath } from "@/components/LearningPath";
import { MapResult } from "@/components/MapResult";
import {
  getGroundingFromJourney,
  getJourneyWithQuizzes,
  getMapFromJourney,
  getMetaFromJourney,
} from "@/lib/journey/db";
import { signJourneyToken } from "@/lib/journey/tokens";
import type { JourneyRow } from "@/lib/journey/schema";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getJourneyWithQuizzes(id);
  if (!data) notFound();

  const { journey, quizzes } = data;
  const map = getMapFromJourney(journey);
  const grounding = getGroundingFromJourney(journey);
  const meta = getMetaFromJourney(journey);
  const token = signJourneyToken(journey.id);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <JourneyHeader journey={journey} />
      <JourneyTimeline journey={journey} quizzes={quizzes} token={token} />
      {grounding && meta ? (
        // Full map UI — the canonical view, shared with the one-shot
        // lookup flow. Includes graph + grounding panel + warnings.
        <MapResult map={map} grounding={grounding} meta={meta} />
      ) : (
        // Legacy fallback for rows created before grounding/meta were
        // persisted. Renders the same map data in a stripped-down form.
        <LegacyMapFallback map={map} />
      )}
      <BookmarkHint journey={journey} />
    </main>
  );
}

function JourneyHeader({ journey }: { journey: JourneyRow }) {
  return (
    <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {journey.topic}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {journey.level} • started {formatDate(journey.startedAt)}
          </p>
        </div>
        <StatusBadge status={journey.status} />
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "completed"
        ? "bg-sky-100 text-sky-700"
        : status === "cancelled"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

// Renders for journey rows that predate the grounding/meta columns.
// New journeys always have both fields populated and render MapResult.
function LegacyMapFallback({
  map,
}: {
  map: ReturnType<typeof getMapFromJourney>;
}) {
  return (
    <>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Summary
        </h2>
        <p className="mt-3 leading-relaxed text-foreground/90">{map.summary}</p>
        {map.keyTakeaway && (
          <p className="mt-4 border-l-2 border-emerald-200 pl-4 italic leading-relaxed text-muted-foreground">
            {map.keyTakeaway}
          </p>
        )}
      </section>
      <LearningPath path={map.learningPath} whyThisPath={map.whyThisPath} />
    </>
  );
}

function BookmarkHint({ journey }: { journey: JourneyRow }) {
  if (journey.email) return null;
  return (
    <aside className="rounded-lg border border-dashed border-border bg-muted/50 p-4 text-sm text-muted-foreground">
      Bookmark this page — you didn&apos;t provide an email, so the URL is your
      only way back to this journey.
    </aside>
  );
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
