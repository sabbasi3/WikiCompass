// Postgres client + journey query helpers.
//
// Uses Neon's serverless HTTP driver (no persistent TCP — fits Vercel's
// compute model without connection pooling). Drizzle gives us typed
// queries on top.
//
// Fail-loud: if DATABASE_URL is missing, importing this file throws.
// That's intentional — the journey feature genuinely needs Postgres,
// and silently degrading to a no-op would mask the misconfiguration.

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { Grounding, WikiMap } from "../schemas";
import type { MapMeta } from "../generate-map-response";
import {
  journeys,
  quizzes,
  type JourneyInsert,
  type JourneyLevel,
  type JourneyRow,
  type JourneyStatus,
  type QuizRow,
} from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Provision Neon via Vercel Storage or set it in .env.local.",
  );
}

const client = neon(process.env.DATABASE_URL);
export const db = drizzle(client, { schema: { journeys, quizzes } });

// ── Journey queries ──────────────────────────────────────────────────

// Inserts a new journey row. The unique partial index on (email, topic)
// where status='active' rejects duplicates at the DB layer — we catch
// the constraint error in the /start route and return the existing
// journey id rather than blowing up.
export async function createJourney(
  input: Omit<JourneyInsert, "id" | "startedAt" | "updatedAt">,
): Promise<JourneyRow> {
  const [row] = await db
    .insert(journeys)
    .values({
      ...input,
      email: input.email?.toLowerCase().trim() || null,
    })
    .returning();
  return row;
}

// Rollback helper for /start when workflow startup fails after the row
// has already been inserted. cascade-deletes any quiz rows too.
export async function deleteJourney(id: string): Promise<void> {
  await db.delete(journeys).where(eq(journeys.id, id));
}

export async function getJourney(id: string): Promise<JourneyRow | null> {
  const [row] = await db.select().from(journeys).where(eq(journeys.id, id));
  return row ?? null;
}

// Finds an active journey for (email, topic) — used by /start to check
// dedup before attempting an insert. Returns null for anonymous (null
// email) journeys; those never collide.
export async function findActiveJourney(
  email: string | null,
  topic: string,
): Promise<JourneyRow | null> {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  const [row] = await db
    .select()
    .from(journeys)
    .where(
      and(
        eq(journeys.email, normalized),
        eq(journeys.topic, topic),
        eq(journeys.status, "active"),
      ),
    );
  return row ?? null;
}

export async function updateJourneyStatus(
  id: string,
  status: JourneyStatus,
): Promise<void> {
  await db
    .update(journeys)
    .set({ status, updatedAt: new Date() })
    .where(eq(journeys.id, id));
}

// Strips email without affecting workflow state. The user keeps their
// URL and can still skip/cancel from the status page; they just stop
// getting notification emails.
export async function unsubscribeJourney(id: string): Promise<void> {
  await db
    .update(journeys)
    .set({ email: null, updatedAt: new Date() })
    .where(eq(journeys.id, id));
}

// ── Quiz queries ─────────────────────────────────────────────────────

// Inserts the quiz row AND bumps current_round in one HTTP round trip.
// JourneyTimeline derives the delivered count from quizzes.length so it
// no longer depends on current_round being in sync — but we still bump
// the cursor here for observability (Neon Studio queries, future server
// code that needs to know the workflow's position without joining).
// db.batch sends both queries in one HTTP request — neon's HTTP driver
// doesn't support db.transaction (needs WebSockets) but batch gives us
// the same atomicity guarantee at the HTTP layer. Both succeed together
// or both
// roll back.
export async function storeQuizAndAdvance(
  journeyId: string,
  round: number,
  questionsJson: unknown,
): Promise<void> {
  await db.batch([
    db.insert(quizzes).values({ journeyId, round, questionsJson }),
    db
      .update(journeys)
      .set({ currentRound: round, updatedAt: new Date() })
      .where(eq(journeys.id, journeyId)),
  ]);
}

export async function listQuizzes(journeyId: string): Promise<QuizRow[]> {
  return db
    .select()
    .from(quizzes)
    .where(eq(quizzes.journeyId, journeyId))
    .orderBy(quizzes.round);
}

// ── Convenience: read a journey + all its quizzes for the status page ─

export type JourneyWithQuizzes = {
  journey: JourneyRow;
  quizzes: QuizRow[];
};

export async function getJourneyWithQuizzes(
  id: string,
): Promise<JourneyWithQuizzes | null> {
  const journey = await getJourney(id);
  if (!journey) return null;
  const rows = await listQuizzes(id);
  return { journey, quizzes: rows };
}

// ── Typed accessors for the stored map / grounding / meta ────────────
// Stored as jsonb (unknown to Drizzle). The shapes were validated when
// written by /api/journey/start, so casting at the boundary is safe.
// Grounding and meta are nullable for backward compatibility with rows
// inserted before those columns existed.
export function getMapFromJourney(journey: JourneyRow): WikiMap {
  return journey.mapJson as WikiMap;
}

export function getGroundingFromJourney(journey: JourneyRow): Grounding | null {
  return (journey.groundingJson as Grounding | null) ?? null;
}

export function getMetaFromJourney(journey: JourneyRow): MapMeta | null {
  return (journey.metaJson as MapMeta | null) ?? null;
}
