// Status page for a learning journey. Server component — fetches the
// journey + its quizzes from Postgres and renders everything in one
// shot.
//
// Render layout (top to bottom):
//   JourneyHeader   — topic, level, status, started date
//   TopicOverview   — summary + key takeaway. Server-rendered.
//   WarningsPanel   — sensitive-topic notices. Server-rendered.
//   MapInteractive  — the knowledge graph + floating details panel.
//                     The one client island in the map UI.
//   LearningPath    — numbered steps + whyThisPath rationale. Server.
//   GroundingPanel  — cited Wikipedia articles. Server-rendered.
//   JourneyTimeline — 3 quiz rounds with skip-ahead control. Client
//                     because of the Skip button + reload behavior.
//   BookmarkHint    — anonymous-journey nudge. Server.
//   MapChat (aside) — sticky chat panel. Client for streaming + tools.
//
// We compose the map blocks here directly (rather than via the shared
// MapResult component used by the home-page lookup flow) so the static
// ones render on the server and never ship JS to the browser. Only the
// graph, the chat, and the timeline cross into client-side.
//
// force-dynamic: opt out of Next.js static/ISR caching so the page is
// server-rendered fresh on every request. Required here because the
// background quiz workflow delivers up to 3 rounds asynchronously,
// inserting new quiz rows each time. Without this, a reload after a
// quiz arrives would still serve the stale cached HTML until expiry.

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { JourneyTimeline } from "@/components/JourneyTimeline";
import { MapChat } from "@/components/MapChat";
import { GroundingPanel } from "@/components/map-result/GroundingPanel";
import { LearningPath } from "@/components/map-result/LearningPath";
import { MapInteractive } from "@/components/map-result/MapInteractive";
import { TopicOverview } from "@/components/map-result/TopicOverview";
import { WarningsPanel } from "@/components/map-result/WarningsPanel";
import {
  getChatHistory,
  getGroundingFromJourney,
  getJourneyWithQuizzes,
  getMapFromJourney,
  getMetaFromJourney,
} from "@/lib/journey/db";
import { signJourneyToken } from "@/lib/journey/tokens";
import type { JourneyRow } from "@/lib/journey/schema";
import type { UIMessage } from "ai";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Fetch journey + quizzes + chat history in parallel. Chat history
  // arrives in the initial HTML so the chat panel renders with full
  // conversation visible on first paint — no client-side loading flash,
  // no extra round trip. On a missing journey we discard the chat
  // result; the wasted query is negligible and 404s are rare.
  const [data, chatRows] = await Promise.all([
    getJourneyWithQuizzes(id),
    getChatHistory(id),
  ]);
  if (!data) notFound();

  const { journey, quizzes } = data;
  const map = getMapFromJourney(journey);
  const grounding = getGroundingFromJourney(journey);
  const meta = getMetaFromJourney(journey);
  // grounding + meta are nullable in the schema but always written by the
  // /start route. If a row somehow lacks them, the UI can't render — 404
  // is cleaner than a half-built page.
  if (!grounding || !meta) notFound();
  const token = signJourneyToken(journey.id);

  const initialChatMessages: UIMessage[] = chatRows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
  }));

  // Two-column layout on lg+: main content on the left at the same
  // effective content width as the old max-w-4xl, chat as a sticky aside
  // on the right. On smaller viewports the grid collapses and the aside
  // stacks below the main column (just like the previous layout).
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="space-y-6 lg:min-w-0">
          <JourneyHeader journey={journey} />
          <TopicOverview map={map} meta={meta} />
          <WarningsPanel warnings={map.warnings} />
          <MapInteractive map={map} />
          <LearningPath path={map.learningPath} whyThisPath={map.whyThisPath} />
          <GroundingPanel grounding={grounding} />
          <JourneyTimeline journey={journey} quizzes={quizzes} token={token} />
          <BookmarkHint journey={journey} />
        </div>
        <aside className="mt-6 lg:sticky lg:top-6 lg:mt-0">
          <MapChat
            journeyId={journey.id}
            initialMessages={initialChatMessages}
          />
        </aside>
      </div>
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
        : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium tracking-wide ${tone}`}
    >
      {status}
    </span>
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
