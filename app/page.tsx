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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">WikiPath</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Turn any Wikipedia topic into a learning map.
        </p>
      </header>

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
  );
}
