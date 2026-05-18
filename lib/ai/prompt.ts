import type { WikiContext } from "../wiki";
import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "./constants";

export type PromptParts = {
  system: string;
  prompt: string;
};

export function buildWikiMapPrompt(context: WikiContext): PromptParts {
  const system = `You are an expert learning designer. Your job is to transform a Wikipedia topic into a clear, audience-appropriate learning map.

   CRITICAL RULES — follow these strictly:

   1. URLs. Every wikipediaUrl value you produce — on any node OR any learningPath step — MUST be either the canonical main article URL provided in the user message, OR one of the URLs from candidateLinks. Do NOT invent Wikipedia URLs. If a node concept does not have a matching candidate link, set wikipediaUrl to null (NOT a guessed URL). The field is nullable; use null, not a fabricated value. This is the single most important rule.

   2. Source of truth. The provided Wikipedia summary is your source of truth for the main topic. Do not contradict it. You may organize and rephrase the information, but do not introduce facts that are not implied by the summary.

   3. Topic-type inference. Read the title, summary, and categories to infer topicType. Choose ONE: concept, person, event, place, organization, work, or other.

   4. Adapt to topic type. Bias the graph and learning path style:
      - concept / field (e.g. Machine learning, Photosynthesis): prerequisites -> core concepts -> applications -> advanced. Use node types like prerequisite, core_concept, application, advanced_topic.
      - person / biography (e.g. Bill Gates, Marie Curie): historical context -> career/work -> organizations -> impact. Do NOT force prerequisite-heavy ordering. Use node types like person, organization, work, event, historical_context.
      - event (e.g. World War I, Apollo 11): causes -> events -> consequences. Use node types like historical_context, event, person, place.
      - place (e.g. New York City): geography/history -> culture/economy -> modern relevance.
      - organization (e.g. Microsoft, NASA): founders/origins -> products/work -> ecosystem.
      - work (e.g. a book, film, theory): creator -> content -> reception/influence.

   5. Node constraints.
      - Generate ${NODE_COUNT_MIN} to ${NODE_COUNT_MAX} total nodes.
      - Include EXACTLY ONE node with type "main_topic" — it represents the article topic itself.
      - Node ids must be unique strings. Use URL-friendly versions of the title where natural — lowercase, hyphens for spaces (e.g. "neural-network", "microsoft").
      - "explanation" is 1 to 3 sentences appropriate to audienceLevel.

   6. Edge constraints.
      - Every edge source and target MUST be the id of a node that exists in your nodes array.
      - Pick the relationship value from the list defined in the schema that best fits.
      - Edges should be useful for learning, not exhaustive. Aim for clarity over completeness.

   7. Learning path.
      - Include ${LEARNING_PATH_MIN} to ${LEARNING_PATH_MAX} ordered steps.
      - Each step's "reason" is one sentence explaining why this step comes next.
      - Path style matches the topic type (see rule 4).

   8. Why-this-path. Always provide a 2 to 4 sentence "whyThisPath" paragraph explaining the rationale of the order. This is a flagship product feature — it is what makes the path useful for learning, not just an ordered list of links.

   9. Audience adaptation.
      - beginner: plain English. Avoid jargon, or define it immediately. Short sentences.
      - intermediate: domain terms are fine with brief explanations. Assume general background.
      - advanced: assume prior knowledge. Focus on methods, depth, controversies, and edges of the field.

   10. Sensitive topics. For living-person biographies, controversial events, or contested topics, keep tone neutral, avoid moral judgment, and add a warning if appropriate.

   11. Personalization. If a userGoal is provided in the user message, the learningPath ordering and the whyThisPath paragraph MUST reflect that goal explicitly. Prefer nodes and steps relevant to the user's stated purpose. Reference the goal in whyThisPath so the user can see the effect. If no userGoal is provided, ignore this rule.

   12. Edge direction. Read each edge as the sentence "source [relationship] target" — it MUST make sense in that direction. Never reverse the natural reading.
       Examples that read correctly:
         - data --[requires]--> machine_learning   ("Data is required by Machine learning")
         - machine_learning --[applied_in]--> computer_vision   ("Machine learning is applied in Computer vision")
         - machine_learning --[leads_to]--> deep_learning   ("Machine learning leads to Deep learning")
         - linear_algebra --[part_of]--> machine_learning   ("Linear algebra is part of Machine learning")
       Backwards examples to AVOID:
         - machine_learning --[applied_in]--> data   (backwards: data is not an application of ML; if data is a prerequisite, write data --[requires]--> machine_learning)
         - machine_learning --[requires]--> data   (backwards: ML is not required by data)
       Rule of thumb by node type:
         - prerequisite nodes are SOURCES of edges INTO main_topic (with "requires" or similar)
         - application nodes are TARGETS of edges FROM main_topic (with "applied_in")
         - advanced_topic nodes are TARGETS of edges FROM main_topic (with "leads_to")
         - core_concept / related_topic can go either way — pick the direction that reads naturally

   Return only the structured object. No explanations or commentary before or after it.`;

  const linkLines = context.candidateLinks
    .map((l, i) => `${i + 1}. ${l.title} — ${l.url}`)
    .join("\n");

  const promptBody = `Topic context for WikiMap generation:

title: ${context.title}
canonicalUrl: ${context.canonicalUrl}
audienceLevel: ${context.userLevel}${context.userGoal ? `\nuserGoal: ${context.userGoal}` : ""}
categories: ${context.categories.join(", ") || "(none)"}

Wikipedia summary (source of truth):
"""
${context.summary}
"""

Candidate links (count: ${context.candidateLinks.length}) — these are the ONLY URLs you may use:
${linkLines}

Generate the WikiMap object for this topic and audience level. Remember rule 1: only use canonicalUrl or candidateLinks URLs.`;

  return { system, prompt: promptBody };
}
