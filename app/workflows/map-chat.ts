// "Ask about your map" chat workflow.
//
// Shape: one workflow run per user message (single-turn pattern from the
// Workflow SDK chat-session docs). The DB owns conversation history; the
// workflow's job is to stream one assistant response back to the client
// and persist it when the stream finishes.
//
// Why DurableAgent instead of plain generateText:
//   - Every LLM call becomes a durable step — retried on transient
//     model/gateway failures without us writing the retry loop.
//   - The stream is persistent (getWritable). A tab that drops mid-stream
//     can reconnect via the workflow runId without losing chunks.
//   - Each turn shows up in `npx workflow web` with timing + token usage
//     for free, same observability we already get from quiz-journey.
//
// Tool definitions live in ./chat-tools.ts; prompt construction lives
// in lib/ai/chat-prompt.ts. This file orchestrates: load context, stream,
// persist.

import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import {
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { AI_MODEL } from "@/lib/ai/model";
import { buildChatInstructions, buildMapContext } from "@/lib/ai/chat-prompt";
import { lastAssistantText } from "@/lib/ai/messages";
import {
  getJourney,
  getMapFromJourney,
  insertChatMessage,
} from "@/lib/journey/db";
import type { JourneyLevel } from "@/lib/journey/schema";

import { chatTools } from "./chat-tools";

// ── Steps ────────────────────────────────────────────────────────────

// Pulls the journey + builds the context string the agent sees. Wrapped
// as a step so a workflow replay reads from the event log instead of
// hitting Postgres again. The map doesn't change after day-0 generation,
// so the cached value is always fresh.
async function loadJourneyContext(journeyId: string): Promise<{
  topic: string;
  level: JourneyLevel;
  mapContext: string;
}> {
  "use step";
  const journey = await getJourney(journeyId);
  if (!journey) throw new Error(`Journey ${journeyId} not found`);
  const map = getMapFromJourney(journey);
  return {
    topic: journey.topic,
    level: journey.level,
    mapContext: buildMapContext(map),
  };
}

// Persists the assistant turn after the stream finishes. Pulled into its
// own step so the DB write retries independently if Neon hiccups —
// stream already went to the client, no need to fail the whole workflow.
async function persistAssistantTurn(
  journeyId: string,
  text: string,
): Promise<void> {
  "use step";
  if (!text.trim()) return;
  await insertChatMessage(journeyId, "assistant", text);
}

// ── Workflow ─────────────────────────────────────────────────────────

export async function mapChatWorkflow(input: {
  journeyId: string;
  messages: UIMessage[];
}): Promise<void> {
  "use workflow";

  const { journeyId, messages } = input;
  const writable = getWritable<UIMessageChunk>();

  const { topic, level, mapContext } = await loadJourneyContext(journeyId);

  const chatAgent = new DurableAgent({
    model: AI_MODEL,
    instructions: buildChatInstructions(topic, level, mapContext),
    tools: chatTools,
    // Match the temperature we use for map generation. The chat is
    // explanatory rather than creative — keep it grounded.
    temperature: 0.3,
  });

  const result = await chatAgent.stream({
    messages: await convertToModelMessages(messages),
    writable,
  });

  await persistAssistantTurn(journeyId, lastAssistantText(result.messages));
}
