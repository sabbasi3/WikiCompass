// Resend wrapper for journey notifications.
//
// One entry point per email kind. Each builds the React Email template,
// renders to HTML, and sends via Resend. Throws on send failure so the
// workflow's step retry semantics handle transient API hiccups.
//
// Fail-soft on missing config: if RESEND_API_KEY isn't set we log and
// return, never throw. Lets local dev run without an account; CI/prod
// gets a deploy-time hint that emails won't go out.

import { Resend } from "resend";

import type { Quiz } from "./quiz";
import { signJourneyToken } from "./journey/tokens";
import { JourneyEmail } from "../emails/journey";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

const resend = apiKey ? new Resend(apiKey) : null;

type EmailKind =
  | { kind: "welcome"; topic: string; level: string }
  | { kind: "quiz"; topic: string; round: 1 | 2 | 3; quiz: Quiz }
  | { kind: "completion"; topic: string };

export async function sendJourneyEmail(
  journeyId: string,
  toEmail: string,
  payload: EmailKind,
): Promise<void> {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent ${payload.kind} email to ${toEmail} for journey ${journeyId}`,
    );
    return;
  }

  const token = signJourneyToken(journeyId);
  const subject = subjectFor(payload);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject,
    react: JourneyEmail({
      payload,
      journeyId,
      token,
      baseUrl,
    }),
  });

  if (error) {
    // Throw so the workflow's step retry kicks in for transient errors.
    // The Resend SDK error shape is { name, message, ... }.
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

function subjectFor(payload: EmailKind): string {
  switch (payload.kind) {
    case "welcome":
      return `Your ${payload.topic} learning journey has started`;
    case "quiz":
      return `Day ${roundToDay(payload.round)} quiz — ${payload.topic}`;
    case "completion":
      return `You finished ${payload.topic} — what's next?`;
  }
}

function roundToDay(round: 1 | 2 | 3): number {
  return ({ 1: 1, 2: 3, 3: 7 } as const)[round];
}
