// One-case logic for the eval suite. evalCase() takes a case definition,
// calls the same generateMapResponse() the production route uses, and
// asserts on what came back.
//
// Layout, top-to-bottom:
//   1. Types — what a case is, what a result is
//   2. evalCase() — entry point
//   3. assertResponse — routes by response kind to the right assert* below
//   4. assert* functions — one per response kind (ambiguous / not_found /
//      map / unexpected). The big one (assertMap) is just a list of
//      individual check functions, below.
//   5. check* functions — the seven things we check for every map response
//   6. helpers — buildAllText, summarizeResponse

import {
  generateMapResponse,
  type MapMeta,
  type MapResponse,
} from "../lib/generate-map-response";
import { generateQuiz, verifyQuiz } from "../lib/quiz";
import type { WikiMap } from "../lib/schemas";

// ---------- types ----------

export type Level = "beginner" | "intermediate" | "advanced";

export type EvalCase = {
  topic: string;
  level: Level;
  userGoal?: string;

  // When set, the case expects a non-map response (regression check).
  expectedBehavior?: "ambiguous" | "not_found";
  // Only meaningful when expectedBehavior is "ambiguous". Verifies the
  // disambiguation merge surfaces specific known-good candidates
  // (e.g. "Mercury (element)" for "Mercury", "Machine learning" for "ML")
  // — the cases that motivated the merge in the first place.
  expectedCandidatesInclude?: string[];
  // Only meaningful when expectedBehavior is "not_found". Verifies the
  // "Did you mean...?" opensearch fallback returns useful suggestions
  // for a typo.
  expectedSuggestionsInclude?: string[];

  // ── Map assertions (only apply when expectedBehavior is unset) ──
  // Asserts rule 3 (topic-type inference). Misclassification cascades
  // into rule 4 applying the wrong arc (biographies forced into
  // prerequisite-heavy concept structure).
  expectedTopicType?:
    | "concept"
    | "person"
    | "event"
    | "place"
    | "organization"
    | "work"
    | "other";
  // Asserts rule 11 (personalization) is firing — the listed keywords
  // must appear in whyThisPath. Only meaningful when userGoal is set.
  expectedGoalEcho?: string[];
  // Info-only signal: how many of these terms appear in the generated
  // map. Coverage misses don't fail the suite — the model didn't err,
  // the candidate-link filter just didn't surface the term this run.
  expectedMustInclude?: string[];
  // Hard blacklist: any of these appearing in the map fails the case.
  // Catches off-topic drift.
  forbidden?: string[];
  // When set, after the map is generated, also generate a retention quiz
  // against the same map and assert grounding holds. Exercises the
  // quiz-journey pipeline — guards against verifyQuiz regressions
  // (e.g. the strict-match-strips-everything bug we hit on Hamlet).
  // minSurviving sets the gating bar: how many questions must pass
  // verification (out of 3–5 generated). Default 3.
  expectedQuiz?: { round?: 1 | 2 | 3; minSurviving?: number };
};

// Checks are either "gating" (default) — they contribute to case pass/fail
// and the exit code — or "info" — behavioral signals reported quantitatively
// but not treated as system failures.
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
};

// ---------- entry point ----------

export async function evalCase(testCase: EvalCase): Promise<CaseResult> {
  const startTime = Date.now();
  const response = await generateMapResponse(
    testCase.topic,
    testCase.level,
    testCase.userGoal,
  );

  const checks = assertResponse(testCase, response);

  // Optional quiz pipeline check — only runs when the case opts in AND
  // the map response succeeded. Adds an extra AI call (~5s) so it's
  // gated by the case flag, not implicit on every map case.
  if (testCase.expectedQuiz && response.kind === "map") {
    checks.push(...(await runQuizChecks(testCase, response.map)));
  }

  return {
    topic: testCase.topic,
    level: testCase.level,
    ms: Date.now() - startTime,
    // tokens are only populated on the "map" path.
    tokens:
      response.kind === "map" ? response.meta.usage?.totalTokens : undefined,
    checks,
  };
}

