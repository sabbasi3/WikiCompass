import type { WikiContext } from "./wiki";

export function filterCandidateLinks(
  links: { title: string; url: string }[],
  _maxLinks = 60,
): { title: string; url: string }[] {
  return links;
}

export function buildContextObject(_raw: unknown): WikiContext {
  throw new Error("buildContextObject not implemented");
}
