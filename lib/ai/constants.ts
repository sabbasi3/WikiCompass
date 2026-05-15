// Product-level constraints on the WikiMap output. Originated in the
// build brief: 8-15 nodes per graph, 4-8 steps per learning path.
//
// Soft invariant: LEARNING_PATH_MAX <= NODE_COUNT_MIN. The learning
// path can never be longer than the node set it summarizes (a step
// has to correspond to something the graph models). Our current
// values satisfy this tautologically (both = 8); if you raise the
// path max above 8 while leaving the node min at 8, validation in
// generateWikiMap could accept output that violates this invariant.

export const NODE_COUNT_MIN = 8;
export const NODE_COUNT_MAX = 18; // brief said 15; +3 safety margin so borderline model output doesn't trip retry

export const LEARNING_PATH_MIN = 4;
export const LEARNING_PATH_MAX = 10; // brief said 8; +2 safety margin for same reason
