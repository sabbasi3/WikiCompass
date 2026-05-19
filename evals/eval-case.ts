// Everything about evaluating ONE case. The pipeline (Wikipedia → AI →
// verify → strip → grounding) lives in lib/generate-map-response.ts and
// is shared with the production route. This file only declares what a
// case looks like and what we assert about the response.
//
// Each MapResponse kind has its own assertion function. The dispatcher
// switches on the kind and routes to the matching assertions. New
// response kinds added to MapResponse force the compiler to add a
// matching case here.

import {
  generateMapResponse,
  type MapResponse,
} from "../lib/generate-map-response";
import type { WikiMap } from "../lib/schemas";

// ---------- types ----------

export type Level = "beginner" | "intermediate" | "advanced";

export type EvalCase = {
  topic: string;
  level: Level;
  expectedMustInclude?: string[];
  forbidden?: string[];
  expectedBehavior?: "ambiguous" | "not_found";
  // Only meaningful when expectedBehavior is "not_found": verifies the
  // "Did you mean...?" feature returns useful suggestions for a typo.
  expectedSuggestionsInclude?: string[];
  // Only meaningful when expectedBehavior is "ambiguous": verifies the
  // disambiguation merge surfaces specific known-good candidates
  // (e.g. "Machine learning" for "ML", or "Mercury (element)" for
  // "Mercury") — the cases that motivated the merge in the first place.
  expectedCandidatesInclude?: string[];
  // Asserts rule 3 (topic-type inference) classifies correctly.
  // E.g. "Bill Gates" should be "person", not "concept", or rule 4
  // applies the wrong arc.
  expectedTopicType?:
    | "concept"
    | "person"
    | "event"
    | "place"
    | "organization"
    | "work"
    | "other";
  // Asserts rule 11 (personalization) is firing — when present, this
  // userGoal is passed through to the prompt, and expectedGoalEcho
  // asserts the listed keywords appear in whyThisPath.
  userGoal?: string;
  expectedGoalEcho?: string[];
};

// Checks are either "gating" (default) — they contribute to case pass/fail
// and the exit code — or "info" — behavioral signals reported quantitatively
// but not treated as system failures. Coverage misses live here: the model
// didn't err if a concept is absent, it just means the whole pipeline (link
// filter, ordering, prompt, model) didn't surface it on this run.
export type Check = {
  name: string;
  ok: boolean;
  detail?: string;
  kind?: "info";
};

export type CaseResult = {
  topic: string;
  level: Level;
  ms: number;
  tokens?: number;
  checks: Check[];
  whyThisPath?: string; // captured for cross-level audience-adaptation diff
  userGoal?: string; // captured so cross-level grouping can hold userGoal constant
};

// ---------- helpers ----------

const makeCheck = (
  name: string,
  ok: boolean,
  detail: string,
  kind?: "info",
): Check => ({ name, ok, detail, kind });

