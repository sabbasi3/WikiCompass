// Numbered learning-path section. The whyThisPath paragraph at the top
// is the flagship feature — explains the ordering rationale (not just
// a list of links). Each step is a numbered circle + title (linked when
// the URL survived verify-then-strip) + a one-sentence reason.

import type { WikiMap } from "@/lib/schemas";

export function LearningPath({
  path,
  whyThisPath,
}: {
  path: WikiMap["learningPath"];
  whyThisPath: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
          <svg
            aria-hidden="true"
            className="h-5 w-5 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Learning path
          </h3>
          <p className="text-sm text-muted-foreground">{path.length} steps</p>
        </div>
      </div>

      <p className="mb-6 border-l-2 border-emerald-200 pl-4 italic leading-relaxed text-muted-foreground">
        {whyThisPath}
      </p>

      <ol className="space-y-0">
        {path.map((s, i) => (
          <li key={s.order} className="group flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-serif text-sm font-semibold text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
              {s.order}
            </div>
            <div
              className={`flex-1 pb-4 ${
                i === path.length - 1 ? "" : "border-b border-border/60"
              } ${i === 0 ? "" : "pt-4"}`}
            >
              <div className="font-serif font-semibold text-foreground transition-colors group-hover:text-emerald-700">
                {s.wikipediaUrl ? (
                  <a
                    href={s.wikipediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {s.reason}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
