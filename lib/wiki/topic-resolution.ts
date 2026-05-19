// Topic-resolution helpers: turn the user's raw input into a usable topic
// even when it doesn't cleanly match a Wikipedia article. Fires on the
// unhappy paths — ambiguous topics (Mercury → chooser), typos (Photosynthsis
// → did-you-mean). Higher-level than api.ts: each public function composes
// multiple API calls + filtering to return ranked/curated candidate lists
// the UI renders directly.

import { filterAndDedupeLinks } from "../link-filter";

import {
  WIKI_BASE,
  fetchWikipediaLinksAndCategories,
  wikiFetch,
  type WikiSearchResult,
} from "./api";

// Strict title-token search. Returns Wikipedia's quality-ranked
// matches for a query. Misses entries that don't string-match the
// query (e.g. "Machine learning" for "ML" — no token overlap).
export async function searchWikipedia(
  query: string,
  limit = 10,
): Promise<WikiSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  const url = `${WIKI_BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(trimmedQuery)}&limit=${limit}`;
  const res = await wikiFetch(url);
  if (!res.ok) {
    throw new Error(`Wikipedia search failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    pages?: Array<{
      id: number;
      key: string;
      title: string;
      excerpt?: string;
      description?: string;
    }>;
  };
  return (data.pages ?? []).map((page) => ({
    title: page.title,
    pageId: page.id,
    key: page.key,
    description: page.description,
    excerpt:
      typeof page.excerpt === "string"
        ? page.excerpt.replace(/<[^>]+>/g, "")
        : undefined,
    url: page.key ? `${WIKI_BASE}/wiki/${page.key}` : undefined,
  }));
}

// Uses Wikipedia's opensearch API, which is fuzzy/typo-tolerant ("Photosynthsis" -> "Photosynthesis").
// The strict /v1/search/page endpoint used by searchWikipedia() returns
// zero results for typos.
// for the typo / "no article" case. Not for ambiguous topics.
export async function suggestWikipediaTitles(
  query: string,
  limit = 5,
): Promise<WikiSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  const url = `${WIKI_BASE}/w/api.php?action=opensearch&search=${encodeURIComponent(trimmedQuery)}&limit=${limit}&format=json`;
  const res = await wikiFetch(url);
  if (!res.ok) return [];
  // opensearch shape: [query, titles[], descriptions[], urls[]]
  const data = (await res.json()) as
    | [string, string[], string[], string[]]
    | unknown;
  if (!Array.isArray(data) || data.length < 4) return [];
  const [, titles, descriptions, urls] = data as [
    string,
    string[],
    string[],
    string[],
  ];
  return titles.map((title, i) => ({
    title,
    description: descriptions[i] || undefined,
    url: urls[i],
  }));
}

// Fetch the disambig page's human-curated link list. Catches
// abbreviation-style entries (e.g. "Machine learning" on /wiki/ML)
// that strict search misses — no title token match.
export async function fetchDisambiguationCandidates(
  title: string,
  max: number,
): Promise<WikiSearchResult[]> {
  const linksAndCategories = await fetchWikipediaLinksAndCategories(
    title,
  ).catch(() => ({
    links: [] as { title: string }[],
    categories: [] as string[],
  }));
  return filterAndDedupeLinks(linksAndCategories.links, max).map((link) => ({
    title: link.title,
    url: link.url,
  }));
}

// Merge search (quality-ranked top slots) + disambig page links
// (coverage for entries search can't find). Powers the disambig
// chooser; shared by route + eval.
export async function fetchAmbiguousCandidates(
  title: string,
  max = 15,
): Promise<WikiSearchResult[]> {
  const [search, page] = await Promise.all([
    searchWikipedia(title, 8).catch(() => []),
    fetchDisambiguationCandidates(title, 15).catch(() => []),
  ]);
  const seen = new Set<string>();
  const candidates: WikiSearchResult[] = [];
  for (const result of [...search, ...page]) {
    if (seen.has(result.title)) continue;
    seen.add(result.title);
    candidates.push(result);
    if (candidates.length >= max) break;
  }
  return candidates;
}
