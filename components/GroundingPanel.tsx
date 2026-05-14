"use client";

import type { WikiMap } from "@/lib/ai/schema";

export function GroundingPanel({
  grounding: _grounding,
}: {
  grounding: WikiMap["grounding"];
}) {
  return <div data-testid="grounding-panel" />;
}
