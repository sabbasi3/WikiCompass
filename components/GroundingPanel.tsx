// Footer transparency panel. Shows "Cited N of M candidate articles" and
// an expandable list of the cited URLs. Production-transparency UI: proves
// the model classified a bounded, verifiable source set — didn't invent
// the graph. The grounding data itself is server-computed (see
// computeGrounding in lib/validation.ts); this component just renders it.

import type { Grounding } from "@/lib/schemas";

export function GroundingPanel({ grounding }: { grounding: Grounding }) {
  return (
    <div className="space-y-2 text-center text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground/70">
          Grounded in Wikipedia.
        </span>{" "}
        Main article:{" "}
        <span className="font-medium text-foreground/70">
          {grounding.mainArticleTitle}
        </span>
        . Cited{" "}
        <span className="font-medium text-foreground/70">
          {grounding.selectedConceptCount}
        </span>{" "}
        of{" "}
        <span className="font-medium text-foreground/70">
          {grounding.candidateLinkCount}
        </span>{" "}
        candidate Wikipedia articles.
      </p>
      {grounding.selectedConcepts.length > 0 && (
        <details className="mx-auto inline-block text-left">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show the {grounding.selectedConcepts.length} cited articles
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {grounding.selectedConcepts.map((concept) => (
              <li key={concept.title}>
                <a
                  href={concept.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/70 transition-colors hover:text-emerald-700 hover:underline"
                >
                  {concept.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs">
        Concepts in the map without a source link couldn&rsquo;t be matched to
        one of the candidate articles.
      </p>
      <p className="pt-2 text-xs italic">
        Generated from Wikipedia metadata and AI classification. Verify
        important information from linked sources.
      </p>
    </div>
  );
}
