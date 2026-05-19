// Unit test for buildWikiMapPrompt — verifies the audienceLevel param
// flows into the rendered prompt and that different levels produce
// different prompts. Pure function test, no network, no AI calls.
//
// This is the actual safety net for "did someone accidentally break
// audience-level adaptation?" The eval suite tests model outputs end-
// to-end, but the regression we fear (audienceLevel silently dropped
// from the prompt template) shows up here at the build-prompt step.
//
// Run with: npm run test-prompt

import assert from "node:assert/strict";

import { buildWikiMapPrompt } from "../lib/ai/prompt";
import type { WikiContext } from "../lib/wiki";

const baseContext: Omit<WikiContext, "userLevel"> = {
  title: "Machine learning",
  summary: "A field of study in artificial intelligence.",
  canonicalUrl: "https://en.wikipedia.org/wiki/Machine_learning",
  candidateLinks: [{ title: "Artificial intelligence", url: "..." }],
  categories: [],
};

function buildAt(userLevel: WikiContext["userLevel"]) {
  return buildWikiMapPrompt({ ...baseContext, userLevel });
}

const beginner = buildAt("beginner");
const intermediate = buildAt("intermediate");
const advanced = buildAt("advanced");

// Each level string must appear in the rendered prompt. Catches the
// case where the prompt template forgot to interpolate userLevel.
assert.ok(
  beginner.prompt.includes("beginner"),
  "beginner prompt missing 'beginner'",
);
assert.ok(
  intermediate.prompt.includes("intermediate"),
  "intermediate prompt missing 'intermediate'",
);
assert.ok(
  advanced.prompt.includes("advanced"),
  "advanced prompt missing 'advanced'",
);

// The three prompts must be pairwise distinct. Catches the case where
// the prompt builder accepts userLevel but doesn't use it.
assert.notStrictEqual(
  beginner.prompt,
  intermediate.prompt,
  "beginner and intermediate prompts are identical",
);
assert.notStrictEqual(
  intermediate.prompt,
  advanced.prompt,
  "intermediate and advanced prompts are identical",
);
assert.notStrictEqual(
  beginner.prompt,
  advanced.prompt,
  "beginner and advanced prompts are identical",
);

// Also verify userGoal flows through when provided.
const withGoal = buildWikiMapPrompt({
  ...baseContext,
  userLevel: "beginner",
  userGoal: "I have an interview at Microsoft next week.",
});
assert.ok(
  withGoal.prompt.includes("interview at Microsoft"),
  "userGoal not present in prompt when provided",
);

console.log(
  "✓ buildWikiMapPrompt: audienceLevel and userGoal flow through correctly",
);
