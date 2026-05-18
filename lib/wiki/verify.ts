// Post-generation URL verification with title-match check.
//
// The model can produce Wikipedia URLs that aren't in the candidateLinks
// set we sent. Most are real articles we just didn't include (cap is 100;
// popular topics link to hundreds), but some are wrong — the model
// sometimes pairs a node title with a URL whose article is about a
// different topic (e.g. "Statistical learning" -> the linguistics article).
//
// We require two things to keep a URL:
//   1. The URL resolves to a real, non-disambiguation Wikipedia article.
//   2. The resolved article's title matches the model's intended node
//      title (Jaccard similarity >= 0.5 on word sets, after stopword
//      removal and crude plural stemming).
//
// False rejects (real link dropped) just leave the node without a link —
// the same degradation we had before verification existed.
// False accepts (wrong link kept) would mislead the user — strictly worse.
// The asymmetry justifies erring conservative.

import { WIKI_BASE, fetchWikipediaSummary } from "./api";

// Common English connectors that add length without topic signal. Dropped
// before computing similarity so "Statistical learning in language X"
// doesn't get partial credit for the "in" preposition.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "to",
  "by",
  "with",
]);

// Lowercase, split on whitespace/punctuation, drop stopwords, and apply
// crude plural stemming so "Neural networks" matches "Neural network".
function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[\s\-_/(),.]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 0 && !STOPWORDS.has(w))
      .map((w) => {
        if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
        if (w.endsWith("es") && w.length > 3) return w.slice(0, -2);
        if (w.endsWith("s") && w.length > 2) return w.slice(0, -1);
        return w;
      }),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

// Tuned empirically: 0.5 lets "Statistical learning" pass to a 4-word
// resolved title ("Statistical learning in language acquisition") via
// 2/4 = 0.5, which is wrong. 0.6 rejects that case while still accepting
// "Decision tree" -> "Decision tree learning" (0.67) and plural redirects
// after stemming.
const TITLE_MATCH_THRESHOLD = 0.6;

// Extract a Wikipedia article title from a URL string, or return null
// if it's not an en.wikipedia.org article URL we can verify.
function extractTitleFromWikiUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== WIKI_BASE) return null;
  if (!parsed.pathname.startsWith("/wiki/")) return null;
  let title: string;
  try {
    title = decodeURIComponent(parsed.pathname.slice("/wiki/".length));
  } catch {
    return null;
  }
  if (!title) return null;
  // Reject non-article namespaces (User:, Talk:, File:, Category:, etc.)
  if (title.includes(":")) return null;
  return title.replace(/_/g, " ");
}

export type UrlVerifyInput = {
  url: string;
  intendedTitle: string;
};

export async function verifyWikipediaUrls(
  pairs: UrlVerifyInput[],
): Promise<Set<string>> {
  const verified = new Set<string>();
  await Promise.all(
    pairs.map(async ({ url, intendedTitle }) => {
      const urlTitle = extractTitleFromWikiUrl(url);
      if (!urlTitle) return;
      try {
        const summary = await fetchWikipediaSummary(urlTitle);
        // Skip disambiguation pages — surfacing one as a "Learn more" link
        // dumps the user onto a chooser instead of an article.
        if (summary.type === "disambiguation") return;
        // Reject when the resolved article isn't about the same topic as
        // the node title. Catches cases like "Statistical learning" ->
        // the language-acquisition article, or "Neural network performance"
        // -> AlexNet, where the URL is a real article but the wrong one.
        const intended = normalizeTitle(intendedTitle);
        const resolved = normalizeTitle(summary.title);
        if (jaccard(intended, resolved) < TITLE_MATCH_THRESHOLD) return;
        verified.add(url);
      } catch {
        // Not found, network error, etc. — leave unverified, strip will drop.
      }
    }),
  );
  return verified;
}
