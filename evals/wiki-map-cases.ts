// The eval cases. Grouped by what each case is exercising. Add a case
// to extend coverage; the type system enforces field correctness.

import type { EvalCase } from "./eval-case";

export const cases: EvalCase[] = [
  // ─────────────────────────────────────────────────────────────────
  // Core pipeline sanity check. ML is the canonical demo topic — we
  // assert the foundational concepts surface and nothing off-topic
  // sneaks in. audienceLevel adaptation is tested separately via
  // `npm run test-prompt` (no model call needed).
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "Machine learning",
    level: "beginner",
    expectedTopicType: "concept",
    expectedMustInclude: [
      "Artificial intelligence",
      "Supervised learning",
      "Neural network",
    ],
    forbidden: ["World War II", "Cooking", "Basketball"],
  },

  // ─────────────────────────────────────────────────────────────────
  // Domain sanity check — a different concept domain to make sure the
  // pipeline isn't ML-specific.
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "Photosynthesis",
    level: "beginner",
    expectedTopicType: "concept",
    expectedMustInclude: ["Oxygen", "Carbon dioxide", "Plant"],
    forbidden: ["Quantum computing", "Stock market"],
  },

  // ─────────────────────────────────────────────────────────────────
  // Topic-type classification (rule 3). One case per declared topic
  // type. Misclassification cascades into rule 4 applying the wrong
  // arc — e.g. biographies forced into prerequisite-heavy concept
  // structure. The forbidden list catches off-topic drift (a Tokyo
  // map should not mention machine learning).
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "World War I",
    level: "beginner",
    expectedTopicType: "event",
    expectedMustInclude: ["Germany", "France", "Empire"],
    forbidden: ["Machine learning", "Photosynthesis"],
  },
  {
    topic: "Bill Gates",
    level: "beginner",
    expectedTopicType: "person",
    expectedMustInclude: ["Microsoft", "Personal computer"],
    forbidden: ["Photosynthesis", "Quantum computing"],
  },
  {
    topic: "Tokyo",
    level: "beginner",
    expectedTopicType: "place",
    expectedMustInclude: ["Japan"],
    forbidden: ["Machine learning", "Photosynthesis"],
  },
  {
    topic: "NASA",
    level: "beginner",
    expectedTopicType: "organization",
    expectedMustInclude: ["United States"],
    forbidden: ["Photosynthesis", "Cooking"],
  },
  {
    topic: "Hamlet",
    level: "beginner",
    expectedTopicType: "work",
    expectedMustInclude: ["Shakespeare"],
    forbidden: ["Quantum computing", "Photosynthesis"],
  },

  // ─────────────────────────────────────────────────────────────────
  // Personalization (rule 11). userGoal must flow through to the
  // prompt and the resulting whyThisPath must echo the goal keywords.
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "Bill Gates",
    level: "beginner",
    expectedTopicType: "person",
    userGoal:
      "I have a software engineering interview at Microsoft next week and want to focus on his role in founding the company.",
    expectedGoalEcho: ["Microsoft", "interview"],
    expectedMustInclude: ["Microsoft"],
    forbidden: ["Photosynthesis"],
  },

  // ─────────────────────────────────────────────────────────────────
  // Ambiguous topics — must throw DisambiguationError, never let the
  // model guess. Tests the disambig+opensearch merge surfaces both
  // the obvious meanings (planet/element/Freddie) and abbreviation-
  // style entries the strict search misses ("Machine learning" on /wiki/ML).
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "Mercury",
    level: "beginner",
    expectedBehavior: "ambiguous",
    expectedCandidatesInclude: [
      "Mercury (planet)",
      "Mercury (element)",
      "Freddie Mercury",
    ],
  },
  {
    topic: "ML",
    level: "beginner",
    expectedBehavior: "ambiguous",
    expectedCandidatesInclude: ["Machine learning"],
  },

  // ─────────────────────────────────────────────────────────────────
  // Not-found path. The first case is a true gibberish topic (404
  // regression check). The second is a typo — the opensearch fallback
  // should suggest the corrected spelling so the UI can show
  // "Did you mean Photosynthesis?"
  // ─────────────────────────────────────────────────────────────────
  {
    topic: "qzqzqzqz-not-a-real-topic-12345",
    level: "beginner",
    expectedBehavior: "not_found",
  },
  {
    topic: "Photosynthsis",
    level: "beginner",
    expectedBehavior: "not_found",
    expectedSuggestionsInclude: ["Photosynthesis"],
  },
];
