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
// V1 has no tools — the map context is baked into the system prompt.
// Adding tools (lookupNode, fetchWikipediaSection, etc.) is a one-file
// change later.

import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { AI_MODEL } from "@/lib/ai/model";
import {
  getJourney,
  getMapFromJourney,
  insertChatMessage,
} from "@/lib/journey/db";
import type { WikiMap } from "@/lib/schemas";
import type { JourneyLevel } from "@/lib/journey/schema";

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

// ── Helpers ──────────────────────────────────────────────────────────

// Compact map dump that fits in a system prompt. We could pull the full
// nodes[] (with explanations) but for a chat panel the titles + path are
// enough — the model already knows the topic from the summary, and node
// titles + relationships drive most "what was X again?" follow-ups.
function buildMapContext(map: WikiMap): string {
  const nodeList = map.nodes.map((n) => `- ${n.title} (${n.type})`).join("\n");
  const pathList = map.learningPath
    .map((p) => `${p.order}. ${p.title} — ${p.reason}`)
    .join("\n");
  return `MAP SUMMARY:
${map.summary}

NODES IN THE MAP:
${nodeList}

LEARNING PATH ORDER:
${pathList}

KEY TAKEAWAY:
${map.keyTakeaway}`;
}

function buildInstructions(
  topic: string,
  level: JourneyLevel,
  mapContext: string,
): string {
  return `You are a friendly tutor helping a learner study "${topic}". They have already worked through the following learning map at the ${level} level:

${mapContext}

When they ask follow-up questions:
- Stay grounded in the map's concepts and the topic. Reference nodes from the map by name when relevant ("As you saw in the X node...").
- Match the learner's level (${level}): adjust vocabulary and depth accordingly. Beginner = plain language, intermediate = domain terms with quick definitions, advanced = assume prior knowledge.
- Keep answers concise (2–4 short paragraphs max) unless the question genuinely needs more depth.
- If a question is off-topic, gently redirect to the topic and offer a related concept from the map.

You are a chat partner, not a lecturer. Be conversational and direct.`;
}

// Extracts the assistant text from the final ModelMessage in the agent's
// result. ModelMessage.content can be string or array of parts; we flatten
// any text parts and concat. Non-text parts (tool calls, etc.) don't apply
// in V1 since the agent has no tools.
function extractAssistantText(messages: ModelMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return "";
  if (typeof last.content === "string") return last.content;
  return last.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
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

  const agent = new DurableAgent({
    model: AI_MODEL,
    instructions: buildInstructions(topic, level, mapContext),
    // Match the temperature we use for map generation. The chat is
    // explanatory rather than creative — keep it grounded.
    temperature: 0.3,
  });

  const result = await agent.stream({
    messages: await convertToModelMessages(messages),
    writable,
  });

  await persistAssistantTurn(journeyId, extractAssistantText(result.messages));
}
