"use client";

import { useState } from "react";

// Renders the state-machine view (skeleton, map, disambiguation, errors).
import { ResultsByState } from "@/components/ResultsByState";
import { TopicForm } from "@/components/TopicForm";
import { useWikiMap, type Level } from "@/hooks/useWikiMap";

export default function Home() {
  const { state, generate, reset } = useWikiMap();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [userGoal, setUserGoal] = useState("");

  const isLoading = state.kind === "loading";

  function handleSubmit(t: string, l: Level, g: string) {
    setTopic(t);
    setLevel(l);
    generate(t, l, g || undefined);
  }

  function handlePickCandidate(picked: string) {
    setTopic(picked);
    generate(picked, level, userGoal.trim() || undefined);
  }

  return (
    <>
      {/* Sticky app header with logo + powered-by badge */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                WikiPath
              </h1>
              <p className="-mt-0.5 text-xs text-muted-foreground">
                Your learning journey, mapped
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span>Powered by Wikipedia</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Hero section */}
        <section className="mb-10 text-center">
          <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Turn any topic into a learning map
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-muted-foreground md:text-lg">
            Enter a Wikipedia topic and get an AI-curated path from foundational
            concepts to advanced understanding.
          </p>
        </section>

        <div className="mb-8">
          <TopicForm
            topic={topic}
            level={level}
            userGoal={userGoal}
            onTopicChange={setTopic}
            onLevelChange={setLevel}
            onUserGoalChange={setUserGoal}
            onSubmit={handleSubmit}
            disabled={isLoading}
          />
        </div>

        <ResultsByState
          state={state}
          onPickCandidate={handlePickCandidate}
          onReset={reset}
        />
      </main>
    </>
  );
}
