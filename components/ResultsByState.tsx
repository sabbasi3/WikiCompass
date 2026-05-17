"use client";

import { MapResult } from "@/components/MapResult";
import { MapSkeleton } from "@/components/MapSkeleton";
import { AiFailedCard } from "@/components/results/AiFailedCard";
import { DisambiguationCard } from "@/components/results/DisambiguationCard";
import { ErrorCard } from "@/components/results/ErrorCard";
import { NotFoundCard } from "@/components/results/NotFoundCard";
import { RateLimitedCard } from "@/components/results/RateLimitedCard";
import type { WikiMapState } from "@/hooks/useWikiMap";

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
