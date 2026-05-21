import type { Level } from "@/hooks/useWikiMap";

export function MapSkeleton({ topic, level }: { topic: string; level: Level }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 rounded-md border border-border bg-muted" />
          <div className="h-6 w-32 rounded-md border border-emerald-200 bg-emerald-50" />
        </div>
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-4/5 rounded bg-muted" />
          <div className="h-4 w-3/5 rounded bg-muted" />
        </div>
        <div className="space-y-3 pt-4">
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-background" />
          <div className="h-4 w-5/6 rounded bg-background" />
          <div className="h-4 w-4/6 rounded bg-background" />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Building a{" "}
        <span className="font-medium text-foreground/80">{level}</span> learning
        map for{" "}
        <span className="font-medium text-foreground/80">
          &ldquo;{topic}&rdquo;
        </span>
        … about 5&ndash;10 seconds.
      </p>
    </div>
  );
}
