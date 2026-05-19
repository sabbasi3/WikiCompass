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
}: {
  topic: string;
  round: 1 | 2 | 3;
  quiz: Quiz;
}) {
  const dayLabel = ({ 1: 1, 2: 3, 3: 7 } as const)[round];
  const difficultyLabel = quiz.difficulty;
  return (
    <>
      <Text style={p}>
        Day {dayLabel} check-in on <strong>{topic}</strong> —{" "}
        {quiz.questions.length} {difficultyLabel}-level question
        {quiz.questions.length === 1 ? "" : "s"}.
      </Text>
      {quiz.questions.map((q, i) => (
        <Section key={q.id} style={questionBlock}>
          <Text style={question}>
            <strong>
              {i + 1}. {q.prompt}
            </strong>
          </Text>
          <Text style={muted}>
            Answer: <span style={answer}>{q.answer}</span>
          </Text>
        </Section>
      ))}
      <Text style={p}>
        These concepts are pulled from your original map. Open the{" "}
        <strong>View on the web</strong> link below to revisit it.
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
      return `Day ${({ 1: 1, 2: 3, 3: 7 } as const)[payload.round]} — ${payload.topic}`;
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

const answer: React.CSSProperties = {
  color: "#047857",
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
