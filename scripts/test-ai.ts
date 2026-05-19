import { getWikipediaContext } from "../lib/wiki";
import { generateWikiMap } from "../lib/ai/generateWikiMap";
import { AI_MODEL } from "../lib/ai/model";
import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "../lib/ai/constants";
import { computeGrounding } from "../lib/validation";

type Level = "beginner" | "intermediate" | "advanced";

function bar(char = "=", count = 72) {
  return char.repeat(count);
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
  const startMs = Date.now();
  const context = await getWikipediaContext(topic, level);
  console.log(
    `    ${Date.now() - startMs}ms — ${context.candidateLinks.length} candidate links, ${context.categories.length} categories, ${context.summary.length} summary chars`,
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
  console.log(`audience:     ${map.audienceLevel}`);
  console.log(
    `warnings:     ${map.warnings.length ? map.warnings.join(" | ") : "(none)"}`,
  );
  console.log(`\nkey takeaway: ${map.keyTakeaway}`);
  console.log(`\nsummary:\n${map.summary}`);
  console.log(`\nwhyThisPath:\n${map.whyThisPath}`);

  console.log(`\n--- nodes (${map.nodes.length}) ---`);
  for (const node of map.nodes) {
    const url = node.wikipediaUrl ? `\n     -> ${node.wikipediaUrl}` : "";
    console.log(`  [${node.type}] ${node.id} = "${node.title}"${url}`);
    console.log(
      `     ${node.explanation.slice(0, 160)}${node.explanation.length > 160 ? "..." : ""}`,
    );
  }

  console.log(`\n--- edges (${map.edges.length}) ---`);
  for (const edge of map.edges) {
    console.log(`  ${edge.source} --[${edge.relationship}]--> ${edge.target}`);
  }

  console.log(`\n--- learning path (${map.learningPath.length}) ---`);
  for (const step of map.learningPath) {
    console.log(`  ${step.order}. ${step.title}`);
    console.log(`     reason: ${step.reason}`);
    if (step.wikipediaUrl) console.log(`     -> ${step.wikipediaUrl}`);
  }

  const grounding = computeGrounding(map, context);
  console.log(`\n--- grounding (server-computed) ---`);
  console.log(`  mainArticleTitle:     ${grounding.mainArticleTitle}`);
  console.log(`  candidateLinkCount:   ${grounding.candidateLinkCount}`);
  console.log(`  selectedConceptCount: ${grounding.selectedConceptCount}`);
  console.log(
    `  selectedConcepts:     ${grounding.selectedConcepts.map((concept) => concept.title).join(", ")}`,
  );

  console.log("\n" + bar("-"));
  console.log("VALIDATION CHECKS");
  console.log(bar("-"));

  const allowedUrls = new Set<string>([
    context.canonicalUrl,
    ...context.candidateLinks.map((link) => link.url),
  ]);
  const urlViolations: string[] = [];
  for (const node of map.nodes) {
    if (node.wikipediaUrl && !allowedUrls.has(node.wikipediaUrl)) {
      urlViolations.push(`node "${node.title}" -> ${node.wikipediaUrl}`);
    }
  }
  for (const step of map.learningPath) {
    if (step.wikipediaUrl && !allowedUrls.has(step.wikipediaUrl)) {
      urlViolations.push(`path step "${step.title}" -> ${step.wikipediaUrl}`);
    }
  }
  console.log(
    urlViolations.length === 0
      ? "[OK] URL integrity — no hallucinated URLs"
      : `[FAIL] URL integrity — ${urlViolations.length} violations:`,
  );
  urlViolations.forEach((violation) => console.log(`     ${violation}`));

  const nodeIds = new Set(map.nodes.map((node) => node.id));
  const edgeViolations = map.edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
  );
  console.log(
    edgeViolations.length === 0
      ? "[OK] Graph integrity — all edges reference existing nodes"
      : `[FAIL] Graph integrity — ${edgeViolations.length} edge violations`,
  );
  edgeViolations.forEach((edge) =>
    console.log(`     ${edge.source} -> ${edge.target} (missing)`),
  );

  const mainCount = map.nodes.filter(
    (node) => node.type === "main_topic",
  ).length;
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