// Flattens every string in a map into one lowercased blob. Used by the
// coverage + forbidden checks to ask "does this word appear anywhere?"
// Built once per case so both checks share the work.
function buildAllText(map: WikiMap): string {
  return [
    ...map.nodes.map((node) => `${node.title} ${node.explanation}`),
    ...map.learningPath.map((step) => `${step.title} ${step.reason}`),
    map.summary,
    map.keyTakeaway,
    map.whyThisPath,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ---------- assertions per response kind ----------

function assertAmbiguous(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "disambiguation" }>,
): Check[] {
  const checks: Check[] = [
    makeCheck(
      "ambiguous regression",
      true,
      "disambiguation kind returned — UI will show chooser",
    ),
  ];

  // Candidate-coverage assertion: verify the merge surfaces known-good
  // interpretations. Only runs when the case declares them.
  if (
    testCase.expectedCandidatesInclude &&
    testCase.expectedCandidatesInclude.length > 0
  ) {
    const titles = new Set(response.candidates.map((cand) => cand.title));
    const missing = testCase.expectedCandidatesInclude.filter(
      (title) => !titles.has(title),
    );
    checks.push(
      makeCheck(
        "candidate coverage",
        missing.length === 0,
        missing.length === 0
          ? `all ${testCase.expectedCandidatesInclude.length} expected candidate(s) present (${response.candidates.length} total)`
          : `missing: ${missing.join(", ")} (got: ${response.candidates.map((cand) => cand.title).join(", ")})`,
      ),
    );
  }

  return checks;
}

function assertNotFound(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "not_found" }>,
): Check[] {
  const checks: Check[] = [
    makeCheck(
      "not_found regression",
      true,
      "not_found kind returned — UI will show 404 card",
    ),
  ];

  // "Did you mean...?" assertion: typo cases should produce useful
  // suggestions via the opensearch fallback. Only runs when the case
  // explicitly declares expected suggestions.
  if (
    testCase.expectedSuggestionsInclude &&
    testCase.expectedSuggestionsInclude.length > 0
  ) {
    const titles = new Set(response.suggestions.map((sug) => sug.title));
    const missing = testCase.expectedSuggestionsInclude.filter(
      (title) => !titles.has(title),
    );
    checks.push(
      makeCheck(
        "did-you-mean",
        missing.length === 0,
        missing.length === 0
          ? `all ${testCase.expectedSuggestionsInclude.length} expected suggestion(s) present (got: ${response.suggestions.map((sug) => sug.title).join(", ")})`
          : `missing suggestion(s): ${missing.join(", ")} (got: ${response.suggestions.map((sug) => sug.title).join(", ") || "none"})`,
      ),
    );
  }

  return checks;
}

function assertMap(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "map" }>,
): Check[] {
  const checks: Check[] = [];
  const { map, meta } = response;
  const allText = buildAllText(map);

  checks.push(
    makeCheck(
      "schema validity",
      true,
      "Zod-validated by generateText + Output.object",
    ),
  );

  checks.push(
    makeCheck(
      "graph integrity",
      meta.graphIssues.length === 0,
      meta.graphIssues.length === 0
        ? "all edges valid, exactly one main_topic, counts in range"
        : meta.graphIssues.map((issue) => issue.detail).join("; "),
    ),
  );

  // Rule 3 (topic-type inference). A misclassified topic cascades into
  // rule 4 applying the wrong arc (biographies forced into prerequisite-
  // heavy concept structure).
  if (testCase.expectedTopicType) {
    const got = map.topicType;
    const want = testCase.expectedTopicType;
    checks.push(
      makeCheck(
        "topic type",
        got === want,
        got === want ? `inferred "${got}"` : `expected "${want}", got "${got}"`,
      ),
    );
  }

  // Rule 11 (personalization). When the case sets a userGoal, the
  // whyThisPath paragraph should reference that goal explicitly.
  if (testCase.expectedGoalEcho && testCase.expectedGoalEcho.length > 0) {
    const whyThisPathText = (map.whyThisPath ?? "").toLowerCase();
    const missing = testCase.expectedGoalEcho.filter(
      (keyword) => !whyThisPathText.includes(keyword.toLowerCase()),
    );
    checks.push(
      makeCheck(
        "personalization",
        missing.length === 0,
        missing.length === 0
          ? `whyThisPath echoes all ${testCase.expectedGoalEcho.length} goal keyword(s)`
          : `whyThisPath missing goal keyword(s): ${missing.join(", ")}`,
      ),
    );
  }

  // URL grounding: the verify-then-strip pipeline guarantees no user-visible
  // misleading URLs. We report a breakdown — informational, not gating: any
  // non-zero shows the safety net at work, not a system failure.
  checks.push(
    makeCheck(
      "URL grounding",
      true,
      meta.unknownUrls === 0
        ? "model stayed within candidate set (clean)"
        : `${meta.unknownUrls} URL(s) outside candidates → ${meta.verifiedUrls} verified + kept, ${meta.strippedUrls} stripped`,
    ),
  );

  // Coverage is a behavioral signal, not gating. When a concept is absent
  // the system as a whole (often: candidate-link ordering, not the model)
  // failed to surface it. Reported quantitatively for investigation.
  if (testCase.expectedMustInclude && testCase.expectedMustInclude.length > 0) {
    const missing = testCase.expectedMustInclude.filter(
      (term) => !allText.includes(term.toLowerCase()),
    );
    const expected = testCase.expectedMustInclude.length;
    const present = expected - missing.length;
    checks.push(
      makeCheck(
        "coverage",
        true,
        missing.length === 0
          ? `${present}/${expected} expected concepts present`
          : `${present}/${expected} expected concepts present (absent: ${missing.join(", ")})`,
        "info",
      ),
    );
  }

  if (testCase.forbidden && testCase.forbidden.length > 0) {
    const violations = testCase.forbidden.filter((term) =>
      allText.includes(term.toLowerCase()),
    );
    checks.push(
      makeCheck(
        "forbidden absent",
        violations.length === 0,
        violations.length === 0
          ? `none of ${testCase.forbidden.length} forbidden terms appeared`
          : `appeared: ${violations.join(", ")}`,
      ),
    );
  }

  return checks;
}

