"use client";

import { Button } from "@/components/ui/button";

import { CARD, RESET_BTN_CLASSES } from "./styles";

// Rendered when the AI generation throws twice (initial attempt + one
// retry — see route.ts "two retry layers" comment). The user gets the
// raw Wikipedia source + candidate links as a graceful degradation so
// they can still explore the topic.

export function AiFailedCard({
  fallback,
  onReset,
}: {
  fallback: {
    title: string;
    canonicalUrl: string;
    summary: string;
    candidateLinks: Array<{ title: string; url: string }>;
  };
  onReset: () => void;
}) {
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
          {fallback.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          {fallback.summary}
        </p>
        <a
          href={fallback.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center text-sm font-medium text-emerald-700 hover:underline"
        >
          Read on Wikipedia →
        </a>
        {fallback.candidateLinks.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              {fallback.candidateLinks.length} related articles
            </summary>
            <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {fallback.candidateLinks.slice(0, 30).map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 hover:underline"
                  >
                    {link.title}
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
