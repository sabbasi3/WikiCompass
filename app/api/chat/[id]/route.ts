// GET  /api/chat/[id]  — load conversation history for hydration
// POST /api/chat/[id]  — send a new user message, stream the assistant reply
//
// Single-turn workflow pattern (Workflow SDK chat-session docs): each
// POST kicks a fresh workflow run that handles one assistant turn and
// dies. The DB owns history; the client sends the full UIMessage[]
// with each POST so the agent has the full context for that turn.
//
// Auth: same envelope as the journey status page itself — the journey
// URL is public-by-knowledge, so we don't gate by token here. The rate
// limiter protects against drive-by chat spam on someone else's
// journey id.

import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { textFromUIMessage } from "@/lib/ai/messages";
import {
  getChatHistory,
  getJourney,
  insertChatMessage,
} from "@/lib/journey/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapChatWorkflow } from "@/app/workflows/map-chat";

// ── GET: chat history ──────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await params;
  const journey = await getJourney(journeyId);
  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }
  const rows = await getChatHistory(journeyId);
  return NextResponse.json({
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

// ── POST: send message, stream reply ───────────────────────────────────

// useChat sends UIMessage[] in the body — minimal shape we need to
// validate so a malicious caller can't pass arbitrary roles or huge
// payloads. The workflow re-validates internally via convertToModelMessages.
const postBodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z
          .array(
            z.object({
              type: z.string(),
              text: z.string().optional(),
            }),
          )
          .optional(),
        content: z.string().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await params;

  // ── Rate limit ───────────────────────────────────────────────────────
  // Chat is cheap per message but unbounded across messages — keep the
  // same per-IP envelope we use everywhere else so a guessed journey id
  // can't be used to burn through gateway credits.
  const rate = await checkRateLimit(req);
  if (!rate.ok) return rate.response;

  // ── Journey existence check ──────────────────────────────────────────
  const journey = await getJourney(journeyId);
  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  // ── Body parsing ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const messages = parsed.data.messages as UIMessage[];

  // ── Sanitize messages to text-only parts ─────────────────────────────
  // useChat keeps the full UIMessage shape in its in-memory state, which
  // includes step-start/step-finish/tool-call/tool-result parts emitted
  // by the agent during the prior turn. Those parts make
  // convertToModelMessages reject the whole array on the next turn with
  // AI_InvalidPromptError. We only ever persist text to the DB anyway,
  // so the canonical conversation is just text per turn — strip the rest
  // before the workflow sees it. This is the same shape the DB-hydrated
  // history uses on a cold reload, which is why reloads worked but
  // same-session follow-ups didn't.
  const sanitizedMessages: UIMessage[] = messages.map((m) => ({
    ...m,
    parts: (m.parts ?? []).filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    ),
  }));

  // ── Persist the latest user message ──────────────────────────────────
  // The workflow handles persisting the assistant turn after it streams,
  // but we own user-message persistence so a workflow failure doesn't
  // lose the user's input. Extract text from parts (UIMessage shape) or
  // fall back to .content (older message format).
  const lastUserMessage = [...sanitizedMessages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMessage) {
    const text = textFromUIMessage(lastUserMessage);
    if (text.trim()) {
      await insertChatMessage(journeyId, "user", text);
    }
  }

  // ── Kick the workflow ────────────────────────────────────────────────
  try {
    const run = await start(mapChatWorkflow, [
      { journeyId, messages: sanitizedMessages },
    ]);
    return createUIMessageStreamResponse({
      stream: run.readable,
      headers: {
        ...rate.headers,
        "x-workflow-run-id": run.runId,
      },
    });
  } catch (err) {
    console.error(
      `[chat/${journeyId}] workflow start failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Failed to start chat workflow" },
      { status: 502, headers: rate.headers },
    );
  }
}
