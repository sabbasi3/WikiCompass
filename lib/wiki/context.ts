// The request-time orchestrator. Combines parallel API calls into the
// WikiContext bundle that the AI prompt and post-AI validation both
// consume. The boundary between "Wikipedia data" and "AI input."

import { filterAndDedupeLinks } from "../link-filter";

import {
  DisambiguationError,
  fetchWikipediaLeadLinks,
  fetchWikipediaLinksAndCategories,
  fetchWikipediaSummary,
} from "./api";

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
