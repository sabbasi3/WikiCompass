"use client";

import { useCallback, useState } from "react";

import type { WikiMap } from "@/lib/ai/schema";
import type { WikiSearchResult } from "@/lib/wiki";

export type Level = "beginner" | "intermediate" | "advanced";

export type MapMeta = {
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  retries: number;
  graphIssues: Array<{ kind: string; detail: string }>;
  strippedUrls: number;
};

export type WikiMapState =
  | { kind: "idle" }
  | { kind: "loading"; topic: string; level: Level }
  | { kind: "map"; map: WikiMap; meta: MapMeta }
  | { kind: "disambiguation"; title: string; candidates: WikiSearchResult[] }
  | { kind: "not_found"; title: string }
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
        const data = (await res.json()) as WikiMapState;
        setState(data);
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