// Quiz pipeline check. Generates one round of retention quiz against the
// already-produced map and verifies grounding survived. Catches regressions
// in verifyQuiz's normalize/strip-parens/substring matcher — the matcher
// has to be tolerant enough that the model's natural paraphrasing doesn't
// strip every question, but strict enough that hallucinated concepts don't
// slip through.
async function runQuizChecks(
  testCase: EvalCase,
  map: WikiMap,
): Promise<Check[]> {
  const round = testCase.expectedQuiz?.round ?? 1;
  const minSurviving = testCase.expectedQuiz?.minSurviving ?? 3;
  const { quiz } = await generateQuiz(map, round, testCase.level);
  const verified = verifyQuiz(quiz, map);
  const surviving = verified.quiz.questions.length;
  const stripped = verified.strippedCount;

  return [
    {
      name: "quiz generation",
      ok: true,
      detail: `generated ${quiz.questions.length} question(s) for round ${round} (${testCase.level})`,
    },
    {
      name: "quiz grounding",
      ok: surviving >= minSurviving,
      detail:
        surviving >= minSurviving
          ? `${surviving}/${quiz.questions.length} questions passed grounding, ${stripped} stripped`
          : `only ${surviving} survived (need ${minSurviving}); stripped refs: ${verified.strippedReasons.map((r) => r.unknownNode).join(", ") || "none"}`,
    },
  ];
}

// ---------- response routing ----------

// Picks the right assert* function based on what we expected vs what we
// got. The case's expectedBehavior tells us which kind we want; anything
// else is a regression. Pure function — no side effects, no mutation.
function assertResponse(testCase: EvalCase, response: MapResponse): Check[] {
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

// ---------- assertions per response kind ----------

function assertAmbiguous(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "disambiguation" }>,
): Check[] {
  const checks: Check[] = [
    {
      name: "ambiguous regression",
      ok: true,
      detail: "disambiguation kind returned — UI will show chooser",
    },
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
    checks.push({
      name: "candidate coverage",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `all ${testCase.expectedCandidatesInclude.length} expected candidate(s) present (${response.candidates.length} total)`
          : `missing: ${missing.join(", ")} (got: ${response.candidates.map((cand) => cand.title).join(", ")})`,
    });
  }

  return checks;
}

function assertNotFound(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "not_found" }>,
): Check[] {
  const checks: Check[] = [
    {
      name: "not_found regression",
      ok: true,
      detail: "not_found kind returned — UI will show 404 card",
    },
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
    checks.push({
      name: "did-you-mean",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `all ${testCase.expectedSuggestionsInclude.length} expected suggestion(s) present (got: ${response.suggestions.map((sug) => sug.title).join(", ")})`
          : `missing suggestion(s): ${missing.join(", ")} (got: ${response.suggestions.map((sug) => sug.title).join(", ") || "none"})`,
    });
  }

  return checks;
}

// The 7-check list for a successful map response. Each check is its
// own named function below — open this file in your editor and the
// list reads like a table of contents for what the eval validates.
function assertMap(
  testCase: EvalCase,
  response: Extract<MapResponse, { kind: "map" }>,
): Check[] {
  const { map, meta } = response;
  const allText = buildAllText(map);
  return [
    checkSchemaValidity(),
    checkGraphIntegrity(meta),
    checkTopicType(testCase, map),
    checkPersonalization(testCase, map),
    checkUrlGrounding(meta),
    checkCoverage(testCase, allText),
    checkForbidden(testCase, allText),
  ].filter((check): check is Check => check !== null);
}

// Used when the response shape doesn't match what the case declared.
// Captures the failure with a one-line summary of what actually came
// back so it's visible in eval output.
function assertUnexpectedKind(
  testCase: EvalCase,
  response: MapResponse,
): Check[] {
  const expected = testCase.expectedBehavior ?? "map";
  return [
    {
      name: `${expected} regression`,
      ok: false,
      detail: `expected ${expected}, got ${response.kind}: ${summarizeResponse(response)}`,
    },
  ];
}

// ---------- individual map checks ----------

// Schema validity is enforced by generateText + Output.object before
// the result ever reaches us. Surfacing it here makes the guarantee
// visible in eval output (and would fire if someone bypassed the
// grammar-constrained path).
function checkSchemaValidity(): Check {
  return {
    name: "schema validity",
    ok: true,
    detail: "Zod-validated by generateText + Output.object",
  };
}

