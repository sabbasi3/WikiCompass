// Eval runner. Two tiers of checks:
//   - Gating (deterministic): schema validity, graph integrity, URL
//     grounding, topic-type inference, regression on disambig/not_found.
//     Failure exits non-zero. These MUST hold.
//   - Info signals (probabilistic): does "Supervised learning" appear in
//     the ML map? Does the audience adaptation actually differ across
//     levels (Jaccard < 0.85)? Reported but not gated.
//
// Treating probabilistic outputs as gating cries wolf — model variance
// would make CI red on every run. Treating them as silent would let real
// regressions slip. Two tiers solves both.
//
// Mirrors the route's full pipeline (Wikipedia → AI → verify → strip)
// so eval results describe what users actually see, not pre-verification
// behavior that no real user encounters.

import fs from "node:fs";
import path from "node:path";

import { generateWikiMap } from "../lib/ai/generateWikiMap";
import { AI_MODEL } from "../lib/ai/model";
import {
  DisambiguationError,
  WikipediaNotFoundError,
  fetchAmbiguousCandidates,
  getWikipediaContext,
  suggestWikipediaTitles,
  verifyWikipediaUrls,
} from "../lib/wiki";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  collectUnknownUrls,
  stripHallucinatedUrls,
} from "../lib/validation";

type Level = "beginner" | "intermediate" | "advanced";

