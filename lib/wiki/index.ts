// Barrel re-export so consumers (route, hook, validation, prompt,
// generator, eval, scripts) keep importing from "@/lib/wiki" without
// per-file path changes.
//
// Four internal modules:
//   ./api                — low-level Wikipedia API helpers, error classes, types
//   ./build-wiki-context — orchestrates the AI-input bundle (WikiContext)
//   ./topic-resolution   — handle unresolved topics (ambiguity, typos) for the UI
//   ./verify             — post-AI URL verification (title-match check)

export {
  DisambiguationError,
  WikipediaNotFoundError,
  fetchWikipediaLeadLinks,
  fetchWikipediaLinksAndCategories,
  fetchWikipediaSeeAlsoLinks,
  fetchWikipediaSummary,
  titleToUrl,
  type WikiLinksAndCategories,
  type WikiSearchResult,
  type WikiSummary,
} from "./api";

export {
  fetchAmbiguousCandidates,
  fetchDisambiguationCandidates,
  searchWikipedia,
  suggestWikipediaTitles,
} from "./topic-resolution";

export { getWikipediaContext, type WikiContext } from "./build-wiki-context";

export { verifyWikipediaUrls } from "./verify";