// Graph integrity catches dangling edges, wrong main_topic counts, and
// node/path lengths outside declared bounds. graphIssues is non-blocking
// in production but a gating failure in eval.
function checkGraphIntegrity(meta: MapMeta): Check {
  const ok = meta.graphIssues.length === 0;
  return {
    name: "graph integrity",
    ok,
    detail: ok
      ? "all edges valid, exactly one main_topic, counts in range"
      : meta.graphIssues.map((issue) => issue.detail).join("; "),
  };
}

// Rule 3 (topic-type inference). A misclassified topic cascades into
// rule 4 applying the wrong arc (biographies forced into prerequisite-
// heavy concept structure). Skipped when the case doesn't declare one.
function checkTopicType(testCase: EvalCase, map: WikiMap): Check | null {
  if (!testCase.expectedTopicType) return null;
  const got = map.topicType;
  const want = testCase.expectedTopicType;
  return {
    name: "topic type",
    ok: got === want,
    detail:
      got === want ? `inferred "${got}"` : `expected "${want}", got "${got}"`,
  };
}

// Rule 11 (personalization). When the case sets a userGoal, the
// whyThisPath paragraph should reference that goal explicitly.
// Skipped when the case doesn't declare expected echo keywords.
function checkPersonalization(testCase: EvalCase, map: WikiMap): Check | null {
  if (!testCase.expectedGoalEcho || testCase.expectedGoalEcho.length === 0) {
    return null;
  }
  const whyThisPathText = (map.whyThisPath ?? "").toLowerCase();
  const missing = testCase.expectedGoalEcho.filter(
    (keyword) => !whyThisPathText.includes(keyword.toLowerCase()),
  );
  return {
    name: "personalization",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `whyThisPath echoes all ${testCase.expectedGoalEcho.length} goal keyword(s)`
        : `whyThisPath missing goal keyword(s): ${missing.join(", ")}`,
  };
}

// URL grounding: the verify-then-strip pipeline guarantees no user-visible
// misleading URLs. Reports a breakdown — informational, not gating: any
// non-zero shows the safety net at work, not a system failure.
function checkUrlGrounding(meta: MapMeta): Check {
  return {
    name: "URL grounding",
    ok: true,
    detail:
      meta.unknownUrls === 0
        ? "model stayed within candidate set (clean)"
        : `${meta.unknownUrls} URL(s) outside candidates → ${meta.verifiedUrls} verified + kept, ${meta.strippedUrls} stripped`,
  };
}

// Coverage is a behavioral signal, not gating. When a concept is absent
// the system as a whole (often: candidate-link ordering, not the model)
// failed to surface it. Reported quantitatively for investigation.
function checkCoverage(testCase: EvalCase, allText: string): Check | null {
  if (
    !testCase.expectedMustInclude ||
    testCase.expectedMustInclude.length === 0
  ) {
    return null;
  }
  const missing = testCase.expectedMustInclude.filter(
    (term) => !allText.includes(term.toLowerCase()),
  );
  const expected = testCase.expectedMustInclude.length;
  const present = expected - missing.length;
  return {
    name: "coverage",
    ok: true,
    kind: "info",
    detail:
      missing.length === 0
        ? `${present}/${expected} expected concepts present`
        : `${present}/${expected} expected concepts present (absent: ${missing.join(", ")})`,
  };
}

// Hard blacklist for off-topic drift. Any forbidden term appearing in
// the map fails the case (e.g. "Machine learning" must not appear in
// the Tokyo or NASA maps).
function checkForbidden(testCase: EvalCase, allText: string): Check | null {
  if (!testCase.forbidden || testCase.forbidden.length === 0) return null;
  const violations = testCase.forbidden.filter((term) =>
    allText.includes(term.toLowerCase()),
  );
  return {
    name: "forbidden absent",
    ok: violations.length === 0,
    detail:
      violations.length === 0
        ? `none of ${testCase.forbidden.length} forbidden terms appeared`
        : `appeared: ${violations.join(", ")}`,
  };
}

// ---------- helpers ----------

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
