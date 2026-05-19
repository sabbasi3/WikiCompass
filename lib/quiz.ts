// Quiz generation + grounding for the learning-journey feature.
//
// One responsibility: take a WikiMap and a round number, return 3–5
// retention-quiz questions grounded in that map's nodes. Round 1/2/3
// progresses from recognition → recall → application; level (beginner/
// intermediate/advanced) shifts vocabulary and depth at the prompt
// level without changing the question count.
//
// Same verify-then-strip pattern as URL grounding: the prompt instructs
// the model to reference only map nodes, the schema constrains the
// shape, and verifyQuiz() then enforces that referenceNodes are real
// map nodes — stripping any question that hallucinates a concept.

import { Output, generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import { AI_FALLBACK_MODELS, AI_MODEL } from "./ai/model";
import type { WikiMap } from "./schemas";
import type { JourneyLevel } from "./journey/schema";

// ── Schema ────────────────────────────────────────────────────────────

export const quizQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  prompt: z.string().min(10).max(500),
  answer: z.string().min(1).max(500),
  // Node titles this question is testing. Used by verifyQuiz to drop
  // questions referencing concepts the model invented. min(1) forces
  // the model to ground every question in at least one real node.
  referenceNodes: z.array(z.string().max(150)).min(1).max(5),
});

