// Eval suite for WikiCompass. Calls the same generateMapResponse() the
// production route uses, then asserts on what came back.
//
// What gets checked (per case in wiki-map-cases.ts):
//   - Response shape matches expected: map | disambiguation | not_found
//   - For map responses: 7 checks (schema, graph integrity, topic-type
//     classification, personalization, URL grounding, coverage, off-topic
//     drift). See assertMap() in eval-case.ts.
//
// Two tiers of checks:
//   - GATING — must always pass. Failures exit non-zero (CI red).
//   - INFO   — reported but not gated. Model-variance noise (coverage).
//
// Files:
//   run-evals.ts        ← you are here. Orchestrator + reporting.
//   eval-case.ts        ← one-case logic: assertions + routing.
//   wiki-map-cases.ts   ← the cases themselves, with inline comments
//                         explaining each case's purpose.
//
// Related: `npm run test-prompt` unit-tests audienceLevel + userGoal
// flow through buildWikiMapPrompt without making any model calls.
//
// Run with: `npm run eval`

import { AI_MODEL } from "../lib/ai/model";
import { cases } from "./wiki-map-cases";
import { evalCase, type CaseResult, type EvalCase } from "./eval-case";

// ---------- main ----------

async function main() {
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

  printSummary(results, Date.now() - startAll);

  if (!allCasesPassed(results)) process.exit(1);
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

// ---------- small utilities ----------

function allCasesPassed(results: CaseResult[]): boolean {
  return results.every((result) =>
    result.checks.every((check) => check.kind === "info" || check.ok),
  );
}

function bar(char = "=", count = 72) {
  return char.repeat(count);
}

// ---------- entry ----------

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
});
