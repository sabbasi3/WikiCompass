"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { MapResult } from "@/components/MapResult";
import { MapSkeleton } from "@/components/MapSkeleton";
import type { WikiMapState } from "@/hooks/useWikiMap";

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
    return <MapResult map={state.map} meta={state.meta} />;
  }

  if (state.kind === "disambiguation") {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold">
          Multiple matches for &ldquo;{state.title}&rdquo;
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the page you meant. The map will use that specific article.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.candidates.map((c) => (
            <button
              key={c.title}
              type="button"
              onClick={() => onPickCandidate(c.title)}
              className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            >
              <div className="font-medium">{c.title}</div>
              {c.description && (
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {c.description}
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  if (state.kind === "not_found") {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold">
          No Wikipedia article for &ldquo;{state.title}&rdquo;
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Check spelling or try a different topic.
        </p>
        <Button variant="outline" onClick={onReset} className="mt-4">
          Try again
        </Button>
      </Card>
    );
  }

  if (state.kind === "ai_failed") {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold">
          Couldn&rsquo;t build the learning map
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The AI service failed twice. Here&rsquo;s the Wikipedia source we
          fetched so you can still explore the topic.
        </p>
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="font-medium">{state.fallback.title}</h3>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {state.fallback.summary}
          </p>
          <a
            href={state.fallback.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Read on Wikipedia →
          </a>
          {state.fallback.candidateLinks.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-zinc-500">
                {state.fallback.candidateLinks.length} related articles
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {state.fallback.candidateLinks.slice(0, 30).map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {l.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Button variant="outline" onClick={onReset} className="mt-4">
          Try again
        </Button>
      </Card>
    );
  }

  if (state.kind === "rate_limited") {
    return (
      <Card className="border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
        <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-200">
          Slow down a moment
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/80">
          {state.message} The limit is {state.limit} maps per minute per IP to
          keep the demo affordable and the Wikipedia API happy.
        </p>
        <Button variant="outline" onClick={onReset} className="mt-4">
          OK
        </Button>
      </Card>
    );
  }

  // state.kind === "error"
  return (
    <Card className="border-red-200 p-6 dark:border-red-900/50">
      <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {state.message}
      </p>
      <Button variant="outline" onClick={onReset} className="mt-4">
        Try again
      </Button>
    </Card>
  );
}
