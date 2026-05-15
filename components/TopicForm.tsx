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

export function TopicForm({
  topic,
  level,
  userGoal,
  onTopicChange,
  onLevelChange,
  onUserGoalChange,
  onSubmit,
  disabled,
}: {
  topic: string;
  level: Level;
  userGoal: string;
  onTopicChange: (v: string) => void;
  onLevelChange: (v: Level) => void;
  onUserGoalChange: (v: string) => void;
  onSubmit: (topic: string, level: Level, userGoal: string) => void;
  disabled: boolean;
}) {
  const [showGoal, setShowGoal] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;
    onSubmit(trimmed, level, userGoal.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Enter a Wikipedia topic — e.g. Machine learning"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          disabled={disabled}
          className="flex-1"
          aria-label="Topic"
        />
        <Select
          value={level}
          onValueChange={(v) => onLevelChange(v as Level)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={disabled || !topic.trim()}>
          {disabled ? "Generating…" : "Generate map"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onTopicChange(ex)}
            disabled={disabled}
            className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="text-sm">
        <button
          type="button"
          onClick={() => setShowGoal((v) => !v)}
          disabled={disabled}
          className="text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400"
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
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              aria-label="Learning goal"
            />
            <div className="text-right text-xs text-zinc-500">
              {userGoal.length}/{GOAL_MAX}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
