const WIKI_BASE = "https://en.wikipedia.org";

const GENERIC_TITLE_BLOCKLIST = new Set<string>([
  "Wikipedia",
  "Wikidata",
  "Wikimedia Commons",
  "Help",
  "PubMed",
  "PubMed Central",
  "Bibcode",
  "ArXiv",
  "JSTOR",
  "S2CID",
  "Semantic Scholar",
  "Google Scholar",
  "International Standard Book Number",
  "International Standard Serial Number",
  "Digital object identifier",
  "OCLC",
  "Library of Congress Control Number",
  "Geographic coordinate system",
  "Citation Style 1",
]);

const ADMIN_TITLE_PATTERNS: RegExp[] = [
  /^ISBN(\s|$)/i,
  /^ISSN(\s|$)/i,
  /^OCLC(\s|$)/i,
  /^PMID(\s|$)/i,
  /^DOI(\s|$)/i,
  /\(identifier\)$/i,
  /\(disambiguation\)$/i,
];

function isYearTitle(title: string): boolean {
  if (/^-?\d{1,4}$/.test(title)) return true;
  if (/^\d{1,2}(st|nd|rd|th) century( BC)?$/i.test(title)) return true;
  if (/^\d{1,4}s$/.test(title)) return true;
  if (/^\d{1,4} (BC|AD)$/i.test(title)) return true;
  return false;
}

function titleToUrl(title: string): string {
  const slug = title.replace(/\s+/g, "_");
  return `${WIKI_BASE}/wiki/${encodeURIComponent(slug)}`;
}

export function filterAndDedupeLinks(
  links: { title: string }[],
  max = 60,
): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const link of links) {
    const t = link.title.trim();
    if (!t) continue;
    const norm = t.toLowerCase();
    if (seen.has(norm)) continue;
    if (GENERIC_TITLE_BLOCKLIST.has(t)) continue;
    if (ADMIN_TITLE_PATTERNS.some((re) => re.test(t))) continue;
    if (isYearTitle(t)) continue;
    seen.add(norm);
    out.push({ title: t, url: titleToUrl(t) });
    if (out.length >= max) break;
  }
  return out;
}
