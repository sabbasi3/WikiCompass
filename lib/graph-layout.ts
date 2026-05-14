import dagre from "dagre";

import type { WikiMap } from "./ai/schema";

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
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 50,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  for (const node of map.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of map.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = map.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      data: node,
      position: {
        x: pos ? pos.x - NODE_WIDTH / 2 : 0,
        y: pos ? pos.y - NODE_HEIGHT / 2 : 0,
      },
    };
  });

  const edges: LayoutEdge[] = map.edges
    .filter(
      (e) =>
        nodes.some((n) => n.id === e.source) &&
        nodes.some((n) => n.id === e.target),
    )
    .map((edge, i) => ({
      id: `e${i}-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: edge.relationship.replace(/_/g, " "),
    }));

  return { nodes, edges };
}
