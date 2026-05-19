"use client";

import { useCallback, useState } from "react";

import type { Grounding, WikiMap } from "@/lib/schemas";
import type { WikiSearchResult } from "@/lib/wiki";

export type Level = "beginner" | "intermediate" | "advanced";

// telemetry/debug metadata returned by the API
export type MapMeta = {
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  retries: number;
  graphIssues: Array<{ kind: string; detail: string }>;
  unknownUrls: number;
  verifiedUrls: number;
  strippedUrls: number;
  internal?: {
    strippedNodeUrls: string[];
    strippedPathUrls: string[];
  };
};

export type WikiMapState =
  | { kind: "idle" }
  | { kind: "loading"; topic: string; level: Level }
  | { kind: "map"; map: WikiMap; grounding: Grounding; meta: MapMeta }
  | { kind: "disambiguation"; title: string; candidates: WikiSearchResult[] }
  | { kind: "not_found"; title: string; suggestions: WikiSearchResult[] }
  | {
      kind: "ai_failed";
      message: string;
      fallback: {
        title: string;
        canonicalUrl: string;
        summary: string;
        candidateLinks: Array<{ title: string; url: string }>;
      };
    }
  | {
      kind: "rate_limited";
      message: string;
      retryAfterSeconds: number;
      limit: number;
    }
  | { kind: "error"; message: string };

export function useWikiMap() {
  const [state, setState] = useState<WikiMapState>({ kind: "idle" });

  const generate = useCallback(
    async (topic: string, level: Level, userGoal?: string) => {
      setState({ kind: "loading", topic, level });
      try {
        const res = await fetch("/api/wiki/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, level, userGoal }),
        });
        const nextState = (await res.json()) as WikiMapState;
        setState(nextState);
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, generate, reset };
}
