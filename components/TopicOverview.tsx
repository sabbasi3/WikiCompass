// Header card for a generated map: topic-type badge, telemetry meta line
// (latency / tokens / retries / verified-URL count), topic title, key
// takeaway, and the Wikipedia summary we used as source of truth.

import type { WikiMap } from "@/lib/schemas";
import type { MapMeta } from "@/hooks/useWikiMap";

export function TopicOverview({ map, meta }: { map: WikiMap; meta: MapMeta }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {map.topicType}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {(meta.latencyMs / 1000).toFixed(1)}s
          {meta.usage?.totalTokens
            ? ` · ${meta.usage.totalTokens.toLocaleString()} tokens`
            : ""}
          {meta.retries > 0 ? ` · ${meta.retries} retry` : ""}
          {meta.verifiedUrls > 0 ? ` · ${meta.verifiedUrls} verified` : ""}
        </span>
      </div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
        {map.topic}
      </h2>
      <p className="mt-4 leading-relaxed text-foreground/80">
        {map.keyTakeaway}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {map.summary}
      </p>
    </section>
  );
}
