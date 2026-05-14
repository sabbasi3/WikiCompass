import fs from "node:fs";
import path from "node:path";

import { generateWikiMap } from "../lib/ai/generateWikiMap";
import { AI_MODEL } from "../lib/ai/model";
import { DisambiguationError, getWikipediaContext } from "../lib/wiki";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  overrideGrounding,
  stripHallucinatedUrls,
} from "../lib/validation";

type Level = "beginner" | "intermediate" | "advanced";

type EvalCase = {
  topic: string;
  level: Level;
  expectedMustInclude?: string[];
  forbidden?: string[];
  expectedBehavior?: "ambiguous";
};

type Check = { name: string; ok: boolean; detail?: string };

type CaseResult = {
  topic: string;
  level: Level;
  ms: number;
  tokens?: number;
  checks: Check[];
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
    try {
      await getWikipediaContext(c.topic, c.level);
      checks.push({
        name: "ambiguous regression",
        ok: false,
        detail: "expected DisambiguationError, got a clean context",
      });
    } catch (err) {
      if (err instanceof DisambiguationError) {
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
    return { topic: c.topic, level: c.level, ms: Date.now() - t0, checks };
  }

  let context;
  try {
    context = await getWikipediaContext(c.topic, c.level);
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

  const allowed = buildAllowedUrlSet(context);
  const stripped = stripHallucinatedUrls(result.map, allowed);
  const map = overrideGrounding(stripped.map, context);

  checks.push({
    name: "schema validity",
    ok: true,
    detail: "Zod-validated by generateObject",
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

  const totalStripped =
    stripped.strippedNodeUrls.length + stripped.strippedPathUrls.length;
  checks.push({
    name: "URL integrity",
    ok: totalStripped === 0,
    detail:
      totalStripped === 0
        ? "every wikipediaUrl is in the allowed set"
        : `stripped ${totalStripped} hallucinated URL(s)`,
  });

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
    checks.push({
      name: "coverage",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `found all ${c.expectedMustInclude.length} required terms`
          : `missing: ${missing.join(", ")}`,
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
  };
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
      const mark = ch.ok ? "[OK]  " : "[FAIL]";
      console.log(`  ${mark} ${ch.name.padEnd(22)} ${ch.detail ?? ""}`);
    }
    const tk = r.tokens ? `, ${r.tokens.toLocaleString()} tokens` : "";
    console.log(`         ${r.ms}ms${tk}`);
    console.log();
  }

  const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
  const passedChecks = results.reduce(
    (s, r) => s + r.checks.filter((c) => c.ok).length,
    0,
  );
  const casesPassed = results.filter((r) => r.checks.every((c) => c.ok)).length;
  const totalMs = Date.now() - startAll;
  const totalTokens = results.reduce((s, r) => s + (r.tokens ?? 0), 0);

  console.log(bar());
  console.log("SUMMARY");
  console.log(bar());
  console.log(`Cases:  ${casesPassed}/${results.length} passed`);
  console.log(`Checks: ${passedChecks}/${totalChecks} passed`);
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
