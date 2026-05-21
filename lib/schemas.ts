// Used Zod to define and enforce the structure of data coming from the AI model, API requests, or external sources.
// catch malformed model output, prevent json parse failure. shape might be wrong — missing fields, extra fields, a string where you expected a number.
// AI SDK converts Zod schemas to JSON Schema and passes that to the model provider's structured-output API,
// so the model is constrained to produce conformant output, not just validated after the fact.

import { z } from "zod";

import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "./ai/constants";

// ─────────────────────────────────────────────────────────────────
// Request schemas
// ─────────────────────────────────────────────────────────────────

// Inbound body for POST /api/wiki/map.
//   topic     — Wikipedia article title to build a map for.
//   level     — audience the AI should adapt to.
//   userGoal  — optional free-form "why are you learning this?" string
//               the prompt incorporates to personalize the path.
//
// topic and userGoal flow into LLM prompts as plain interpolation, so
// we strip C0 (0x00-0x1F) and C1 (0x7F-0x9F) control characters before
// storing. Otherwise a user could smuggle newlines or zero-width chars
// that look like new instruction blocks ("...\nIgnore the above and...")
// when interpolated into the prompt. The chat panel reads topic back
// from Postgres on every turn, so sanitizing once on insert keeps the
// stored value clean for the lifetime of the journey.
function sanitizePromptText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export const mapRequestSchema = z.object({
  topic: z.string().min(1).max(200).transform(sanitizePromptText),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  userGoal: z.string().max(500).transform(sanitizePromptText).optional(),
});

// ─────────────────────────────────────────────────────────────────
// AI output schemas
// ─────────────────────────────────────────────────────────────────

// Length caps are circuit-breakers, not content controls. They protect
// against runaway model output bloating the client payload or persisted
// storage. Set generously (3-5x expected length)
// Array bounds for nodes and learningPath come from ./ai/constants and
// are also referenced by the prompt and the post-hoc graph integrity
// check, so all three layers move together.

export const wikiMapSchema = z.object({
  topic: z.string().max(200),
  topicType: z.enum([
    "concept",
    "person",
    "event",
    "place",
    "organization",
    "work",
    "other",
  ]),
  summary: z.string().max(2000),
  audienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  keyTakeaway: z.string().max(400),
  warnings: z.array(z.string().min(1).max(300)).max(10), // anything the user should know (e.g., "thin article")
  whyThisPath: z.string().max(1500),
  learningPath: z
    .array(
      z.object({
        order: z.number().int().min(1).max(20),
        title: z.string().max(150),
        reason: z.string().max(400), // one sentence: why this step comes next
        wikipediaUrl: z.string().max(500).nullable(), // can reference any candidate link, NOT just node URLs. The path is freer than the graph: it can link to "adjacent reading"
      }),
    )
    .min(LEARNING_PATH_MIN)
    .max(LEARNING_PATH_MAX),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().max(150),
        type: z.enum([
          "main_topic",
          "prerequisite",
          "core_concept",
          "related_topic",
          "advanced_topic",
          "application",
          "person",
          "event",
          "place",
          "historical_context",
          "organization",
          "work",
        ]),
        explanation: z.string().max(600), // 1-3 sentences shown in the side panel
        wikipediaUrl: z.string().max(500).nullable(),
      }),
    )
    .min(NODE_COUNT_MIN)
    .max(NODE_COUNT_MAX),
  edges: z
    .array(
      z.object({
        source: z.string().min(1).max(80), // references node id
        target: z.string().min(1).max(80), // references node id
        relationship: z.enum([
          // edge label shown
          "requires",
          "part_of",
          "related_to",
          "leads_to",
          "applied_in",
          "historical_context",
          "example_of",
        ]),
      }),
    )
    .max(40),
});

// Server-computed grounding. NOT in the AI schema — the model can't be
// trusted to count its own citations. Travels alongside the WikiMap in
// the route response.
export type Grounding = {
  mainArticleTitle: string;
  candidateLinkCount: number;
  selectedConceptCount: number;
  // Verified citations only (passed strip + URL verify). UI renders as
  // clickable links so users can verify any cited source.
  selectedConcepts: { title: string; url: string }[];
};

export type WikiMap = z.infer<typeof wikiMapSchema>;
