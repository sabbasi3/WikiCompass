import { z } from "zod";

export const wikiMapSchema = z.object({
  topic: z.string(),
  topicType: z.enum([
    "concept",
    "person",
    "event",
    "place",
    "organization",
    "work",
    "other",
  ]),
  summary: z.string(),
  audienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  keyTakeaway: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()),
  whyThisPath: z.string(),
  learningPath: z.array(
    z.object({
      order: z.number(),
      title: z.string(),
      reason: z.string(),
      wikipediaUrl: z.string().nullable(),
    }),
  ),
  nodes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
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
      explanation: z.string(),
      wikipediaUrl: z.string().nullable(),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      relationship: z.enum([
        "requires",
        "part_of",
        "related_to",
        "leads_to",
        "applied_in",
        "historical_context",
        "example_of",
      ]),
    }),
  ),
  grounding: z.object({
    mainArticleTitle: z.string(),
    candidateLinkCount: z.number(),
    selectedConceptCount: z.number(),
    selectedTitles: z.array(z.string()),
  }),
});

export type WikiMap = z.infer<typeof wikiMapSchema>;
