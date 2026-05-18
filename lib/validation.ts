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

// Remove any Wikipedia URLs from nodes and learningPath that are not in the allowed set.
// This prevents "hallucinated" (AI-invented or non-canonical) links from leaking into the UI.
// Stripped URLs are collected for downstream reporting/debugging.
export function stripHallucinatedUrls(
  map: WikiMap,
  allowed: Set<string>,
): StripResult {
  // Collect URLs that are not in the allowed set for reporting/debugging.
  const strippedNodeUrls: string[] = [];
  const strippedPathUrls: string[] = [];

  // Remove Wikipedia URLs from nodes if they are not in the allowed set.
  const nodes = map.nodes.map((n) => {
    if (n.wikipediaUrl && !allowed.has(n.wikipediaUrl)) {
      strippedNodeUrls.push(`${n.title}: ${n.wikipediaUrl}`);
      return { ...n, wikipediaUrl: null };
    }
    return n;
  });

  // Do the same for the learning path, which may reference a subset of nodes.
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

// Compute the grounding metadata for a generated map. Every field
// comes from context (server-fetched) or from filtering the model's
// nodes — never from the model's own self-reported counts. Returned
// separately so it travels alongside the map in the response shape,
// not inside it.
export function computeGrounding(
  map: WikiMap,
  context: WikiContext,
): Grounding {
  // Type guard narrows wikipediaUrl from `string | null` to `string`
  // so the selectedConcepts entries have non-null URLs without a `!`.
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
