import type { WikiContext } from "./wiki";
import type { WikiMap } from "./ai/schema";

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

  if (map.nodes.length < 8 || map.nodes.length > 15) {
    issues.push({
      kind: "node_count_out_of_range",
      detail: `node count ${map.nodes.length} not in [8, 15]`,
    });
  }

  if (map.learningPath.length < 4 || map.learningPath.length > 8) {
    issues.push({
      kind: "path_length_out_of_range",
      detail: `learning path length ${map.learningPath.length} not in [4, 8]`,
    });
  }

  return issues;
}

export function overrideGrounding(map: WikiMap, context: WikiContext): WikiMap {
  const nodesWithUrls = map.nodes.filter((n) => n.wikipediaUrl);
  return {
    ...map,
    grounding: {
      mainArticleTitle: context.title,
      candidateLinkCount: context.candidateLinks.length,
      selectedConceptCount: nodesWithUrls.length,
      selectedTitles: nodesWithUrls.map((n) => n.title),
    },
  };
}
