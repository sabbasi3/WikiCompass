import { getWikipediaContext } from "../lib/wiki";
import { generateWikiMap } from "../lib/ai/generateWikiMap";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  collectUnknownUrls,
  stripHallucinatedUrls,
} from "../lib/validation";
import { verifyWikipediaUrls } from "../lib/wiki/verify";

// Approximate public per-M-token pricing (USD), late 2025 / early 2026.
// These move; the comparison shape matters more than the absolute dollars.
const PRICING: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "anthropic/claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-4.1-mini": { in: 0.4, out: 1.6 },
};

const MODELS = Object.keys(PRICING);

function fmtCost(c: number): string {
  if (c < 0.001) return `$${c.toFixed(5)}`;
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

async function main() {
  const topic = "Machine learning";
  const level = "beginner";

  console.log(`Topic: ${topic} (${level})`);
  console.log(`Fetching context once...`);
  const context = await getWikipediaContext(topic, level);
  console.log(
    `Got ${context.candidateLinks.length} candidates, ${context.summary.length} summary chars\n`,
  );

  type Row = {
    model: string;
    status: "ok" | "fail";
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    nodes?: number;
    edges?: number;
    pathLen?: number;
    unknownUrls?: number;
    verifiedUrls?: number;
    stripped?: number;
    integrityIssues?: number;
    cost?: number;
    error?: string;
  };
  const rows: Row[] = [];

  for (const model of MODELS) {
    console.log(`[${model}] running...`);
    try {
      const t0 = Date.now();
      const { map, usage, latencyMs } = await generateWikiMap(context, model);

      const allowed = buildAllowedUrlSet(context);
      const unknownPairs = collectUnknownUrls(map, allowed);
      const verified =
        unknownPairs.length > 0
          ? await verifyWikipediaUrls(unknownPairs)
          : new Set<string>();
      for (const url of verified) allowed.add(url);
      const stripResult = stripHallucinatedUrls(map, allowed);
      const integrity = checkGraphIntegrity(stripResult.map);

      const inputT = usage?.inputTokens ?? 0;
      const outputT = usage?.outputTokens ?? 0;
      const price = PRICING[model];
      const cost = (inputT * price.in + outputT * price.out) / 1_000_000;

      const row: Row = {
        model,
        status: "ok",
        latencyMs,
        inputTokens: inputT,
        outputTokens: outputT,
        totalTokens: usage?.totalTokens ?? inputT + outputT,
        nodes: map.nodes.length,
        edges: map.edges.length,
        pathLen: map.learningPath.length,
        unknownUrls: unknownPairs.length,
        verifiedUrls: verified.size,
        stripped:
          stripResult.strippedNodeUrls.length +
          stripResult.strippedPathUrls.length,
        integrityIssues: integrity.length,
        cost,
      };
      rows.push(row);
      console.log(
        `  ${(latencyMs / 1000).toFixed(1)}s | ${map.nodes.length} nodes | ${fmtCost(cost)} | unknown=${unknownPairs.length} verified=${verified.size} stripped=${row.stripped}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      rows.push({ model, status: "fail", error });
      console.log(`  FAIL — ${error}`);
    }
  }

  // Sort by latency ascending (winners on top)
  const ok = rows.filter((r) => r.status === "ok");
  const fail = rows.filter((r) => r.status === "fail");
  ok.sort((a, b) => (a.latencyMs ?? 0) - (b.latencyMs ?? 0));

  console.log("\n\n=== Markdown table ===\n");
  console.log("| Model | Latency | Cost/map | Nodes | Path | Integrity |");
  console.log("|---|---:|---:|---:|---:|:---:|");
  for (const r of ok) {
    const integrity =
      r.integrityIssues === 0 ? "✓" : `${r.integrityIssues} issues`;
    console.log(
      `| \`${r.model}\` | ${(r.latencyMs! / 1000).toFixed(1)}s | ${fmtCost(r.cost!)} | ${r.nodes} | ${r.pathLen} | ${integrity} |`,
    );
  }
  for (const r of fail) {
    console.log(`| \`${r.model}\` | — | — | — | — | FAIL: ${r.error} |`);
  }

  console.log("\n=== URL safety pipeline summary ===\n");
  console.log("| Model | Unknown URLs | Verified | Stripped |");
  console.log("|---|---:|---:|---:|");
  for (const r of ok) {
    console.log(
      `| \`${r.model}\` | ${r.unknownUrls} | ${r.verifiedUrls} | ${r.stripped} |`,
    );
  }

  console.log("\n=== Cost at scale (100K maps) ===\n");
  console.log("| Model | Per map | 100K maps |");
  console.log("|---|---:|---:|");
  for (const r of ok) {
    console.log(
      `| \`${r.model}\` | ${fmtCost(r.cost!)} | $${(r.cost! * 100_000).toFixed(0)} |`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
