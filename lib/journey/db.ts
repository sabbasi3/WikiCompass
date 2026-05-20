// Postgres client + journey query helpers.
//
// Uses Neon's serverless HTTP driver (no persistent TCP — fits Vercel's
// compute model without connection pooling). Drizzle gives us typed
// queries on top.
//
// Fail-loud: if DATABASE_URL is missing, importing this file throws.
// That's intentional — the journey feature genuinely needs Postgres,
// and silently degrading to a no-op would mask the misconfiguration.

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { Grounding, WikiMap } from "../schemas";
import type { MapMeta } from "../generate-map-response";
import {
  chatMessages,
  journeys,
  quizzes,
  type ChatMessageRow,
  type ChatRole,
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
export const db = drizzle(client, {
  schema: { journeys, quizzes, chatMessages },
});

// ── Journey queries ──────────────────────────────────────────────────

// Inserts a new journey row. The unique partial index on (email, topic)
// where status='active' rejects duplicates at the DB layer — we catch
// the constraint error in the /start route and return the existing
// journey id rather than blowing up.
//
// Email normalization (lowercase + trim) happens here, exactly once,
// so callers don't have to remember to do it. The dedup query in
// findActiveJourney trusts that the column is already canonical.
export async function createJourney(
  input: Omit<JourneyInsert, "id" | "startedAt" | "updatedAt">,
): Promise<JourneyRow> {
  const [row] = await db
    .insert(journeys)
    .values({
      ...input,
      email: normalizeEmail(input.email),
    })
    .returning();
  return row;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
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
// email) journeys; those never collide. Email is normalized here too
// because /start may have just read the raw form input.
export async function findActiveJourney(
  email: string | null,
  topic: string,
): Promise<JourneyRow | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
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
// JourneyTimeline derives the delivered count from quizzes.length so the
// UI never depends on current_round being in sync — but we still bump
// the cursor here for observability (Neon Studio queries, future server
// code that needs to know the workflow's position without joining).
// db.batch is neon-http's pipelined-transaction primitive (the HTTP
// driver can't run db.transaction, which needs WebSockets) — the
// statements run inside an implicit BEGIN/COMMIT, so both succeed
// together or both roll back.
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

async function listQuizzes(journeyId: string): Promise<QuizRow[]> {
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

// ── Chat queries ─────────────────────────────────────────────────────
// Chat lives per-journey: one row per turn (user or assistant), ordered
// by createdAt. The DurableAgent in app/workflows/map-chat.ts streams
// the assistant response live; this table is the source of truth on
// reload, so the panel hydrates with full history.

export async function insertChatMessage(
  journeyId: string,
  role: ChatRole,
  content: string,
): Promise<ChatMessageRow> {
  const [row] = await db
    .insert(chatMessages)
    .values({ journeyId, role, content })
    .returning();
  return row;
}

export async function getChatHistory(
  journeyId: string,
): Promise<ChatMessageRow[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.journeyId, journeyId))
    .orderBy(chatMessages.createdAt);
}

// ── Typed accessors for jsonb columns ────────────────────────────────
// Drizzle types jsonb as `unknown`. The shapes were Zod-validated when
// written (by /api/journey/start for the map, by the quiz workflow for
// the questions array), so casting at this single boundary is safe and
// keeps the cast out of every call site.
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
