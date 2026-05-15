// Visual styles per WikiMap node type. Pure data — colors only, no React.
// Co-located with the graph renderer (KnowledgeGraph) that consumes them.
// If a second consumer appears, lift to lib/.

import type { WikiMap } from "@/lib/ai/schema";

export type NodeType = WikiMap["nodes"][number]["type"];

export type NodeStyle = {
  bg: string;
  border: string;
  text: string;
};

export const NODE_STYLES: Record<NodeType, NodeStyle> = {
  main_topic: {
    bg: "bg-indigo-600",
    border: "border-indigo-700",
    text: "text-white",
  },
  prerequisite: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    border: "border-emerald-400 dark:border-emerald-700",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  core_concept: {
    bg: "bg-violet-100 dark:bg-violet-900/30",
    border: "border-violet-400 dark:border-violet-700",
    text: "text-violet-900 dark:text-violet-100",
  },
  related_topic: {
    bg: "bg-zinc-100 dark:bg-zinc-800",
    border: "border-zinc-300 dark:border-zinc-700",
    text: "text-zinc-800 dark:text-zinc-200",
  },
  advanced_topic: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    border: "border-orange-400 dark:border-orange-700",
    text: "text-orange-900 dark:text-orange-100",
  },
  application: {
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
    border: "border-cyan-400 dark:border-cyan-700",
    text: "text-cyan-900 dark:text-cyan-100",
  },
  person: {
    bg: "bg-rose-100 dark:bg-rose-900/30",
    border: "border-rose-400 dark:border-rose-700",
    text: "text-rose-900 dark:text-rose-100",
  },
  event: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-400 dark:border-amber-700",
    text: "text-amber-900 dark:text-amber-100",
  },
  place: {
    bg: "bg-teal-100 dark:bg-teal-900/30",
    border: "border-teal-400 dark:border-teal-700",
    text: "text-teal-900 dark:text-teal-100",
  },
  historical_context: {
    bg: "bg-stone-100 dark:bg-stone-800",
    border: "border-stone-400 dark:border-stone-600",
    text: "text-stone-800 dark:text-stone-200",
  },
  organization: {
    bg: "bg-red-100 dark:bg-red-900/30",
    border: "border-red-400 dark:border-red-700",
    text: "text-red-900 dark:text-red-100",
  },
  work: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    border: "border-yellow-400 dark:border-yellow-700",
    text: "text-yellow-900 dark:text-yellow-100",
  },
};
