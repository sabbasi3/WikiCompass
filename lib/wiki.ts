// Wikipedia data-access layer

import { filterAndDedupeLinks } from "./link-filter";

const WIKI_BASE = "https://en.wikipedia.org";
// Identify this app to Wikipedia for API etiquette and easier operator debugging.
const WIKI_USER_AGENT =
  "WikiCompass/1.0 (https://github.com/SafanAbbasi/WikiCompass; learning-map-demo)";

export class DisambiguationError extends Error {
  constructor(public readonly title: string) {
    super(`"${title}" is a Wikipedia disambiguation page`);
    this.name = "DisambiguationError";
  }
}

export class WikipediaNotFoundError extends Error {
  constructor(public readonly title: string) {
    super(`"${title}" was not found on Wikipedia`);
    this.name = "WikipediaNotFoundError";
  }
}

export type WikiSearchResult = {
  title: string;
  pageId?: number;
  key?: string;
  description?: string;
  excerpt?: string;
  url?: string;
};

export type WikiContext = {
  title: string;
  summary: string;
  canonicalUrl: string;
  candidateLinks: { title: string; url: string }[];
  categories: string[];
  userLevel: "beginner" | "intermediate" | "advanced";
  userGoal?: string;
};

export type WikiSummary = {
  type: string;
  title: string;
  canonicalUrl: string;
  extract: string;
};

export type WikiLinksAndCategories = {
  links: { title: string }[];
  categories: string[];
};

async function wikiFetch(url: string, revalidate = 3600): Promise<Response> {
  // Centralize Wikipedia request policy: shared headers + Next.js data revalidation.
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: {
      "User-Agent": WIKI_USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate },
  };
  return fetch(url, init);
}

export function titleToUrl(title: string): string {
  // Wikipedia article paths conventionally use underscores between words.
  const slug = title.replace(/\s+/g, "_");
  return `${WIKI_BASE}/wiki/${encodeURIComponent(slug)}`;
}

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

// Merge two sources for disambiguation candidates and return up to
// `max` unique results. Search results take top slots (better
// quality ranking — surfaces "Mercury (element)" and "Freddie Mercury"
// for "Mercury"). Disambig page links fill remaining slots so
// abbreviation-style entries like "Machine learning" on the ML page
// (which strict search can't find — no title token match) still make
// it in. Single source of truth for the route + eval to share.
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

// For a known disambiguation page, fetch its actual link list rather
// than running a string-match search. The page's links are human-
// curated by Wikipedia editors and include things that don't string-
// match the title — e.g. "Machine learning" is listed on the "/wiki/ML"
// disambiguation page even though "ML" doesn't appear in the string
// "Machine learning". Strict search misses these; this doesn't.
export async function fetchDisambiguationCandidates(
  title: string,
  max = 10,
): Promise<WikiSearchResult[]> {
  const lc = await fetchWikipediaLinksAndCategories(title).catch(() => ({
    links: [] as { title: string }[],
    categories: [] as string[],
  }));
  // Reuse our standard junk filter (strips identifiers, year articles,
  // other disambig pages, etc.) and cap at `max`. The cap is generous
  // because disambig pages list 30+ links and Wikipedia's prop=links
  // returns alphabetically — without enough headroom, alphabetically-
  // late entries like "Machine learning" fall off.
  return filterAndDedupeLinks(lc.links, max).map((l) => ({
    title: l.title,
    url: l.url,
  }));
}

// "Did you mean..."-style search. Uses Wikipedia's opensearch API,
// which is fuzzy/typo-tolerant ("Photosynthsis" -> "Photosynthesis").
// The strict /v1/search/page endpoint used by searchWikipedia() returns
// zero results for typos, so we use this when we already know the title
// didn't resolve (404 path).
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

