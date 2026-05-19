// The request-time orchestrator. Combines parallel API calls into the
// WikiContext bundle that the AI prompt and post-AI validation both
// consume. The boundary between "Wikipedia data" and "AI input."

import { filterAndDedupeLinks } from "../link-filter";

import {
  DisambiguationError,
  fetchWikipediaLeadLinks,
  fetchWikipediaLinksAndCategories,
  fetchWikipediaSeeAlsoLinks,
  fetchWikipediaSummary,
} from "./api";

// Cap tuned empirically. At 60 the model reaches outside the set ~25% of
// the time. At 150 it drops to ~3%. Tried 200 — eval pass rate became
// unstable (10/11, 8/11, 11/11 across runs) because the bigger input
// pushes some generations into schema-violation territory. 150 is the
// sweet spot: good coverage, stable eval output.
const MAX_CANDIDATE_LINKS = 150;

export type WikiContext = {
  title: string;
  summary: string;
  canonicalUrl: string;
  candidateLinks: { title: string; url: string }[];
  categories: string[];
  userLevel: "beginner" | "intermediate" | "advanced";
  userGoal?: string;
};

export async function getWikipediaContext(
  title: string,
  userLevel: WikiContext["userLevel"],
  userGoal?: string,
): Promise<WikiContext> {
  // Fetch summary + full links/categories + lead links + See Also links in
  // parallel to reduce latency. See Also is editor-curated "related concepts
  // worth knowing" — different signal from lead links (which are concepts the
  // article *depends on*).
  const [summary, lc, leadLinks, seeAlsoLinks] = await Promise.all([
    fetchWikipediaSummary(title),
    fetchWikipediaLinksAndCategories(title),
    fetchWikipediaLeadLinks(title),
    fetchWikipediaSeeAlsoLinks(title),
  ]);
  // Ambiguity is a deterministic UX choice — never let the model guess which
  // Mercury (planet / element / Freddie / Roman god) the user meant. Throw
  // here; the route catches DisambiguationError and returns 409 with a
  // chooser candidate list. See app/api/wiki/map/route.ts.
  if (summary.type === "disambiguation") {
    throw new DisambiguationError(summary.title);
  }
  // Merge order matters — earlier wins the dedup race in filterAndDedupeLinks.
  // Lead links first (what the article depends on), then See Also (what editors
  // think is related), then the long tail of all other page links.
  const mergedLinks = [...leadLinks, ...seeAlsoLinks, ...lc.links];
  const candidateLinks = filterAndDedupeLinks(mergedLinks, MAX_CANDIDATE_LINKS);
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
