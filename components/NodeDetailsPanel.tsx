"use client";

import type { WikiMap } from "@/lib/schemas";

type Node = WikiMap["nodes"][number];

export function NodeDetailsPanel({
  node,
  onClose,
}: {
  node: Node | null;
  onClose: () => void;
}) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
        Click a node in the graph to see its explanation and source link.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {node.type.replace(/_/g, " ")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <h3 className="font-serif text-lg font-semibold leading-tight tracking-tight text-foreground">
        {node.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-foreground/80">
        {node.explanation}
      </p>
      {node.wikipediaUrl && (
        <a
          href={node.wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
        >
          Read on Wikipedia →
        </a>
      )}
    </div>
  );
}
