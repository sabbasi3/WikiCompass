import { filterAndDedupeLinks } from "./context";

const WIKI_BASE = "https://en.wikipedia.org";
const WIKI_USER_AGENT =
  "WikiPath/1.0 (https://github.com/safanabbasi3/wikipath; learning-map-demo)";

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

export async function getWikipediaContext(
  title: string,
  userLevel: WikiContext["userLevel"],
  userGoal?: string,
): Promise<WikiContext> {
  const [summary, lc] = await Promise.all([
    fetchWikipediaSummary(title),
    fetchWikipediaLinksAndCategories(title),
  ]);
  if (summary.type === "disambiguation") {
    throw new DisambiguationError(summary.title);
  }
  const candidateLinks = filterAndDedupeLinks(lc.links, 60);
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
