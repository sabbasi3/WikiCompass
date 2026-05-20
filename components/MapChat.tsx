// "Ask about your map" chat panel.
//
// Wraps the AI SDK's useChat with @workflow/ai's WorkflowChatTransport
// so each user message kicks a durable workflow run, the assistant
// response streams in token-by-token, and a dropped tab can reconnect
// to the in-flight workflow without losing chunks.
//
// History lives in the chat_messages table; we hydrate on mount via
// GET /api/chat/[id] so a page reload still shows the conversation.
// New turns get persisted server-side: user message in the POST route
// before the workflow kicks, assistant message in a "use step" after
// agent.stream finishes (see app/workflows/map-chat.ts).

"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import { useEffect, useMemo, useState } from "react";
import type { UIMessage } from "ai";

import { Button } from "@/components/ui/button";

type HydratedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function toUIMessage(row: HydratedMessage): UIMessage {
  return {
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
  };
}

export function MapChat({ journeyId }: { journeyId: string }) {
  const [hydrated, setHydrated] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  // Hydrate history once on mount. We only set initialMessages before
  // useChat mounts so subsequent reloads don't fight with the SDK's
  // internal state. If the fetch fails we still let the user chat —
  // just without past history.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat/${journeyId}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { messages: HydratedMessage[] };
        if (cancelled) return;
        setInitialMessages(data.messages.map(toUIMessage));
      } catch (err) {
        if (cancelled) return;
        setHydrationError(
          err instanceof Error ? err.message : "Failed to load history",
        );
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [journeyId]);

  if (!hydrated) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        Loading chat…
      </div>
    );
  }

  return (
    <ChatPanel
      journeyId={journeyId}
      initialMessages={initialMessages}
      hydrationError={hydrationError}
    />
  );
}

// Split into its own component so the transport is created exactly once
// per (journeyId, initialMessages) — useChat doesn't allow swapping
// transports after mount. The outer MapChat handles the async hydration
// and only mounts ChatPanel once history is in hand.
function ChatPanel({
  journeyId,
  initialMessages,
  hydrationError,
}: {
  journeyId: string;
  initialMessages: UIMessage[];
  hydrationError: string | null;
}) {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () => new WorkflowChatTransport({ api: `/api/chat/${journeyId}` }),
    [journeyId],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
  });

  // Local-only — collapsed state doesn't survive reload by design. The
  // chat is the centerpiece of this layout, so default to expanded each
  // visit. If a user wants to read the map without the panel, the
  // chevron is one click away.
  const [collapsed, setCollapsed] = useState(false);

  const isSending = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput("");
    sendMessage({ text: trimmed });
  }

  return (
    <section className="flex flex-col rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
        <h2 className="text-base font-semibold text-neutral-900">
          Ask about your map
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand chat" : "Collapse chat"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <Chevron direction={collapsed ? "down" : "up"} />
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="flex max-h-[480px] min-h-[200px] flex-col gap-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-500">
                Ask anything about the topic — &ldquo;explain X in plain
                English,&rdquo; &ldquo;how does Y relate to Z?&rdquo;, etc.
              </p>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {hydrationError && (
              <p className="text-xs text-amber-700">
                Couldn&apos;t load prior history ({hydrationError}). You can
                still chat — just past turns from this journey aren&apos;t
                shown.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-700">
                {error.message || "Something went wrong sending that message."}
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-neutral-200 px-3 py-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isSending ? "Streaming response…" : "Ask a follow-up question…"
              }
              disabled={isSending}
              className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-neutral-100"
            />
            <Button type="submit" disabled={!input.trim() || isSending}>
              {isSending ? "…" : "Send"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={direction === "up" ? "" : "rotate-180"}
    >
      <path
        d="M3 9L7 5L11 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("");

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2 text-sm text-white whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-sm text-neutral-900 whitespace-pre-wrap">
        {text || <span className="text-neutral-400 italic">thinking…</span>}
      </div>
    </div>
  );
}
