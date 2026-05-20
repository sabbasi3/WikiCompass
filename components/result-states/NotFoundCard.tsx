"use client";

import { Button } from "@/components/ui/button";
import type { WikiSearchResult } from "@/lib/wiki";

import { CARD, RESET_BTN_CLASSES } from "./styles";

// Rendered when Wikipedia has no article matching the typed title
// (typo, nonsense, or obscure name). When suggestions are present,
// they're "Did you mean..." matches from opensearch and re-submit
// via onPickCandidate.

export function NotFoundCard({
  title,
  suggestions,
  onPickCandidate,
  onReset,
}: {
  title: string;
  suggestions: WikiSearchResult[];
  onPickCandidate: (title: string) => void;
  onReset: () => void;
}) {
  const hasSuggestions = suggestions && suggestions.length > 0;
  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
        No Wikipedia article for &ldquo;{title}&rdquo;
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasSuggestions
          ? "Did you mean one of these?"
          : "Check spelling or try a different topic."}
      </p>
      {hasSuggestions && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onPickCandidate(suggestion.title)}
              className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
            >
              <div className="font-serif font-medium text-foreground">
                {suggestion.title}
              </div>
              {suggestion.description && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {suggestion.description}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <Button onClick={onReset} className={RESET_BTN_CLASSES}>
        Try a different topic
      </Button>
    </section>
  );
}
