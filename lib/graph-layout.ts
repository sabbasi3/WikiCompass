import dagre from "dagre";

import type { WikiMap } from "./schemas";

export type LayoutNode = {
  id: string;
  position: { x: number; y: number };
  data: WikiMap["nodes"][number];
};

export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

export function computeGraphLayout(map: WikiMap): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
} {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: 40,
    ranksep: 50,
    marginx: 12,
    marginy: 12,
  });

  for (const node of map.nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of map.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  const nodes: LayoutNode[] = map.nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      id: node.id,
      data: node,
      position: {
        x: position ? position.x - NODE_WIDTH / 2 : 0,
        y: position ? position.y - NODE_HEIGHT / 2 : 0,
      },
    };
  });

  const edges: LayoutEdge[] = map.edges
    .filter(
      (edge) =>
        nodes.some((node) => node.id === edge.source) &&
        nodes.some((node) => node.id === edge.target),
    )
    .map((edge, i) => ({
      id: `e${i}-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: edge.relationship.replace(/_/g, " "),
    }));

  return { nodes, edges };
}