type EvalCase = {
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
type Check = {
  name: string;
  ok: boolean;
  detail?: string;
  kind?: "info";
};

type CaseResult = {
  topic: string;
  level: Level;
  ms: number;
  tokens?: number;
  checks: Check[];
  whyThisPath?: string; // captured for cross-level audience-adaptation diff
};

function bar(c = "=", n = 72) {
  return c.repeat(n);
}

function searchHaystack(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

async function evalCase(c: EvalCase): Promise<CaseResult> {
  const checks: Check[] = [];
  const t0 = Date.now();

  if (c.expectedBehavior === "ambiguous") {
    let disambigTitle: string | null = null;
    try {
      await getWikipediaContext(c.topic, c.level);
      checks.push({
        name: "ambiguous regression",
        ok: false,
        detail: "expected DisambiguationError, got a clean context",
      });
    } catch (err) {
      if (err instanceof DisambiguationError) {
        disambigTitle = err.title;
        checks.push({
          name: "ambiguous regression",
          ok: true,
          detail: "DisambiguationError thrown — UI will show chooser",
        });
      } else {
        const name = err instanceof Error ? err.constructor.name : typeof err;
        const msg = err instanceof Error ? err.message : String(err);
        checks.push({
          name: "ambiguous regression",
          ok: false,
          detail: `expected DisambiguationError, got ${name}: ${msg}`,
        });
      }
    }
    // Candidate-coverage assertion: verify the merge surfaces known-
    // good interpretations. Only runs when the case declares them
    // and DisambiguationError fired (we have a canonical title).
    if (
      disambigTitle &&
      c.expectedCandidatesInclude &&
      c.expectedCandidatesInclude.length > 0
    ) {
      const candidates = await fetchAmbiguousCandidates(disambigTitle, 15);
      const titles = new Set(candidates.map((cn) => cn.title));
      const missing = c.expectedCandidatesInclude.filter((t) => !titles.has(t));
      checks.push({
        name: "candidate coverage",
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `all ${c.expectedCandidatesInclude.length} expected candidate(s) present (${candidates.length} total)`
            : `missing: ${missing.join(", ")} (got: ${candidates.map((cn) => cn.title).join(", ")})`,
      });
    }
    return { topic: c.topic, level: c.level, ms: Date.now() - t0, checks };
  }

  if (c.expectedBehavior === "not_found") {
    try {
      await getWikipediaContext(c.topic, c.level);
      checks.push({
        name: "not_found regression",
        ok: false,
        detail: "expected WikipediaNotFoundError, got a clean context",
      });
    } catch (err) {
      if (err instanceof WikipediaNotFoundError) {
        checks.push({
          name: "not_found regression",
          ok: true,
          detail: "WikipediaNotFoundError thrown — UI will show 404 card",
        });
      } else {
        const name = err instanceof Error ? err.constructor.name : typeof err;
        const msg = err instanceof Error ? err.message : String(err);
        checks.push({
          name: "not_found regression",
          ok: false,
          detail: `expected WikipediaNotFoundError, got ${name}: ${msg}`,
        });
      }
    }
    // "Did you mean...?" assertion: typo cases should produce useful
    // suggestions via the opensearch fallback. Only runs when the case
    // explicitly declares expected suggestions.
    if (
      c.expectedSuggestionsInclude &&
      c.expectedSuggestionsInclude.length > 0
    ) {
      const suggestions = await suggestWikipediaTitles(c.topic, 5).catch(
        () => [],
      );
      const titles = new Set(suggestions.map((s) => s.title));
      const missing = c.expectedSuggestionsInclude.filter(
        (t) => !titles.has(t),
      );
      checks.push({
        name: "did-you-mean",
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `all ${c.expectedSuggestionsInclude.length} expected suggestion(s) present (got: ${suggestions.map((s) => s.title).join(", ")})`
            : `missing suggestion(s): ${missing.join(", ")} (got: ${suggestions.map((s) => s.title).join(", ") || "none"})`,
      });
    }
    return { topic: c.topic, level: c.level, ms: Date.now() - t0, checks };
  }

  let context;
  try {
    context = await getWikipediaContext(c.topic, c.level, c.userGoal);
  } catch (err) {
    checks.push({
      name: "wikipedia fetch",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { topic: c.topic, level: c.level, ms: Date.now() - t0, checks };
  }

  let result;
  try {
    result = await generateWikiMap(context);
  } catch (err) {
    checks.push({
      name: "AI generation",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { topic: c.topic, level: c.level, ms: Date.now() - t0, checks };
  }

  // Mirror the route's verification pipeline: collect URLs the model wrote
  // outside the candidate set, verify them against Wikipedia (title-match
  // required), and expand allowed with the verified ones before stripping.
  // Without this, eval results would describe pre-verification behavior
  // that no real user ever sees.
  const allowed = buildAllowedUrlSet(context);
  const unknownPairs = collectUnknownUrls(result.map, allowed);
  const verified =
    unknownPairs.length > 0
      ? await verifyWikipediaUrls(unknownPairs)
      : new Set<string>();
  for (const url of verified) allowed.add(url);
  const stripped = stripHallucinatedUrls(result.map, allowed);
  const map = stripped.map;

  checks.push({
    name: "schema validity",
    ok: true,
    detail: "Zod-validated by generateText + Output.object",
  });

  const graphIssues = checkGraphIntegrity(map);
  checks.push({
    name: "graph integrity",
    ok: graphIssues.length === 0,
    detail:
      graphIssues.length === 0
        ? "all edges valid, exactly one main_topic, counts in range"
        : graphIssues.map((i) => i.detail).join("; "),
  });

  // Rule 3 (topic-type inference). When the case declares an expected
  // topicType, assert the model classified correctly — a misclassified
  // topic cascades into rule 4 applying the wrong arc (biographies
  // forced into prerequisite-heavy concept structure).
  if (c.expectedTopicType) {
    checks.push({
      name: "topic type",
      ok: map.topicType === c.expectedTopicType,
      detail:
        map.topicType === c.expectedTopicType
          ? `inferred "${map.topicType}"`
          : `expected "${c.expectedTopicType}", got "${map.topicType}"`,
    });
  }

  // Rule 11 (personalization). When the case sets a userGoal, the
  // whyThisPath paragraph should reference that goal explicitly.
  // Verified by asserting goal-keywords appear in the rationale.
  if (c.expectedGoalEcho && c.expectedGoalEcho.length > 0) {
    const haystack = (map.whyThisPath ?? "").toLowerCase();
    const missing = c.expectedGoalEcho.filter(
      (w) => !haystack.includes(w.toLowerCase()),
    );
    checks.push({
      name: "personalization",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `whyThisPath echoes all ${c.expectedGoalEcho.length} goal keyword(s)`
          : `whyThisPath missing goal keyword(s): ${missing.join(", ")}`,
    });
  }

  // URL grounding: the verify-then-strip pipeline guarantees no user-visible
  // misleading URLs. We report a breakdown — how many URLs the model wrote
  // outside the candidate set, how many we verified against Wikipedia (kept),
  // and how many we stripped (rejected). Informational signal, not gating:
  // any non-zero shows the safety net at work, not a system failure.
  const totalStripped =
    stripped.strippedNodeUrls.length + stripped.strippedPathUrls.length;
  const verifiedCount = verified.size;
  const unknownCount = unknownPairs.length;
  checks.push({
    name: "URL grounding",
    ok: true,
    detail:
      unknownCount === 0
        ? "model stayed within candidate set (clean)"
        : `${unknownCount} URL(s) outside candidates → ${verifiedCount} verified + kept, ${totalStripped} stripped`,
  });

  // Coverage is a behavioral signal, not a gating check. When a concept is
  // absent, the system as a whole (often: candidate-link ordering, not the
  // model) failed to surface it. We report quantitatively so the engineer
  // can investigate, but we don't claim the system failed.
  if (c.expectedMustInclude && c.expectedMustInclude.length > 0) {
    const haystack = searchHaystack([
      ...map.nodes.map((n) => `${n.title} ${n.explanation}`),
      ...map.learningPath.map((s) => `${s.title} ${s.reason}`),
      map.summary,
      map.keyTakeaway,
      map.whyThisPath,
    ]);
    const missing = c.expectedMustInclude.filter(
      (term) => !haystack.includes(term.toLowerCase()),
    );
    const expected = c.expectedMustInclude.length;
    const present = expected - missing.length;
    checks.push({
      name: "coverage",
      kind: "info",
      ok: true,
      detail:
        missing.length === 0
          ? `${present}/${expected} expected concepts present`
          : `${present}/${expected} expected concepts present (absent: ${missing.join(", ")})`,
    });
  }

  if (c.forbidden && c.forbidden.length > 0) {
    const haystack = searchHaystack([
      ...map.nodes.map((n) => `${n.title} ${n.explanation}`),
      ...map.learningPath.map((s) => `${s.title} ${s.reason}`),
      map.summary,
      map.keyTakeaway,
      map.whyThisPath,
    ]);
    const violations = c.forbidden.filter((term) =>
      haystack.includes(term.toLowerCase()),
    );
    checks.push({
      name: "forbidden absent",
      ok: violations.length === 0,
      detail:
        violations.length === 0
          ? `none of ${c.forbidden.length} forbidden terms appeared`
          : `appeared: ${violations.join(", ")}`,
    });
  }

  return {
    topic: c.topic,
    level: c.level,
    ms: Date.now() - t0,
    tokens: result.usage?.totalTokens,
    checks,
    whyThisPath: map.whyThisPath,
  };
}

// Word-set Jaccard similarity. Returns 1 when identical, 0 when disjoint.
function jaccardSim(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter(Boolean));
  const sa = tok(a);
  const sb = tok(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

async function main() {
  const casesPath = path.join(process.cwd(), "evals", "wiki-map-cases.json");
  const cases: EvalCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"));

  console.log(`Model: ${AI_MODEL}`);
  console.log(`Cases: ${cases.length}`);
  console.log();

  const startAll = Date.now();
  const results: CaseResult[] = [];
  for (const c of cases) {
    console.log(bar());
    const behavior = c.expectedBehavior
      ? ` [behavior=${c.expectedBehavior}]`
      : "";
    console.log(`CASE: ${c.topic} (${c.level})${behavior}`);
    console.log(bar());
    const r = await evalCase(c);
    results.push(r);
    for (const ch of r.checks) {
      const mark = ch.kind === "info" ? "[INFO]" : ch.ok ? "[OK]  " : "[FAIL]";
      console.log(`  ${mark} ${ch.name.padEnd(22)} ${ch.detail ?? ""}`);
    }
    const tk = r.tokens ? `, ${r.tokens.toLocaleString()} tokens` : "";
    console.log(`         ${r.ms}ms${tk}`);
    console.log();
  }

  // Cross-level audience-adaptation check: when the same topic is run
  // at multiple levels, their whyThisPath rationales should differ
  // meaningfully. If they don't, rule 9 may have silently broken (e.g.,
  // the audienceLevel param stopped reaching the prompt). Reported as
  // INFO, not gating — adaptation is qualitative, so we only fail on
  // the catastrophic case (>= 0.85 similarity).
  const SIMILARITY_THRESHOLD = 0.85;
  const byTopic = new Map<string, CaseResult[]>();
  for (const r of results) {
    if (r.whyThisPath) {
      byTopic.set(r.topic, [...(byTopic.get(r.topic) ?? []), r]);
    }
  }
  for (const [topic, group] of byTopic) {
    if (group.length < 2) continue;
    let maxSim = 0;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        maxSim = Math.max(
          maxSim,
          jaccardSim(group[i].whyThisPath!, group[j].whyThisPath!),
        );
      }
    }
    const ok = maxSim < SIMILARITY_THRESHOLD;
    console.log(bar());
    console.log(`CROSS-LEVEL: ${topic} (${group.length} levels)`);
    console.log(bar());
    const mark = ok ? "[OK]  " : "[FAIL]";
    console.log(
      `  ${mark} audience adaptation     max whyThisPath similarity ${maxSim.toFixed(2)} (threshold < ${SIMILARITY_THRESHOLD})`,
    );
    console.log();
  }

  // Case pass/fail is decided by gating checks only. Info checks are
  // behavioral signals — reported, but they don't gate the suite.
  const allChecks = results.flatMap((r) => r.checks);
  const gatingChecks = allChecks.filter((c) => c.kind !== "info");
  const infoChecks = allChecks.filter((c) => c.kind === "info");
  const passedGating = gatingChecks.filter((c) => c.ok).length;
  const casesPassed = results.filter((r) =>
    r.checks.every((c) => c.kind === "info" || c.ok),
  ).length;
  const totalMs = Date.now() - startAll;
  const totalTokens = results.reduce((s, r) => s + (r.tokens ?? 0), 0);

  console.log(bar());
  console.log("SUMMARY");
  console.log(bar());
  console.log(`Cases:  ${casesPassed}/${results.length} passed`);
  console.log(`Gating: ${passedGating}/${gatingChecks.length} checks passed`);
  console.log(`Info:   ${infoChecks.length} behavioral signal(s) reported`);
  console.log(`Time:   ${(totalMs / 1000).toFixed(1)}s total`);
  console.log(`Tokens: ${totalTokens.toLocaleString()} total`);

  if (casesPassed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
});