export async function fetchWikipediaSummary(
  title: string,
): Promise<WikiSummary> {
  const key = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url = `${WIKI_BASE}/api/rest_v1/page/summary/${key}?redirect=true`;
  const res = await wikiFetch(url);
  if (res.status === 404) throw new WikipediaNotFoundError(title);
  if (!res.ok) {
    throw new Error(
      `Wikipedia summary failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as {
    type?: string;
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  return {
    type: data.type ?? "standard",
    title: data.title ?? title,
    canonicalUrl: data.content_urls?.desktop?.page ?? titleToUrl(title),
    extract: data.extract ?? "",
  };
}

export async function fetchWikipediaLinksAndCategories(
  title: string,
): Promise<WikiLinksAndCategories> {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    page: title,
    prop: "links|categories",
    redirects: "1",
  });
  const url = `${WIKI_BASE}/w/api.php?${params.toString()}`;
  const res = await wikiFetch(url);
  if (!res.ok) {
    throw new Error(`Wikipedia parse failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    error?: { code: string; info: string };
    parse?: {
      links?: Array<{ ns: number; exists?: boolean; title: string }>;
      categories?: Array<{
        sortkey?: string;
        hidden?: boolean;
        category: string;
      }>;
    };
  };
  if (data.error) {
    if (data.error.code === "missingtitle")
      throw new WikipediaNotFoundError(title);
    throw new Error(`Wikipedia parse error: ${data.error.info}`);
  }
  const rawLinks = data.parse?.links ?? [];
  const rawCats = data.parse?.categories ?? [];
  return {
    links: rawLinks
      .filter((l) => l.ns === 0 && l.exists !== false)
      .map((l) => ({ title: l.title.replace(/_/g, " ") })),
    categories: rawCats
      .filter((c) => !c.hidden)
      .map((c) => (c.category ?? "").replace(/_/g, " "))
      .filter(Boolean),
  };
}

export async function fetchWikipediaLeadLinks(
  title: string,
): Promise<{ title: string }[]> {
  // Pull only lead-section links so core concepts can be prioritized later.
  // Soft-fails to [] on any error: the caller (getWikipediaContext) merges
  // these with full-page links and tolerates an empty lead-link list. But
  // a silent empty list means we lose lead-priority ordering, which is the
  // root cause behind coverage gaps in the eval suite — log when it fires
  // so ops can see it.
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    page: title,
    prop: "links",
    section: "0",
    redirects: "1",
  });
  const url = `${WIKI_BASE}/w/api.php?${params.toString()}`;
  const res = await wikiFetch(url);
  if (!res.ok) {
    console.warn(
      `[wiki] fetchWikipediaLeadLinks fell back to []: ${res.status} ${res.statusText} for "${title}"`,
    );
    return [];
  }
  const data = (await res.json()) as {
    error?: { code: string; info?: string };
    parse?: {
      links?: Array<{ ns: number; exists?: boolean; title: string }>;
    };
  };
  if (data.error) {
    console.warn(
      `[wiki] fetchWikipediaLeadLinks fell back to []: ${data.error.code}${data.error.info ? ` (${data.error.info})` : ""} for "${title}"`,
    );
    return [];
  }
  const rawLinks = data.parse?.links ?? [];
  return rawLinks
    .filter((l) => l.ns === 0 && l.exists !== false)
    .map((l) => ({ title: l.title.replace(/_/g, " ") }));
}

export async function getWikipediaContext(
  title: string,
  userLevel: WikiContext["userLevel"],
  userGoal?: string,
): Promise<WikiContext> {
  // Fetch summary + full links/categories + lead links in parallel to reduce latency.
  const [summary, lc, leadLinks] = await Promise.all([
    fetchWikipediaSummary(title),
    fetchWikipediaLinksAndCategories(title),
    fetchWikipediaLeadLinks(title),
  ]);
  // Disambiguation is a deterministic UX choice; do not send ambiguous topics to the model.
  if (summary.type === "disambiguation") {
    throw new DisambiguationError(summary.title);
  }
  // Prepend lead links before full-page links, then filter/dedupe to the candidate cap.
  const mergedLinks = [...leadLinks, ...lc.links];
  const candidateLinks = filterAndDedupeLinks(mergedLinks, 60);
  return {
    title: summary.title,
    summary: summary.extract,
    canonicalUrl: summary.canonicalUrl,
    candidateLinks,
    categories: lc.categories.slice(0, 12),
    userLevel,
    userGoal,
  };
}
