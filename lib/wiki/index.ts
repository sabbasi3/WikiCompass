// Barrel re-export so existing consumers (route, hook, validation,
// prompt, generator, eval, scripts) keep importing from "@/lib/wiki"
// without per-file path changes.
//
// Three internal modules:
//   ./api     — low-level Wikipedia API helpers, error classes, types
//   ./search  — search/suggest/disambig candidate fetching
//   ./context — getWikipediaContext orchestrator + WikiContext type

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
} from "./search";

export { getWikipediaContext, type WikiContext } from "./context";

export { verifyWikipediaUrls } from "./verify";
