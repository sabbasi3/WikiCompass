import { getWikipediaContext } from "../lib/wiki";
import { generateWikiMap } from "../lib/ai/generateWikiMap";
import { AI_MODEL } from "../lib/ai/model";
import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "../lib/ai/constants";

type Level = "beginner" | "intermediate" | "advanced";

function bar(c = "=", n = 72) {
  return c.repeat(n);
}

async function main() {
  const topic = process.argv[2] ?? "Machine learning";
  const level = (process.argv[3] as Level) ?? "beginner";
  const modelOverride = process.argv[4];
  const effectiveModel = modelOverride ?? AI_MODEL;

  console.log(`Model: ${effectiveModel}${modelOverride ? " (override)" : ""}`);
  console.log(`Topic: ${topic}`);
  console.log(`Level: ${level}`);
  console.log();

  console.log("[1] Fetching Wikipedia context...");
  const t0 = Date.now();
  const context = await getWikipediaContext(topic, level);
  console.log(
    `    ${Date.now() - t0}ms — ${context.candidateLinks.length} candidate links, ${context.categories.length} categories, ${context.summary.length} summary chars`,
  );

  console.log("\n[2] Calling generateWikiMap (this is the expensive call)...");
  const { map, usage, latencyMs } = await generateWikiMap(
    context,
    modelOverride,
  );
  console.log(`    ${latencyMs}ms`);
  if (usage) {
    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    console.log(
      `    tokens — input: ${input}, output: ${output}, total: ${usage.totalTokens ?? input + output}`,
    );
  }

  console.log("\n" + bar());
  console.log("WIKIMAP OUTPUT");
  console.log(bar());
  console.log(`topic:        ${map.topic}`);
  console.log(`topicType:    ${map.topicType}`);
  console.log(`confidence:   ${map.confidence}`);
  console.log(`audience:     ${map.audienceLevel}`);
  console.log(
    `warnings:     ${map.warnings.length ? map.warnings.join(" | ") : "(none)"}`,
  );
  console.log(`\nkey takeaway: ${map.keyTakeaway}`);
  console.log(`\nsummary:\n${map.summary}`);
  console.log(`\nwhyThisPath:\n${map.whyThisPath}`);

  console.log(`\n--- nodes (${map.nodes.length}) ---`);
  for (const n of map.nodes) {
    const url = n.wikipediaUrl ? `\n     -> ${n.wikipediaUrl}` : "";
    console.log(`  [${n.type}] ${n.id} = "${n.title}"${url}`);
    console.log(
      `     ${n.explanation.slice(0, 160)}${n.explanation.length > 160 ? "..." : ""}`,
    );
  }

  console.log(`\n--- edges (${map.edges.length}) ---`);
  for (const e of map.edges) {
    console.log(`  ${e.source} --[${e.relationship}]--> ${e.target}`);
  }

  console.log(`\n--- learning path (${map.learningPath.length}) ---`);
  for (const s of map.learningPath) {
    console.log(`  ${s.order}. ${s.title}`);
    console.log(`     reason: ${s.reason}`);
    if (s.wikipediaUrl) console.log(`     -> ${s.wikipediaUrl}`);
  }

  console.log(`\n--- grounding ---`);
  console.log(`  mainArticleTitle:     ${map.grounding.mainArticleTitle}`);
  console.log(`  candidateLinkCount:   ${map.grounding.candidateLinkCount}`);
  console.log(`  selectedConceptCount: ${map.grounding.selectedConceptCount}`);
  console.log(
    `  selectedTitles:       ${map.grounding.selectedTitles.join(", ")}`,
  );

  console.log("\n" + bar("-"));
  console.log("VALIDATION CHECKS");
  console.log(bar("-"));

  const allowedUrls = new Set<string>([
    context.canonicalUrl,
    ...context.candidateLinks.map((l) => l.url),
  ]);
  const urlViolations: string[] = [];
  for (const n of map.nodes) {
    if (n.wikipediaUrl && !allowedUrls.has(n.wikipediaUrl)) {
      urlViolations.push(`node "${n.title}" -> ${n.wikipediaUrl}`);
    }
  }
  for (const s of map.learningPath) {
    if (s.wikipediaUrl && !allowedUrls.has(s.wikipediaUrl)) {
      urlViolations.push(`path step "${s.title}" -> ${s.wikipediaUrl}`);
    }
  }
  console.log(
    urlViolations.length === 0
      ? "[OK] URL integrity — no hallucinated URLs"
      : `[FAIL] URL integrity — ${urlViolations.length} violations:`,
  );
  urlViolations.forEach((v) => console.log(`     ${v}`));

  const nodeIds = new Set(map.nodes.map((n) => n.id));
  const edgeViolations = map.edges.filter(
    (e) => !nodeIds.has(e.source) || !nodeIds.has(e.target),
  );
  console.log(
    edgeViolations.length === 0
      ? "[OK] Graph integrity — all edges reference existing nodes"
      : `[FAIL] Graph integrity — ${edgeViolations.length} edge violations`,
  );
  edgeViolations.forEach((e) =>
    console.log(`     ${e.source} -> ${e.target} (missing)`),
  );

  const mainCount = map.nodes.filter((n) => n.type === "main_topic").length;
  console.log(
    mainCount === 1
      ? "[OK] Exactly one main_topic node"
      : `[FAIL] Expected 1 main_topic, found ${mainCount}`,
  );

  const nodeCountOk =
    map.nodes.length >= NODE_COUNT_MIN && map.nodes.length <= NODE_COUNT_MAX;
  console.log(
    nodeCountOk
      ? `[OK] Node count in ${NODE_COUNT_MIN}-${NODE_COUNT_MAX} range (${map.nodes.length})`
      : `[WARN] Node count ${map.nodes.length} outside ${NODE_COUNT_MIN}-${NODE_COUNT_MAX} range`,
  );

  const pathCountOk =
    map.learningPath.length >= LEARNING_PATH_MIN &&
    map.learningPath.length <= LEARNING_PATH_MAX;
  console.log(
    pathCountOk
      ? `[OK] Learning path in ${LEARNING_PATH_MIN}-${LEARNING_PATH_MAX} range (${map.learningPath.length})`
      : `[WARN] Learning path length ${map.learningPath.length} outside ${LEARNING_PATH_MIN}-${LEARNING_PATH_MAX} range`,
  );
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(0, 8).join("\n"));
  }
  process.exit(1);
});
