export type WikiSearchResult = {
  title: string;
  pageId?: number;
  description?: string;
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

export async function searchWikipedia(
  _query: string,
): Promise<WikiSearchResult[]> {
  throw new Error("searchWikipedia not implemented");
}

export async function getWikipediaContext(
  _title: string,
  _userLevel: WikiContext["userLevel"],
  _userGoal?: string,
): Promise<WikiContext> {
  throw new Error("getWikipediaContext not implemented");
}
