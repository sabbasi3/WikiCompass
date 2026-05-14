"use client";

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

export function TopicForm({
  topic,
  level,
  onTopicChange,
  onLevelChange,
  onSubmit,
  disabled,
}: {
  topic: string;
  level: Level;
  onTopicChange: (v: string) => void;
  onLevelChange: (v: Level) => void;
  onSubmit: (topic: string, level: Level) => void;
  disabled: boolean;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;
    onSubmit(trimmed, level);
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
    </form>
  );
}
