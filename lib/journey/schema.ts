// Drizzle schema for the learning-journey feature.
//
// Two tables:
//   journeys  — one row per (user, topic) enrollment. Holds the day-0 map
//               JSON, the workflow run id (so we can fire hooks against it),
//               and lifecycle status.
//   quizzes   — one row per (journey, round). Three rounds per journey.
//
// Email is nullable: users who opt out of notifications still get a
// bookmarkable status page URL. The skip-ahead button on that page is
// the canonical trigger; emails are a secondary delivery channel.

import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Lifecycle states. The workflow transitions through these; the status
// page renders different UI per state. `stuck` is the "AI failed three
// times in a row" terminal — distinct from `cancelled` (user gave up)
// and `completed` (happy path finished).
export const JOURNEY_STATUSES = [
  "active",
  "paused",
  "completed",
  "cancelled",
  "stuck",
] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const JOURNEY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type JourneyLevel = (typeof JOURNEY_LEVELS)[number];

export const journeys = pgTable(
  "journeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable on purpose. Users who skip the email field still get a
    // working journey via the URL. Lowercased + trimmed on insert so
    // dedup checks are case-insensitive.
    email: text("email"),
    topic: text("topic").notNull(),
    level: text("level").notNull().$type<JourneyLevel>(),
    userGoal: text("user_goal"),
    // The full WikiMap from day-0 generation. Stored once, used by every
    // quiz round as the source of truth so quiz questions can be grounded
    // against the same node/path set the user originally saw.
    mapJson: jsonb("map_json").notNull(),
    // Grounding (selected concepts + citation count) and meta (latency,
    // usage, graph integrity, URL strip counts) from the day-0 generation.
    // Stored so the status page can render the full MapResult — same UI
    // the one-shot lookup gets — instead of a stripped-down variant.
    // Nullable for backward compatibility with rows created before this
    // column existed; new rows are always populated by /start.
    groundingJson: jsonb("grounding_json"),
    metaJson: jsonb("meta_json"),
    status: text("status").notNull().default("active").$type<JourneyStatus>(),
    // 0 = welcome sent, no quizzes yet. 1/2/3 = that quiz round delivered.
    currentRound: integer("current_round").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Dedup: prevent the same (email, topic) starting twice while one is
    // already active. Partial index so completed/cancelled journeys don't
    // block restarts — a user finishing ML can immediately start ML again.
    // Email nullable means NULL emails don't dedup against each other,
    // which is correct: anonymous URL-only journeys are independent even
    // if topic matches.
    activeUnique: uniqueIndex("journeys_active_unique")
      .on(table.email, table.topic)
      .where(sql`status = 'active'`),
  }),
);

export const quizzes = pgTable(
  "quizzes",
  {
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    // [{ id, prompt, answer, referenceNodes: string[] }]
    questionsJson: jsonb("questions_json").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.journeyId, table.round] }),
  }),
);

// Inferred row types — use these in db.ts and elsewhere instead of
// hand-writing the shapes. If the schema changes, the types follow.
export type JourneyRow = typeof journeys.$inferSelect;
export type JourneyInsert = typeof journeys.$inferInsert;
export type QuizRow = typeof quizzes.$inferSelect;
