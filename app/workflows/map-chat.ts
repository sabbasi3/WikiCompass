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
// One tool — fetchWikipediaExtract — for questions where the map's 1-3
// sentence node explanations aren't deep enough (specific events, dates,
// quotes, character relationships). The tool's underlying fetch is a
// "use step" so it shows up in workflow web with timing + retries, same
// observability as the rest of the workflow.

import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import {
  convertToModelMessages,
  tool,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";

import { AI_MODEL } from "@/lib/ai/model";
import { fetchWikipediaSummary, WIKI_BASE } from "@/lib/wiki/api";
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

// Tool implementation. Uses the MediaWiki extracts API to pull a chunk
// of plain-text article content (capped at ~2500 chars). Each call is a
// durable step — retried on Wikipedia 503s, individually visible in
// workflow web. Soft-fails to a string the model can interpret rather
// than throwing, because the agent loop handles "this tool didn't find
// anything" better than it handles "the workflow died."
const TOOL_EXTRACT_CHAR_CAP = 2500;
async function fetchWikipediaExtractStep(title: string): Promise<
  | {
      resolvedTitle: string;
      extract: string;
      canonicalUrl: string;
    }
  | { error: string }
> {
  "use step";
  const trimmed = title.trim();
  if (!trimmed) return { error: "title was empty" };
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exchars: String(TOOL_EXTRACT_CHAR_CAP),
    titles: trimmed,
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  const url = `${WIKI_BASE}/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "WikiCompass/1.0 (https://github.com/SafanAbbasi/WikiCompass; chat-tool)",
      Accept: "application/json",
    },
    cache: "force-cache",
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return { error: `Wikipedia returned ${res.status}` };
  }
  const data = (await res.json()) as {
    query?: {
      pages?: Array<{ title?: string; extract?: string; missing?: boolean }>;
    };
  };
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) {
    // Fall back to summary endpoint — sometimes the extracts API returns
    // nothing for redirected titles even with redirects=1.
    try {
      const summary = await fetchWikipediaSummary(trimmed);
      return {
        resolvedTitle: summary.title,
        extract: summary.extract,
        canonicalUrl: summary.canonicalUrl,
      };
    } catch {
      return { error: `No Wikipedia article found for "${trimmed}"` };
    }
  }
  const resolvedTitle = page.title ?? trimmed;
  return {
    resolvedTitle,
    extract: page.extract,
    canonicalUrl: `${WIKI_BASE}/wiki/${encodeURIComponent(resolvedTitle.replace(/\s+/g, "_"))}`,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

const chatTools = {
  fetchWikipediaExtract: tool({
    description:
      "Fetch a plain-text excerpt (up to ~2500 chars) from the Wikipedia article for a given title. Use this when the user asks for details NOT in the map — specific events, dates, named entities, character relationships, technical depth — and the map's 1-3 sentence node explanations aren't enough to answer accurately. Prefer the map context first; reach for this tool when you'd otherwise have to guess from training data.",
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .max(200)
        .describe(
          "Wikipedia article title to fetch. Usually a node title from the map, but can be any related concept.",
        ),
    }),
    execute: async ({ title }) => fetchWikipediaExtractStep(title),
  }),
};

// ── Helpers ──────────────────────────────────────────────────────────

// Full map dump for the chat agent's system prompt — same content that
// drives the visible map UI, just serialized as text. Including the 1-3
// sentence node explanations + the edge relationships means the agent
// can answer "what is X?" and "how does X relate to Y?" from the map
// itself, before reaching for the Wikipedia tool.
function buildMapContext(map: WikiMap): string {
  // id → title so edges render with names the user has seen, not raw ids.
  const titleById = new Map(map.nodes.map((n) => [n.id, n.title]));
  const nodeList = map.nodes
    .map((n) => `- ${n.title} (${n.type}): ${n.explanation}`)
    .join("\n");
  const edgeList = map.edges
    .map((e) => {
      const source = titleById.get(e.source) ?? e.source;
      const target = titleById.get(e.target) ?? e.target;
      return `- ${source} → ${e.relationship.replace(/_/g, " ")} → ${target}`;
    })
    .join("\n");
  const pathList = map.learningPath
    .map((p) => `${p.order}. ${p.title} — ${p.reason}`)
    .join("\n");
  return `MAP SUMMARY:
${map.summary}

NODES IN THE MAP (each with a 1-3 sentence explanation):
${nodeList}

RELATIONSHIPS BETWEEN NODES (read as "source [relationship] target"):
${edgeList}

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

You have one tool, fetchWikipediaExtract, that pulls a longer Wikipedia excerpt for a given title. Use it ONLY when the map's content above isn't enough to answer accurately — typically for specific facts (dates, named figures, events), character or concept relationships beyond the edge labels, or technical depth the 1-3 sentence explanations skip. Do not call the tool for questions the map already answers. If you do call it, summarize the result in your own words rather than dumping the extract.

You are a chat partner, not a lecturer. Be conversational and direct.`;
}

// Extracts the assistant text from the final ModelMessage in the agent's
// result. ModelMessage.content can be string or array of parts; we flatten
// any text parts and concat. Tool-call parts in earlier messages are not
// included — we only persist the model's final spoken text to chat history.
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
    tools: chatTools,
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
