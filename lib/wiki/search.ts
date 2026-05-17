// Search, suggestion, and disambiguation candidate fetching. Higher-
// level than api.ts — these functions compose API calls + filtering
// to return ranked/curated candidate lists for the UI.

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
  const q = query.trim();
  if (!q) return [];
  const url = `${WIKI_BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${limit}`;
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
  return (data.pages ?? []).map((p) => ({
    title: p.title,
    pageId: p.id,
    key: p.key,
    description: p.description,
    excerpt:
      typeof p.excerpt === "string"
        ? p.excerpt.replace(/<[^>]+>/g, "")
        : undefined,
    url: p.key ? `${WIKI_BASE}/wiki/${p.key}` : undefined,
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
  const q = query.trim();
  if (!q) return [];
  const url = `${WIKI_BASE}/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&format=json`;
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
  const lc = await fetchWikipediaLinksAndCategories(title).catch(() => ({
    links: [] as { title: string }[],
    categories: [] as string[],
  }));
  return filterAndDedupeLinks(lc.links, max).map((l) => ({
    title: l.title,
    url: l.url,
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
  const out: WikiSearchResult[] = [];
  for (const r of [...search, ...page]) {
    if (seen.has(r.title)) continue;
    seen.add(r.title);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
