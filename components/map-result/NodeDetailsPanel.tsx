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
  if (!node) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xl ring-1 ring-black/5">
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
