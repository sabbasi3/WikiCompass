import type { WikiContext } from "./wiki";
import {
  LEARNING_PATH_MAX,
  LEARNING_PATH_MIN,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
} from "./ai/constants";
import type { Grounding, WikiMap } from "./schemas";

export type StripResult = {
  map: WikiMap;
  strippedNodeUrls: string[];
  strippedPathUrls: string[];
};

export function buildAllowedUrlSet(context: WikiContext): Set<string> {
  return new Set<string>([
    context.canonicalUrl,
    ...context.candidateLinks.map((l) => l.url),
  ]);
}

// Collect every (url, title) pair the model wrote where the URL isn't in
// the allowed set. Deduped by url+title — the verifier checks the resolved
// Wikipedia article's title against the intended title, so the title side
// of the pair matters.
export function collectUnknownUrls(
  map: WikiMap,
  allowed: Set<string>,
): Array<{ url: string; intendedTitle: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; intendedTitle: string }> = [];
  const add = (url: string | null, title: string) => {
    if (!url || allowed.has(url)) return;
    const key = `${url}|${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, intendedTitle: title });
  };
  for (const n of map.nodes) add(n.wikipediaUrl, n.title);
  for (const s of map.learningPath) add(s.wikipediaUrl, s.title);
  return out;
}

// Final URL filter — runs AFTER verify has added Wikipedia-confirmed URLs
// to `allowed`, so what gets stripped here is genuinely unverifiable.
// Null URLs render as plain text in the UI.
export function stripHallucinatedUrls(
  map: WikiMap,
  allowed: Set<string>,
): StripResult {
  const strippedNodeUrls: string[] = [];
  const strippedPathUrls: string[] = [];

  const nodes = map.nodes.map((n) => {
    if (n.wikipediaUrl && !allowed.has(n.wikipediaUrl)) {
      strippedNodeUrls.push(`${n.title}: ${n.wikipediaUrl}`);
      return { ...n, wikipediaUrl: null };
    }
    return n;
  });

  // Same pass for the learning path — its steps reference URLs independently
  // from the nodes array (the model can supply a URL on a path step without
  // a matching node).
  const learningPath = map.learningPath.map((s) => {
    if (s.wikipediaUrl && !allowed.has(s.wikipediaUrl)) {
      strippedPathUrls.push(`${s.title}: ${s.wikipediaUrl}`);
      return { ...s, wikipediaUrl: null };
    }
    return s;
  });

  return {
    map: { ...map, nodes, learningPath },
    strippedNodeUrls,
    strippedPathUrls,
  };
}

export type GraphIssue = {
  kind:
    | "missing_edge_target"
    | "missing_edge_source"
    | "wrong_main_topic_count"
    | "node_count_out_of_range"
    | "path_length_out_of_range";
  detail: string;
};

// Structural validation of the AI's output. Catches four classes of bug:
//   - Dangling edges: source or target id doesn't match any node
//   - Wrong main_topic count: must be exactly 1 (rule 5 in the prompt)
//   - Node count out of [8, 18] range (rule 5)
//   - Learning path length out of [4, 10] range (rule 7)
// Non-blocking by design: we ship the issues in meta and keep rendering.
// A graph with one bad edge is still ~95% useful, and React Flow silently
// ignores edges with missing endpoints anyway. Hard-failing would punish
// the user for a model glitch that the eval suite already tracks.
export function checkGraphIntegrity(map: WikiMap): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set(map.nodes.map((n) => n.id));

  for (const e of map.edges) {
    if (!nodeIds.has(e.source)) {
      issues.push({
        kind: "missing_edge_source",
        detail: `edge source "${e.source}" not in nodes`,
      });
    }
    if (!nodeIds.has(e.target)) {
      issues.push({
        kind: "missing_edge_target",
        detail: `edge target "${e.target}" not in nodes`,
      });
    }
  }

  const mainCount = map.nodes.filter((n) => n.type === "main_topic").length;
  if (mainCount !== 1) {
    issues.push({
      kind: "wrong_main_topic_count",
      detail: `expected 1 main_topic, found ${mainCount}`,
    });
  }

  if (map.nodes.length < NODE_COUNT_MIN || map.nodes.length > NODE_COUNT_MAX) {
    issues.push({
      kind: "node_count_out_of_range",
      detail: `node count ${map.nodes.length} not in [${NODE_COUNT_MIN}, ${NODE_COUNT_MAX}]`,
    });
  }

  if (
    map.learningPath.length < LEARNING_PATH_MIN ||
    map.learningPath.length > LEARNING_PATH_MAX
  ) {
    issues.push({
      kind: "path_length_out_of_range",
      detail: `learning path length ${map.learningPath.length} not in [${LEARNING_PATH_MIN}, ${LEARNING_PATH_MAX}]`,
    });
  }

  return issues;
}

// Build trusted metadata about where map concepts came from.
export function computeGrounding(
  map: WikiMap,
  context: WikiContext,
): Grounding {
  // Keep only nodes that have a real URL.
  const nodesWithUrls = map.nodes.filter(
    (n): n is typeof n & { wikipediaUrl: string } => Boolean(n.wikipediaUrl),
  );
  return {
    mainArticleTitle: context.title,
    candidateLinkCount: context.candidateLinks.length,
    selectedConceptCount: nodesWithUrls.length,
    selectedConcepts: nodesWithUrls.map((n) => ({
      title: n.title,
      url: n.wikipediaUrl,
    })),
  };
}
