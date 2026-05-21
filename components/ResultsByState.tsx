"use client";

import dynamic from "next/dynamic";

import { MapSkeleton } from "@/components/MapSkeleton";
import { AiFailedCard } from "@/components/result-states/AiFailedCard";
import { DisambiguationCard } from "@/components/result-states/DisambiguationCard";
import { ErrorCard } from "@/components/result-states/ErrorCard";
import { NotFoundCard } from "@/components/result-states/NotFoundCard";
import { RateLimitedCard } from "@/components/result-states/RateLimitedCard";
import type { WikiMapState } from "@/hooks/useWikiMap";

// MapResult pulls in xyflow (~535 KB), the largest single chunk in the
// app. Most landing-page visitors never see a map — they may bounce,
// disambiguate, hit not_found, or rate-limit. Dynamic-import keeps that
// 535 KB out of the initial bundle and only fetches it when a map
// actually renders. ssr: false because xyflow needs the DOM.
const MapResult = dynamic(
  () =>
    import("@/components/MapResult").then((m) => ({ default: m.MapResult })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Rendering map…
      </div>
    ),
  },
);

// Renders the right sub-component for the current WikiMapState kind.
// Pure switch on state.kind — no side effects, no own state. Each
// branch's body lives in its own component for testability and easier
// per-state design iteration.
export function ResultsByState({
  state,
  onPickCandidate,
  onReset,
}: {
  state: WikiMapState;
  onPickCandidate: (title: string) => void;
  onReset: () => void;
}) {
  switch (state.kind) {
    case "idle":
      return null;
    case "loading":
      return <MapSkeleton topic={state.topic} level={state.level} />;
    case "map":
      return (
        <MapResult
          map={state.map}
          grounding={state.grounding}
          meta={state.meta}
        />
      );
    case "disambiguation":
      return (
        <DisambiguationCard
          title={state.title}
          candidates={state.candidates}
          onPickCandidate={onPickCandidate}
        />
      );
    case "not_found":
      return (
        <NotFoundCard
          title={state.title}
          suggestions={state.suggestions}
          onPickCandidate={onPickCandidate}
          onReset={onReset}
        />
      );
    case "ai_failed":
      return <AiFailedCard fallback={state.fallback} onReset={onReset} />;
    case "rate_limited":
      return (
        <RateLimitedCard
          message={state.message}
          limit={state.limit}
          onReset={onReset}
        />
      );
    case "error":
      return <ErrorCard message={state.message} onReset={onReset} />;
  }
}
