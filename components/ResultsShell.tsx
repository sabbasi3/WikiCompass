"use client";

import type { WikiMap } from "@/lib/ai/schema";

export function ResultsShell({ map: _map }: { map: WikiMap | null }) {
  return <div data-testid="results-shell" />;
}
