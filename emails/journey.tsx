// One React Email template, parameterized by payload kind (welcome /
// quiz / completion). Single file keeps email styling consistent and
// the sender code small — Resend reads the React element, renders to
// MIME-safe HTML, and ships it.
//
// All emails embed a token-signed action URL footer so the recipient
// can skip ahead, cancel, or unsubscribe with one click — no login.

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import type { Quiz } from "../lib/quiz";
import { roundToDay } from "../lib/journey/schema";

type Payload =
  | { kind: "welcome"; topic: string; level: string }
  | { kind: "quiz"; topic: string; round: 1 | 2 | 3; quiz: Quiz }
  | { kind: "completion"; topic: string };

export function JourneyEmail({
  payload,
  journeyId,
  token,
  baseUrl,
}: {
  payload: Payload;
  journeyId: string;
  token: string;
  baseUrl: string;
}) {
  const statusUrl = `${baseUrl}/journey/${journeyId}`;
  const tokenQuery = `token=${encodeURIComponent(token)}`;

  return (
    <Html>
      <Head />
      <Preview>{previewFor(payload)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            {headingFor(payload)}
          </Heading>

          {payload.kind === "welcome" && (
            <WelcomeBody topic={payload.topic} level={payload.level} />
          )}
          {payload.kind === "quiz" && (
            <QuizBody
              topic={payload.topic}
              round={payload.round}
              quiz={payload.quiz}
              statusUrl={statusUrl}
            />
          )}
          {payload.kind === "completion" && (
            <CompletionBody topic={payload.topic} />
          )}

          <Hr style={divider} />
          <Section style={footer}>
            <Text style={muted}>
              <Link href={statusUrl} style={link}>
                View on the web
              </Link>
              {" · "}
              <Link
                href={`${baseUrl}/api/journey/${journeyId}/action?action=skip&${tokenQuery}`}
                style={link}
              >
                Skip ahead
              </Link>
              {" · "}
              <Link
                href={`${baseUrl}/api/journey/${journeyId}/action?action=unsubscribe&${tokenQuery}`}
                style={link}
              >
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function WelcomeBody({ topic, level }: { topic: string; level: string }) {
  return (
    <>
      <Text style={p}>
        Your <strong>{level}</strong> map for <strong>{topic}</strong> is ready
        on the web — open it any time. We&apos;ll send you a short retention
        quiz on day 1, day 3, and day 7 to help the concepts stick.
      </Text>
      <Text style={p}>
        Want to move faster? Use the <strong>Skip ahead</strong> link in any
        email or on the status page to jump to the next quiz immediately.
      </Text>
    </>
  );
}

function QuizBody({
  topic,
  round,
  quiz,
  statusUrl,
}: {
  topic: string;
  round: 1 | 2 | 3;
  quiz: Quiz;
  statusUrl: string;
}) {
  const dayLabel = roundToDay(round);
  const difficultyLabel = quiz.difficulty;
  return (
    <>
      <Text style={p}>
        Day {dayLabel} check-in on <strong>{topic}</strong> —{" "}
        {quiz.questions.length} {difficultyLabel}-level question
        {quiz.questions.length === 1 ? "" : "s"}. Try to answer each one in your
        head before checking yourself.
      </Text>
      {quiz.questions.map((q, i) => (
        <Section key={q.id} style={questionBlock}>
          <Text style={question}>
            <strong>
              {i + 1}. {q.prompt}
            </strong>
          </Text>
        </Section>
      ))}
      <Section style={ctaWrap}>
        <Link href={statusUrl} style={cta}>
          Reveal answers on the web →
        </Link>
      </Section>
      <Text style={muted}>
        Answers are hidden behind a click on the status page — same recall
        mechanic as a flashcard, so you actually have to retrieve before you
        verify.
      </Text>
    </>
  );
}

function CompletionBody({ topic }: { topic: string }) {
  return (
    <>
      <Text style={p}>
        You&apos;ve finished the retention practice for <strong>{topic}</strong>
        . Three rounds of spaced quizzes, designed to make this one stick.
      </Text>
      <Text style={p}>
        Ready for another topic? Head back to WikiCompass and start a fresh
        journey.
      </Text>
    </>
  );
}

function previewFor(payload: Payload): string {
  switch (payload.kind) {
    case "welcome":
      return `Your ${payload.topic} learning journey has started`;
    case "quiz":
      return `${payload.quiz.questions.length} ${payload.quiz.difficulty}-level questions for ${payload.topic}`;
    case "completion":
      return `You finished ${payload.topic}`;
  }
}

function headingFor(payload: Payload): string {
  switch (payload.kind) {
    case "welcome":
      return `Welcome to your ${payload.topic} journey`;
    case "quiz":
      return `Day ${roundToDay(payload.round)} — ${payload.topic}`;
    case "completion":
      return `🎉 Journey complete: ${payload.topic}`;
  }
}

// ── Styles ────────────────────────────────────────────────────────────
// Inline-style objects, as React Email recommends. Color palette pulled
// from the app's emerald/amber accents so the emails look continuous
// with the web UI.

const body: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
};

const h1: React.CSSProperties = {
  color: "#111827",
  fontSize: "22px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  margin: "0 0 16px",
};

const p: React.CSSProperties = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const questionBlock: React.CSSProperties = {
  borderLeft: "3px solid #d1fae5",
  margin: "0 0 20px",
  paddingLeft: "14px",
};

const question: React.CSSProperties = {
  color: "#111827",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0 0 6px",
};

const ctaWrap: React.CSSProperties = {
  margin: "8px 0 16px",
  textAlign: "center",
};

const cta: React.CSSProperties = {
  backgroundColor: "#047857",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "10px 18px",
  textDecoration: "none",
};

const divider: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "24px 0 16px",
};

const footer: React.CSSProperties = {
  textAlign: "center",
};

const muted: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: 0,
};

const link: React.CSSProperties = {
  color: "#047857",
  textDecoration: "underline",
};
