// Wikipedia API access: low-level fetch helpers, error classes, and the
// types they return. No orchestration, no search/disambiguation logic —
// just the raw mappings from a single API call to a typed result.

export const WIKI_BASE = "https://en.wikipedia.org";

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

// All Wikipedia API calls funnel through here — one place to adjust the
// User-Agent, cache window, or add timeout/retry policy later. Repeated
// requests for the same URL are served from Next.js Data Cache; measured
// 142ms cold → 2ms warm on the same URL with revalidate=3600.
export async function wikiFetch(
  url: string,
  revalidate = 3600,
): Promise<Response> {
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

// Summary endpoint also returns the article shape (standard | disambiguation
// | mainpage | no-extract). getWikipediaContext branches on "disambiguation"
// to throw before any AI work runs. redirect=true so aliases resolve transparently.
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

// Lead-section links only — concepts the article depends on, the "first
// paragraph" set. Caller merges these first into the candidate set so they
// win the dedup race over tail links.
export async function fetchWikipediaLeadLinks(
  title: string,
): Promise<{ title: string }[]> {
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

// See Also section links — editor-curated "related concepts," different
// signal from lead links (which are concepts the topic depends on).
// Two API calls: first find the section index by name, then fetch its
// links. Soft-fails to [] when no See Also exists (common on short articles).
export async function fetchWikipediaSeeAlsoLinks(
  title: string,
): Promise<{ title: string }[]> {
  const sectionsParams = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    page: title,
    prop: "sections",
    redirects: "1",
  });
  const sectionsRes = await wikiFetch(
    `${WIKI_BASE}/w/api.php?${sectionsParams.toString()}`,
  );
  if (!sectionsRes.ok) {
    console.warn(
      `[wiki] fetchWikipediaSeeAlsoLinks fell back to []: sections fetch ${sectionsRes.status} for "${title}"`,
    );
    return [];
  }
  const sectionsData = (await sectionsRes.json()) as {
    error?: { code: string; info?: string };
    parse?: {
      sections?: Array<{ line: string; index: string }>;
    };
  };
  if (sectionsData.error) {
    console.warn(
      `[wiki] fetchWikipediaSeeAlsoLinks fell back to []: ${sectionsData.error.code} for "${title}"`,
    );
    return [];
  }
  const sections = sectionsData.parse?.sections ?? [];
  const seeAlso = sections.find((s) => /^see\s*also$/i.test(s.line ?? ""));
  if (!seeAlso) return [];

  const linksParams = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    page: title,
    prop: "links",
    section: seeAlso.index,
    redirects: "1",
  });
  const linksRes = await wikiFetch(
    `${WIKI_BASE}/w/api.php?${linksParams.toString()}`,
  );
  if (!linksRes.ok) {
    console.warn(
      `[wiki] fetchWikipediaSeeAlsoLinks fell back to []: links fetch ${linksRes.status} for "${title}"`,
    );
    return [];
  }
  const linksData = (await linksRes.json()) as {
    error?: { code: string; info?: string };
    parse?: {
      links?: Array<{ ns: number; exists?: boolean; title: string }>;
    };
  };
  if (linksData.error) {
    console.warn(
      `[wiki] fetchWikipediaSeeAlsoLinks fell back to []: ${linksData.error.code} for "${title}"`,
    );
    return [];
  }
  const rawLinks = linksData.parse?.links ?? [];
  return rawLinks
    .filter((l) => l.ns === 0 && l.exists !== false)
    .map((l) => ({ title: l.title.replace(/_/g, " ") }));
}
