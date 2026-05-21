// The "Skip ahead" button on the JourneyTimeline. The only piece of
// the timeline that needs JavaScript — fires a POST against the
// journey action route, then reloads the page so the new quiz row
// shows up.
//
// Extracted so JourneyTimeline can render as a Server Component while
// this button stays a client island. Smaller hydration footprint on
// the journey page.

"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SkipButton({
  journeyId,
  token,
}: {
  journeyId: string;
  token: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSkip() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/journey/${journeyId}/action?action=skip&token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        // 409 means the workflow wasn't currently waiting on a hook —
        // most often because the page is stale (workflow already
        // advanced past this sleep). Reload to pick up the real state
        // instead of showing a confusing "could not be applied"
        // message. Other errors still surface inline.
        if (res.status === 409) {
          location.reload();
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        setPending(false);
        return;
      }
      // Workflow runs out-of-band — give it a beat for the quiz to be
      // written, then refresh to pick up the new row.
      setTimeout(() => location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={handleSkip}
        disabled={pending}
      >
        {pending ? "Skipping…" : "Skip ahead"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
