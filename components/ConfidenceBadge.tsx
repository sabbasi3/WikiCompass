"use client";

import type { WikiMap } from "@/lib/ai/schema";

export function ConfidenceBadge({
  level: _level,
}: {
  level: WikiMap["confidence"];
}) {
  return <span data-testid="confidence-badge" />;
}
