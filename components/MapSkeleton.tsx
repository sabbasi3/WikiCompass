"use client";

import { Card } from "@/components/ui/card";

import type { Level } from "@/hooks/useWikiMap";

export function MapSkeleton({ topic, level }: { topic: string; level: Level }) {
  return (
    <Card className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-7 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-3/5 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="pt-4 space-y-3">
          <div className="h-5 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-4 w-5/6 rounded bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-4 w-4/6 rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Building a <span className="font-medium">{level}</span> learning map for{" "}
        <span className="font-medium">&ldquo;{topic}&rdquo;</span>… about
        5&ndash;10 seconds.
      </p>
    </Card>
  );
}
