"use client";

import { Button } from "@/components/ui/button";

import { MapResult } from "@/components/MapResult";
import { MapSkeleton } from "@/components/MapSkeleton";
import type { WikiMapState } from "@/hooks/useWikiMap";

// Reused shells in the warm v0 palette.
const CARD = "rounded-xl border border-border bg-card p-6 shadow-sm";
const RESET_BTN_CLASSES =
  "mt-4 border border-border bg-background text-foreground/80 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700";

// Renders the right sub-component for the current WikiMapState kind.
// Pure switch on state.kind — no side effects, no own state.
export function ResultsByState({
  state,
  onPickCandidate,
  onReset,
}: {
  state: WikiMapState;
  onPickCandidate: (title: string) => void;
  onReset: () => void;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "loading") {
    return <MapSkeleton topic={state.topic} level={state.level} />;
  }

  if (state.kind === "map") {
    return (
      <MapResult
        map={state.map}
        grounding={state.grounding}
        meta={state.meta}
      />
    );
  }

  if (state.kind === "disambiguation") {
    return (
      <section className={CARD}>
        <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Multiple matches for &ldquo;{state.title}&rdquo;
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick the page you meant. The map will use that specific article.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.candidates.map((c) => (
            <button
              key={c.title}
              type="button"
              onClick={() => onPickCandidate(c.title)}
              className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
            >
              <div className="font-serif font-medium text-foreground">
                {c.title}
              </div>
              {c.description && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {c.description}
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (state.kind === "not_found") {
    const hasSuggestions = state.suggestions && state.suggestions.length > 0;
    return (
      <section className={CARD}>
        <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          No Wikipedia article for &ldquo;{state.title}&rdquo;
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasSuggestions
            ? "Did you mean one of these?"
            : "Check spelling or try a different topic."}
        </p>
        {hasSuggestions && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.suggestions.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => onPickCandidate(s.title)}
                className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
              >
                <div className="font-serif font-medium text-foreground">
                  {s.title}
                </div>
                {s.description && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {s.description}
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

  if (state.kind === "ai_failed") {
    return (
      <section className={CARD}>
        <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Couldn&rsquo;t build the learning map
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The AI service failed twice. Here&rsquo;s the Wikipedia source we
          fetched so you can still explore the topic.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="font-serif font-semibold text-foreground">
            {state.fallback.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            {state.fallback.summary}
          </p>
          <a
            href={state.fallback.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center text-sm font-medium text-emerald-700 hover:underline"
          >
            Read on Wikipedia →
          </a>
          {state.fallback.candidateLinks.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                {state.fallback.candidateLinks.length} related articles
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {state.fallback.candidateLinks.slice(0, 30).map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:underline"
                    >
                      {l.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Button onClick={onReset} className={RESET_BTN_CLASSES}>
          Try again
        </Button>
      </section>
    );
  }

  if (state.kind === "rate_limited") {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-amber-900">
          Slow down a moment
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">
          {state.message} The limit is {state.limit} maps per minute per IP to
          keep the demo affordable and the Wikipedia API happy.
        </p>
        <Button
          onClick={onReset}
          className="mt-4 border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
        >
          OK
        </Button>
      </section>
    );
  }

  // state.kind === "error"
  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
      <h2 className="font-serif text-xl font-semibold tracking-tight text-red-700">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-red-700/80">{state.message}</p>
      <Button
        onClick={onReset}
        className="mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50"
      >
        Try again
      </Button>
    </section>
  );
}
