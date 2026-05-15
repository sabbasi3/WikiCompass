import { z } from "zod";

import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "./constants";

// Length caps are circuit-breakers, not content controls. They protect
// against runaway model output bloating the client payload or persisted
// storage. Set generously (3-5x expected length) so well-behaved
// generations never trip them - the cap only fires on genuinely
// pathological output. Fields under `grounding.*` are intentionally
// unbounded because the route overwrites them server-side from context.
//
// Array bounds for nodes and learningPath come from ./constants and
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
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().min(1).max(300)).max(10), // anything the user should know (e.g., "thin article")
  whyThisPath: z.string().max(1500),
  learningPath: z
    .array(
      z.object({
        order: z.number().int().min(1).max(20),
        title: z.string().max(150),
        reason: z.string().max(400), // one sentence: why this step comes next
        wikipediaUrl: z.string().max(500).nullable(),  // can reference any candidate link, NOT just node URLs. The path is freer than the graph: it can link to "adjacent reading"
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
  grounding: z.object({
    mainArticleTitle: z.string(),
    candidateLinkCount: z.number(), // how many links we fetched from Wikipedia
    selectedConceptCount: z.number(), // how many made it into the map
    selectedTitles: z.array(z.string()),
  }),
});

export type WikiMap = z.infer<typeof wikiMapSchema>;
