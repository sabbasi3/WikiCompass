import {
  searchWikipedia,
  getWikipediaContext,
  DisambiguationError,
  WikipediaNotFoundError,
} from "../lib/wiki";

const DEFAULT_TOPICS = [
  "Machine learning",
  "Photosynthesis",
  "World War I",
  "Bill Gates",
  "Mercury",
];

function bar(char = "=", n = 72) {
  return char.repeat(n);
}

async function testTopic(topic: string) {
  console.log("\n" + bar());
  console.log(`TOPIC: ${topic}`);
  console.log(bar());

  console.log("\n[1] searchWikipedia (top 5):");
  const t0 = Date.now();
  const results = await searchWikipedia(topic, 5);
  console.log(`    (${Date.now() - t0}ms, ${results.length} results)`);
  if (results.length === 0) {
    console.log("    (no results)");
    return;
  }
  results.forEach((result, i) => {
    const desc = result.description ? ` — ${result.description}` : "";
    console.log(`    ${i + 1}. ${result.title}${desc}`);
  });

  console.log(`\n[2] getWikipediaContext("${topic}", "beginner"):`);
  const contextStartMs = Date.now();
  try {
    const context = await getWikipediaContext(topic, "beginner");
    console.log(`    (${Date.now() - contextStartMs}ms)`);
    console.log(`    title          : ${context.title}`);
    console.log(`    canonicalUrl   : ${context.canonicalUrl}`);
    console.log(`    summary chars  : ${context.summary.length}`);
    console.log(
      `    summary head   : ${context.summary.slice(0, 180).replace(/\n/g, " ")}...`,
    );
    console.log(
      `    categories (${context.categories.length}): ${context.categories.slice(0, 4).join(" | ")}${context.categories.length > 4 ? " ..." : ""}`,
    );
    console.log(`    candidateLinks (${context.candidateLinks.length}):`);
    context.candidateLinks.slice(0, 15).forEach((link, i) => {
      console.log(`      ${String(i + 1).padStart(2)}. ${link.title}`);
    });
    if (context.candidateLinks.length > 15) {
      console.log(`      ... and ${context.candidateLinks.length - 15} more`);
    }
  } catch (err) {
    console.log(`    (${Date.now() - contextStartMs}ms)`);
    if (err instanceof DisambiguationError) {
      console.log(`    AMBIGUOUS — "${err.title}" is a disambiguation page`);
      console.log(
        `    UI flow: show search results, let user pick a specific page.`,
      );
    } else if (err instanceof WikipediaNotFoundError) {
      console.log(`    NOT FOUND — no Wikipedia page for "${err.title}"`);
    } else {
      console.log(`    ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const topics = args.length > 0 ? args : DEFAULT_TOPICS;
  console.log(`Testing ${topics.length} topic(s): ${topics.join(", ")}`);
  for (const topic of topics) {
    try {
      await testTopic(topic);
    } catch (err) {
      console.error(`\nUnhandled failure for "${topic}":`, err);
    }
  }
  console.log("\n" + bar("-"));
  console.log("Done.");
}

main();
