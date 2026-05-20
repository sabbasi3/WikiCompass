"use client";

import type { WikiSearchResult } from "@/lib/wiki";

import { CARD } from "./styles";

// Rendered when Wikipedia returns a disambiguation page for the typed
// topic (e.g. "Mercury" matches planet, element, Freddie, ...).
// Each candidate is a re-submittable choice via onPickCandidate.
//
// Caller fetches up to 15 candidates. Good enough for tested cases;
// pathologically large disambig pages may drop tail entries — could
// become a "show more" disclosure later.

export function DisambiguationCard({
  title,
  candidates,
  onPickCandidate,
}: {
  title: string;
  candidates: WikiSearchResult[];
  onPickCandidate: (title: string) => void;
}) {
  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
        Multiple matches for &ldquo;{title}&rdquo;
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the page you meant. The map will use that specific article.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <button
            key={candidate.title}
            type="button"
            onClick={() => onPickCandidate(candidate.title)}
            className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
          >
            <div className="font-serif font-medium text-foreground">
              {candidate.title}
            </div>
            {candidate.description && (
              <div className="mt-1 text-sm text-muted-foreground">
                {candidate.description}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