// Unexpected-kind handler. Used when the response shape doesn't match
// what the case declared. Captures the failure with a one-line summary
// of what actually came back so it's visible in eval output.
function assertUnexpectedKind(
  testCase: EvalCase,
  response: MapResponse,
): Check[] {
  const expected = testCase.expectedBehavior ?? "map";
  return [
    makeCheck(
      `${expected} regression`,
      false,
      `expected ${expected}, got ${response.kind}: ${summarizeResponse(response)}`,
    ),
  ];
}

// One-line summary of a MapResponse for the unexpected-kind detail string.
function summarizeResponse(response: MapResponse): string {
  switch (response.kind) {
    case "map":
      return `map with ${response.map.nodes.length} nodes`;
    case "disambiguation":
      return `${response.candidates.length} candidate(s)`;
    case "not_found":
      return `${response.suggestions.length} suggestion(s)`;
    case "ai_failed":
      return response.message;
    case "error":
      return response.message;
  }
}

// ---------- dispatcher ----------

// Routes a response to the matching assertion set. The case's
// expectedBehavior tells us which kind we want; anything else is a
// regression. Pure function — no side effects, no mutation.
function dispatchAssertions(
  testCase: EvalCase,
  response: MapResponse,
): Check[] {
  const expected = testCase.expectedBehavior;

  if (expected === "ambiguous") {
    return response.kind === "disambiguation"
      ? assertAmbiguous(testCase, response)
      : assertUnexpectedKind(testCase, response);
  }

  if (expected === "not_found") {
    return response.kind === "not_found"
      ? assertNotFound(testCase, response)
      : assertUnexpectedKind(testCase, response);
  }

  // Default: case expects a "map" response.
  return response.kind === "map"
    ? assertMap(testCase, response)
    : assertUnexpectedKind(testCase, response);
}

// ---------- entry point ----------

export async function evalCase(testCase: EvalCase): Promise<CaseResult> {
  const startTime = Date.now();
  const response = await generateMapResponse(
    testCase.topic,
    testCase.level,
    testCase.userGoal,
  );
  return {
    topic: testCase.topic,
    level: testCase.level,
    ms: Date.now() - startTime,
    // whyThisPath + tokens are only populated on the "map" path.
    tokens:
      response.kind === "map" ? response.meta.usage?.totalTokens : undefined,
    whyThisPath: response.kind === "map" ? response.map.whyThisPath : undefined,
    checks: dispatchAssertions(testCase, response),
    userGoal: testCase.userGoal,
  };
}
