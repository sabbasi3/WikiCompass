export const AI_MODEL = process.env.AI_MODEL ?? "google/gemini-2.5-flash-lite";

export const AI_FALLBACK_MODELS = (
  process.env.AI_FALLBACK_MODELS ?? "anthropic/claude-haiku-4-5"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
