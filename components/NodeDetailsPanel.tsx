"use client";

import type { WikiMap } from "@/lib/ai/schema";

type Node = WikiMap["nodes"][number];

export function NodeDetailsPanel({ node: _node }: { node: Node | null }) {
  return <div data-testid="node-details" />;
}
