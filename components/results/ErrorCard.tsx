"use client";

import { Button } from "@/components/ui/button";

// Rendered for the generic { kind: "error" } catch-all — invalid
// request body, network failure during fetch from the client side,
// or any other unexpected error returned with a message string.
// Red palette signals an actual fault (vs amber for rate-limit).

export function ErrorCard({
  message,
  onReset,
}: {
  message: string;
  onReset: () => void;
}) {
  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
      <h2 className="font-serif text-xl font-semibold tracking-tight text-red-700">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-red-700/80">{message}</p>
      <Button
        onClick={onReset}
        className="mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50"
      >
        Try again
      </Button>
    </section>
  );
}
