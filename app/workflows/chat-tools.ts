// Tools the chat agent can call.
//
// Defined as a sibling to the workflow file rather than inside it so
// "what tools does the chat have" is separable from "how does the
// workflow orchestrate them." The actual fetch is a "use step" function
// — each call shows up in workflow web with timing, retries, and IO,
// same observability as every other step in the run.

import { tool } from "ai";
import { z } from "zod";

import { fetchWikipediaSummary, WIKI_BASE } from "@/lib/wiki/api";

// Tool implementation. Uses the MediaWiki extracts API to pull a chunk
// of plain-text article content (capped at ~2500 chars). Each call is
// a durable step — retried on Wikipedia 503s, individually visible in
// workflow web. Soft-fails to an { error } object the model can read
// rather than throwing, because the agent loop handles "this tool
// didn't find anything" better than it handles "the workflow died."
const TOOL_EXTRACT_CHAR_CAP = 2500;
async function fetchWikipediaExtractStep(title: string): Promise<
  | {
      resolvedTitle: string;
      extract: string;
      canonicalUrl: string;
    }
  | { error: string }
> {
  "use step";
  const trimmed = title.trim();
  if (!trimmed) return { error: "title was empty" };
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exchars: String(TOOL_EXTRACT_CHAR_CAP),
    titles: trimmed,
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  const url = `${WIKI_BASE}/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "WikiCompass/1.0 (https://github.com/SafanAbbasi/WikiCompass; chat-tool)",
      Accept: "application/json",
    },
    cache: "force-cache",
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return { error: `Wikipedia returned ${res.status}` };
  }
  const data = (await res.json()) as {
    query?: {
      pages?: Array<{ title?: string; extract?: string; missing?: boolean }>;
    };
  };
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) {
    // Fall back to summary endpoint — sometimes the extracts API returns
    // nothing for redirected titles even with redirects=1.
    try {
      const summary = await fetchWikipediaSummary(trimmed);
      return {
        resolvedTitle: summary.title,
        extract: summary.extract,
        canonicalUrl: summary.canonicalUrl,
      };
    } catch {
      return { error: `No Wikipedia article found for "${trimmed}"` };
    }
  }
  const resolvedTitle = page.title ?? trimmed;
  return {
    resolvedTitle,
    extract: page.extract,
    canonicalUrl: `${WIKI_BASE}/wiki/${encodeURIComponent(resolvedTitle.replace(/\s+/g, "_"))}`,
  };
}

export const chatTools = {
  fetchWikipediaExtract: tool({
    description:
      "Fetch a plain-text excerpt (up to ~2500 chars) from the Wikipedia article for a given title. Use this when the user asks for details NOT in the map — specific events, dates, named entities, character relationships, technical depth — and the map's 1-3 sentence node explanations aren't enough to answer accurately. Prefer the map context first; reach for this tool when you'd otherwise have to guess from training data.",
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .max(200)
        .describe(
          "Wikipedia article title to fetch. Usually a node title from the map, but can be any related concept.",
        ),
    }),
    execute: async ({ title }) => fetchWikipediaExtractStep(title),
  }),
};
