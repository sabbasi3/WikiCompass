// Post-generation URL verification. Some URLs the model writes outside
// our 150-candidate set are real articles we didn't include; some are
// real articles about the wrong topic (e.g. "Statistical learning" →
// the linguistics article). Keep a URL only if BOTH:
//   1. It resolves to a real, non-disambiguation Wikipedia article.
//   2. The resolved article's title roughly matches the model's intended
//      node title (Jaccard ≥ 0.6 on word sets, after stopword removal
//      and crude plural stemming).
// Errs conservative: false rejects just leave the node without a link
// (same as the old strip behavior). False accepts would mislead.

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
      .map((word) => word.replace(/[^a-z0-9]/g, ""))
      .filter((word) => word.length > 0 && !STOPWORDS.has(word))
      .map((word) => {
        if (word.endsWith("ies") && word.length > 4)
          return word.slice(0, -3) + "y";
        if (word.endsWith("es") && word.length > 3) return word.slice(0, -2);
        if (word.endsWith("s") && word.length > 2) return word.slice(0, -1);
        return word;
      }),
  );
}

function jaccard(intended: Set<string>, resolved: Set<string>): number {
  if (intended.size === 0 || resolved.size === 0) return 0;
  let intersection = 0;
  for (const word of intended) if (resolved.has(word)) intersection++;
  const union = intended.size + resolved.size - intersection;
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
