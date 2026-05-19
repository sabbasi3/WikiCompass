"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Level } from "@/hooks/useWikiMap";

const EXAMPLES = [
  "Machine learning",
  "Photosynthesis",
  "World War I",
  "Bill Gates",
  "Quantum computing",
];

const GOAL_MAX = 500;

export type FormMode = "oneshot" | "journey";

export function TopicForm({
  topic,
  level,
  userGoal,
  mode,
  email,
  onTopicChange,
  onLevelChange,
  onUserGoalChange,
  onModeChange,
  onEmailChange,
  onSubmit,
  disabled,
}: {
  topic: string;
  level: Level;
  userGoal: string;
  mode: FormMode;
  email: string;
  onTopicChange: (v: string) => void;
  onLevelChange: (v: Level) => void;
  onUserGoalChange: (v: string) => void;
  onModeChange: (v: FormMode) => void;
  onEmailChange: (v: string) => void;
  onSubmit: (
    topic: string,
    level: Level,
    userGoal: string,
    mode: FormMode,
    email: string,
  ) => void;
  disabled: boolean;
}) {
  const [showGoal, setShowGoal] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;
    onSubmit(trimmed, level, userGoal.trim(), mode, email.trim());
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row">
          {/* Search input with embedded magnifying-glass icon */}
          <div className="relative flex-1">
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Input
              placeholder="Enter any Wikipedia topic..."
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              disabled={disabled}
              className="h-11 pl-10 font-serif text-base md:text-base"
              aria-label="Topic"
            />
          </div>

          <Select
            value={level}
            onValueChange={(v) => onLevelChange(v as Level)}
            disabled={disabled}
          >
            <SelectTrigger className="h-11! w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="submit"
            disabled={disabled || !topic.trim()}
            className="h-11 gap-2 bg-emerald-600 px-6 text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
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
            {disabled
              ? mode === "journey"
                ? "Starting…"
                : "Generating…"
              : mode === "journey"
                ? "Start journey"
                : "Generate map"}
          </Button>
        </div>

        {/* Mode toggle — one-shot map vs guided journey */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mode:</span>
          <button
            type="button"
            onClick={() => onModeChange("oneshot")}
            disabled={disabled}
            className={`rounded-full border px-3 py-1.5 transition-colors disabled:opacity-50 ${
              mode === "oneshot"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-border bg-background text-foreground/70 hover:border-emerald-500 hover:text-emerald-700"
            }`}
          >
            One-shot map
          </button>
          <button
            type="button"
            onClick={() => onModeChange("journey")}
            disabled={disabled}
            className={`rounded-full border px-3 py-1.5 transition-colors disabled:opacity-50 ${
              mode === "journey"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-border bg-background text-foreground/70 hover:border-emerald-500 hover:text-emerald-700"
            }`}
          >
            Guided journey
          </button>
        </div>

        {/* Email field only relevant in journey mode */}
        {mode === "journey" && (
          <div className="mt-3 space-y-1 text-sm">
            <label
              htmlFor="journey-email"
              className="block text-muted-foreground"
            >
              Email (optional). We&apos;ll send quizzes on days 1, 3, and 7.
              Leave blank to bookmark this page instead.
            </label>
            <Input
              id="journey-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              disabled={disabled}
              className="h-10"
              aria-label="Email for quiz delivery"
            />
          </div>
        )}

        {/* Suggested topics — pill-style with emerald hover */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onTopicChange(example)}
              disabled={disabled}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground/70 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>

        {/* Optional learning goal disclosure */}
        <div className="mt-4 text-sm">
          <button
            type="button"
            onClick={() => setShowGoal((v) => !v)}
            disabled={disabled}
            className="text-muted-foreground underline-offset-4 transition-colors hover:text-emerald-700 hover:underline disabled:opacity-50"
            aria-expanded={showGoal}
            aria-controls="user-goal-textarea"
          >
            {showGoal ? "Hide learning goal" : "Add a learning goal (optional)"}
            {!showGoal && userGoal.trim() ? " — set" : ""}
          </button>
          {showGoal && (
            <div className="mt-2 space-y-1">
              <textarea
                id="user-goal-textarea"
                value={userGoal}
                onChange={(e) =>
                  onUserGoalChange(e.target.value.slice(0, GOAL_MAX))
                }
                disabled={disabled}
                maxLength={GOAL_MAX}
                rows={2}
                placeholder="e.g. I'm interviewing at Microsoft next week, or I want to teach my kid the basics."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Learning goal"
              />
              <div className="text-right text-xs text-muted-foreground">
                {userGoal.length}/{GOAL_MAX}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
