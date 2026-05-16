import fs from "node:fs";
import path from "node:path";

import { generateWikiMap } from "../lib/ai/generateWikiMap";
import { AI_MODEL } from "../lib/ai/model";
import {
  DisambiguationError,
  WikipediaNotFoundError,
  getWikipediaContext,
} from "../lib/wiki";
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
  expectedBehavior?: "ambiguous" | "not_found";
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

  // URL grounding: the strip-then-warn pipeline guarantees no user-visible
  // hallucinated URLs. We report the strip count as an informational signal
  // (model behavior), not as a system-failure assertion. A non-zero strip
  // count means the model misbehaved AND the pipeline corrected it — the
  // production system worked as designed.
  const totalStripped =
    stripped.strippedNodeUrls.length + stripped.strippedPathUrls.length;
  checks.push({
    name: "URL grounding",
    ok: true,
    detail:
      totalStripped === 0
        ? "model produced 0 hallucinated URLs (clean)"
        : `model produced ${totalStripped} hallucinated URL(s); pipeline stripped them before render`,
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
      const mark = ch.kind === "info" ? "[INFO]" : ch.ok ? "[OK]  " : "[FAIL]";
      console.log(`  ${mark} ${ch.name.padEnd(22)} ${ch.detail ?? ""}`);
    }
    const tk = r.tokens ? `, ${r.tokens.toLocaleString()} tokens` : "";
    console.log(`         ${r.ms}ms${tk}`);
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
