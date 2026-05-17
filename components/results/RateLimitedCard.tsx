"use client";

import { Button } from "@/components/ui/button";

// Rendered when the per-IP sliding-window rate limiter rejected the
// request. Warm amber palette — this is a "slow down" message, not an
// error. Includes the configured limit so the user knows the ceiling.

export function RateLimitedCard({
  message,
  limit,
  onReset,
}: {
  message: string;
  limit: number;
  onReset: () => void;
}) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <h2 className="font-serif text-xl font-semibold tracking-tight text-amber-900">
        Slow down a moment
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-amber-800">
        {message} The limit is {limit} maps per minute per IP to keep the demo
        affordable and the Wikipedia API happy.
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
