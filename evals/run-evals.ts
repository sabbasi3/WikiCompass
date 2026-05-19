// Eval orchestrator. Loads cases, runs each through evalCase(), prints
// results, performs cross-level audience-adaptation analysis, and exits
// non-zero on any gating failure.
//
// Two tiers of checks (defined in eval-case.ts):
//   - Gating (deterministic): schema validity, graph integrity, URL
//     grounding, topic-type, regression on disambig/not_found. MUST hold.
//   - Info (probabilistic): coverage, audience-adaptation. Reported but
//     not gated — model variance would make CI red on every run.
//
// All "how to run one case" logic lives in eval-case.ts. This file is
// just the loop, the reporting, and the cross-level analysis.

import fs from "node:fs";
import path from "node:path";

import { AI_MODEL } from "../lib/ai/model";
import { evalCase, type CaseResult, type EvalCase } from "./eval-case";

// ---------- helpers ----------

function bar(char = "=", count = 72) {
  return char.repeat(count);
}

// Word-set Jaccard similarity. Returns 1 when identical, 0 when disjoint.
// Used by the cross-level audience-adaptation check below.
function jaccardSim(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  const intersection = [...setA].filter((word) => setB.has(word)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function loadCases(): EvalCase[] {
  const casesPath = path.join(process.cwd(), "evals", "wiki-map-cases.json");
  return JSON.parse(fs.readFileSync(casesPath, "utf-8"));
}

// ---------- reporting ----------

function printCaseHeader(testCase: EvalCase) {
  const behavior = testCase.expectedBehavior
    ? ` [behavior=${testCase.expectedBehavior}]`
    : "";
  console.log(bar());
  console.log(`CASE: ${testCase.topic} (${testCase.level})${behavior}`);
  console.log(bar());
}

function printCaseChecks(result: CaseResult) {
  for (const check of result.checks) {
    const mark =
      check.kind === "info" ? "[INFO]" : check.ok ? "[OK]  " : "[FAIL]";
    console.log(`  ${mark} ${check.name.padEnd(22)} ${check.detail ?? ""}`);
  }
  const tk = result.tokens ? `, ${result.tokens.toLocaleString()} tokens` : "";
  console.log(`         ${result.ms}ms${tk}`);
  console.log();
}

// Cross-level audience-adaptation check: when the same topic is run at
// multiple levels, their whyThisPath rationales should differ meaningfully.
// If they don't, rule 9 may have silently broken (e.g., the audienceLevel
// param stopped reaching the prompt). Reported as INFO, not gating —
// adaptation is qualitative, so we only fail on the catastrophic case
// (>= 0.85 similarity).
//
// Grouping holds userGoal constant: comparing a goal-less run against a
// personalized run would always differ, masking a broken audienceLevel.
// Keying on (topic, userGoal) isolates audience adaptation as the only
// variable.
function printCrossLevel(results: CaseResult[]) {
  const SIMILARITY_THRESHOLD = 0.85;
  const byTopic = new Map<string, CaseResult[]>();
  for (const result of results) {
    if (!result.whyThisPath) continue;
    const key = `${result.topic}|${result.userGoal ?? ""}`;
    byTopic.set(key, [...(byTopic.get(key) ?? []), result]);
  }
  for (const [, group] of byTopic) {
    if (group.length < 2) continue;
    const topic = group[0].topic;
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
}

function printSummary(results: CaseResult[], totalMs: number) {
  // Case pass/fail is decided by gating checks only. Info checks are
  // behavioral signals — reported, but they don't gate the suite.
  const allChecks = results.flatMap((result) => result.checks);
  const gatingChecks = allChecks.filter((check) => check.kind !== "info");
  const infoChecks = allChecks.filter((check) => check.kind === "info");
  const passedGating = gatingChecks.filter((check) => check.ok).length;
  const casesPassed = results.filter((result) =>
    result.checks.every((check) => check.kind === "info" || check.ok),
  ).length;
  const totalTokens = results.reduce(
    (sum, result) => sum + (result.tokens ?? 0),
    0,
  );

  console.log(bar());
  console.log("SUMMARY");
  console.log(bar());
  console.log(`Cases:  ${casesPassed}/${results.length} passed`);
  console.log(`Gating: ${passedGating}/${gatingChecks.length} checks passed`);
  console.log(`Info:   ${infoChecks.length} behavioral signal(s) reported`);
  console.log(`Time:   ${(totalMs / 1000).toFixed(1)}s total`);
  console.log(`Tokens: ${totalTokens.toLocaleString()} total`);
}

function allCasesPassed(results: CaseResult[]): boolean {
  return results.every((result) =>
    result.checks.every((check) => check.kind === "info" || check.ok),
  );
}

// ---------- main ----------

async function main() {
  const cases = loadCases();
  console.log(`Model: ${AI_MODEL}`);
  console.log(`Cases: ${cases.length}`);
  console.log();

  const startAll = Date.now();
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    printCaseHeader(testCase);
    const result = await evalCase(testCase);
    results.push(result);
    printCaseChecks(result);
  }

  printCrossLevel(results);
  printSummary(results, Date.now() - startAll);

  if (!allCasesPassed(results)) process.exit(1);
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
});
