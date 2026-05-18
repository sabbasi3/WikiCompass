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

// Cap on the candidate link set sent to the model. Originally 60 (brief's
// upper bound). Bumped to 100 to make room for See Also links, then to
// 150 after measuring: dropped the model's "outside the candidate set"
// rate from ~25% to ~3%. Tried 200 but it introduced eval variance —
// across 3 runs, pass rates were 10/11, 8/11, 11/11. 150 ran 11/11 on
// repeated runs. More candidates means more material for the model to
// juggle, which occasionally pushes it into schema-violation territory.
// 150 is the sweet spot: good coverage, stable output.
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
  // Disambiguation is a deterministic UX choice; do not send ambiguous topics to the model.
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
