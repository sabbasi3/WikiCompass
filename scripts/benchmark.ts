import { getWikipediaContext } from "../lib/wiki";
import { generateWikiMap } from "../lib/ai/generateWikiMap";
import {
  buildAllowedUrlSet,
  checkGraphIntegrity,
  collectUnknownUrls,
  stripHallucinatedUrls,
} from "../lib/validation";
import { verifyWikipediaUrls } from "../lib/wiki/verify";

// Per-million-token pricing in USD, late 2025 / early 2026. These move;
// the comparison shape matters more than the absolute dollars.
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "google/gemini-2.5-flash-lite": { inputPerM: 0.1, outputPerM: 0.4 },
  "google/gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
  "anthropic/claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0 },
  "openai/gpt-5-nano": { inputPerM: 0.05, outputPerM: 0.4 },
  "openai/gpt-5-mini": { inputPerM: 0.25, outputPerM: 2.0 },
  "openai/gpt-4.1-mini": { inputPerM: 0.4, outputPerM: 1.6 },
  "zai/glm-4.6": { inputPerM: 0.6, outputPerM: 2.2 },
  "zai/glm-4.7-flash": { inputPerM: 0.07, outputPerM: 0.4 },
  "zai/glm-4.5-air": { inputPerM: 0.2, outputPerM: 1.1 },
};

const MODELS = Object.keys(PRICING);

function formatCost(cost: number): string {
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
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
      const { map, usage, latencyMs } = await generateWikiMap(context, model);

      const allowedUrls = buildAllowedUrlSet(context);
      const unknownUrls = collectUnknownUrls(map, allowedUrls);
      const verified =
        unknownUrls.length > 0
          ? await verifyWikipediaUrls(unknownUrls)
          : new Set<string>();
      for (const url of verified) allowedUrls.add(url);
      const stripResult = stripHallucinatedUrls(map, allowedUrls);
      const integrity = checkGraphIntegrity(stripResult.map);

      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      const price = PRICING[model];
      const cost =
        (inputTokens * price.inputPerM + outputTokens * price.outputPerM) /
        1_000_000;

      const row: Row = {
        model,
        status: "ok",
        latencyMs,
        inputTokens,
        outputTokens,
        totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
        nodes: map.nodes.length,
        edges: map.edges.length,
        pathLen: map.learningPath.length,
        unknownUrls: unknownUrls.length,
        verifiedUrls: verified.size,
        stripped:
          stripResult.strippedNodeUrls.length +
          stripResult.strippedPathUrls.length,
        integrityIssues: integrity.length,
        cost,
      };
      rows.push(row);
      console.log(
        `  ${(latencyMs / 1000).toFixed(1)}s | ${map.nodes.length} nodes | ${formatCost(cost)} | unknown=${unknownUrls.length} verified=${verified.size} stripped=${row.stripped}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      rows.push({ model, status: "fail", error });
      console.log(`  FAIL — ${error}`);
    }
  }

  // Sort by latency ascending (winners on top)
  const okRows = rows.filter((row) => row.status === "ok");
  const failedRows = rows.filter((row) => row.status === "fail");
  okRows.sort((a, b) => (a.latencyMs ?? 0) - (b.latencyMs ?? 0));

  console.log("\n\n=== Markdown table ===\n");
  console.log("| Model | Latency | Cost/map | Nodes | Path | Integrity |");
  console.log("|---|---:|---:|---:|---:|:---:|");
  for (const row of okRows) {
    const integrity =
      row.integrityIssues === 0 ? "✓" : `${row.integrityIssues} issues`;
    console.log(
      `| \`${row.model}\` | ${(row.latencyMs! / 1000).toFixed(1)}s | ${formatCost(row.cost!)} | ${row.nodes} | ${row.pathLen} | ${integrity} |`,
    );
  }
  for (const row of failedRows) {
    console.log(`| \`${row.model}\` | — | — | — | — | FAIL: ${row.error} |`);
  }

  console.log("\n=== URL safety pipeline summary ===\n");
  console.log("| Model | Unknown URLs | Verified | Stripped |");
  console.log("|---|---:|---:|---:|");
  for (const row of okRows) {
    console.log(
      `| \`${row.model}\` | ${row.unknownUrls} | ${row.verifiedUrls} | ${row.stripped} |`,
    );
  }

  console.log("\n=== Cost at scale (100K maps) ===\n");
  console.log("| Model | Per map | 100K maps |");
  console.log("|---|---:|---:|");
  for (const row of okRows) {
    console.log(
      `| \`${row.model}\` | ${formatCost(row.cost!)} | $${(row.cost! * 100_000).toFixed(0)} |`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