export const quizSchema = z.object({
  round: z.number().int().min(1).max(3),
  difficulty: z.enum(["recognition", "recall", "application"]),
  questions: z.array(quizQuestionSchema).min(3).max(5),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Quiz = z.infer<typeof quizSchema>;

// ── Round → difficulty mapping ────────────────────────────────────────
// Round number is the schedule axis (when to send). Difficulty is the
// pedagogical axis (what to ask). Keeping them separate lets us tune
// either without touching the other.

export const DIFFICULTY_BY_ROUND: Record<1 | 2 | 3, Quiz["difficulty"]> = {
  1: "recognition", // can you spot the right answer among options?
  2: "recall", // can you produce the answer unprompted?
  3: "application", // can you explain how concepts connect?
};

// ── Prompt ────────────────────────────────────────────────────────────

const DIFFICULTY_INSTRUCTIONS: Record<Quiz["difficulty"], string> = {
  recognition: `Write recognition-level questions. Each question should have a clear, single
correct answer the learner can pick out from the map's nodes. Format the question
so the answer is one node title or a short phrase from the summary. Example:
"Which concept enables a model to improve from labeled training examples?"`,
  recall: `Write recall-level questions. The learner should produce the answer from memory
without options. One or two sentences. Reference 1–2 nodes per question. Example:
"What does Backpropagation do in a Neural network, and why is it needed?"`,
  application: `Write application-level questions. Each question asks the learner to explain a
relationship between two named nodes, or apply a concept to a scenario the map
covers. Multi-sentence answers expected. Reference 2–3 nodes per question. Example:
"Explain how Supervised learning relates to Neural networks through Gradient descent."`,
};

const LEVEL_GUIDANCE: Record<JourneyLevel, string> = {
  beginner:
    "Use plain language. Avoid jargon the map didn't introduce. Favor concrete examples over formal definitions.",
  intermediate:
    "Use domain vocabulary the map establishes. Questions can assume the learner understands the foundational nodes.",
  advanced:
    "Press on subtleties and edge cases. Questions can compare nodes, ask about trade-offs, or reference relationships between concepts.",
};

export function buildQuizPrompt(
  map: WikiMap,
  round: 1 | 2 | 3,
  level: JourneyLevel,
): { system: string; prompt: string } {
  const difficulty = DIFFICULTY_BY_ROUND[round];

  const system = `You write retention-quiz questions for a learner who studied a Wikipedia-grounded
learning map.

Hard rules:
- Every question must be answerable using only the concepts in the provided node list.
- Every question's "referenceNodes" array must contain node titles that appear
  EXACTLY (case-sensitive) in the provided node list. Do not invent or paraphrase.
- Do not introduce concepts outside the map. If a concept isn't in the nodes list
  or the summary, do not ask about it.
- Output 3–5 questions total.

${DIFFICULTY_INSTRUCTIONS[difficulty]}

Audience: ${level}. ${LEVEL_GUIDANCE[level]}`;

  const nodeList = map.nodes.map((n) => `- ${n.title} (${n.type})`).join("\n");
  const pathList = map.learningPath
    .map((p) => `${p.order}. ${p.title}`)
    .join("\n");

  const prompt = `Topic: ${map.topic}
Topic type: ${map.topicType}
Audience level: ${level}
Round: ${round} (${difficulty})

Summary:
${map.summary}

Nodes from the learner's map (use these exact titles in referenceNodes):
${nodeList}

Learning path order:
${pathList}

Write ${difficulty}-level questions for round ${round}. Reference real node titles
from the list above. Each question must include a complete answer.`;

  return { system, prompt };
}

// ── Generation ────────────────────────────────────────────────────────

export type GenerateQuizResult = {
  quiz: Quiz;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
};

export async function generateQuiz(
  map: WikiMap,
  round: 1 | 2 | 3,
  level: JourneyLevel,
  modelOverride?: string,
): Promise<GenerateQuizResult> {
  const { system, prompt } = buildQuizPrompt(map, round, level);
  const primaryModelId = modelOverride ?? AI_MODEL;
  const modelsToTry = [
    primaryModelId,
    ...AI_FALLBACK_MODELS.filter((id) => id !== primaryModelId),
  ];
  const startMs = Date.now();
  const result = await generateText({
    model: gateway(primaryModelId),
    system,
    prompt,
    // Same temperature as map generation. Quiz writing benefits from a
    // tiny bit of variability so successive rounds don't ask near-
    // identical questions, but stays low enough to keep grounding tight.
    temperature: 0.3,
    output: Output.object({ schema: quizSchema }),
    providerOptions: {
      gateway: { models: modelsToTry },
    },
  });
  return {
    quiz: result.output,
    usage: result.usage,
    latencyMs: Date.now() - startMs,
  };
}

// ── Verification ──────────────────────────────────────────────────────
// Strips questions whose referenceNodes contain any title not present
// in the map. The model usually obeys the prompt, but the strip step is
// the safety net — same defense-in-depth pattern as URL verification.

export type VerifyQuizResult = {
  quiz: Quiz;
  strippedCount: number;
  // Server log only — names the questions that got dropped and why.
  strippedReasons: Array<{ questionId: string; unknownNode: string }>;
};

// Normalization for tolerant matching — the model sometimes paraphrases
// "Shakespeare" as "William Shakespeare" or "Hamlet" as "Hamlet (play)",
// which is functionally the same concept but fails exact-string equality.
// Three-tier match per referenced title:
//   1. Exact normalized match (lowercase + trimmed + whitespace-collapsed)
//   2. Parenthetical stripping — "Hamlet (play)" ↔ "Hamlet"
//   3. Substring containment — "William Shakespeare" ⊃ "Shakespeare"
// If any tier matches against any real node, we keep the reference.
// This trades strict grounding for usability — wildly hallucinated
// concepts still get caught because no substring relationship will hold.
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

function referenceMatches(
  ref: string,
  normalizedNodeTitles: string[],
): boolean {
  const refNorm = normalize(ref);
  const refStripped = normalize(stripParens(ref));
  return normalizedNodeTitles.some((nodeTitle) => {
    if (nodeTitle === refNorm) return true;
    const nodeStripped = normalize(stripParens(nodeTitle));
    if (nodeStripped === refStripped) return true;
    // Substring either direction — guards both "Shakespeare" → "William
    // Shakespeare" (ref contains node) and "Hamlet" → "Hamlet, Prince of
    // Denmark" (node contains ref).
    return refNorm.includes(nodeTitle) || nodeTitle.includes(refNorm);
  });
}

export function verifyQuiz(quiz: Quiz, map: WikiMap): VerifyQuizResult {
  const normalizedNodeTitles = map.nodes.map((n) => normalize(n.title));
  const kept: QuizQuestion[] = [];
  const strippedReasons: VerifyQuizResult["strippedReasons"] = [];

  for (const question of quiz.questions) {
    const unknown = question.referenceNodes.find(
      (title) => !referenceMatches(title, normalizedNodeTitles),
    );
    if (unknown) {
      strippedReasons.push({ questionId: question.id, unknownNode: unknown });
      continue;
    }
    kept.push(question);
  }

  return {
    quiz: { ...quiz, questions: kept },
    strippedCount: strippedReasons.length,
    strippedReasons,
  };
}
