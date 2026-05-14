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
  results.forEach((r, i) => {
    const desc = r.description ? ` — ${r.description}` : "";
    console.log(`    ${i + 1}. ${r.title}${desc}`);
  });

  console.log(`\n[2] getWikipediaContext("${topic}", "beginner"):`);
  const t1 = Date.now();
  try {
    const ctx = await getWikipediaContext(topic, "beginner");
    console.log(`    (${Date.now() - t1}ms)`);
    console.log(`    title          : ${ctx.title}`);
    console.log(`    canonicalUrl   : ${ctx.canonicalUrl}`);
    console.log(`    summary chars  : ${ctx.summary.length}`);
    console.log(
      `    summary head   : ${ctx.summary.slice(0, 180).replace(/\n/g, " ")}...`,
    );
    console.log(
      `    categories (${ctx.categories.length}): ${ctx.categories.slice(0, 4).join(" | ")}${ctx.categories.length > 4 ? " ..." : ""}`,
    );
    console.log(`    candidateLinks (${ctx.candidateLinks.length}):`);
    ctx.candidateLinks.slice(0, 15).forEach((l, i) => {
      console.log(`      ${String(i + 1).padStart(2)}. ${l.title}`);
    });
    if (ctx.candidateLinks.length > 15) {
      console.log(`      ... and ${ctx.candidateLinks.length - 15} more`);
    }
  } catch (err) {
    console.log(`    (${Date.now() - t1}ms)`);
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
  for (const t of topics) {
    try {
      await testTopic(t);
    } catch (err) {
      console.error(`\nUnhandled failure for "${t}":`, err);
    }
  }
  console.log("\n" + bar("-"));
  console.log("Done.");
}

main();
