// Model selection lives in env vars so it's a config change, not a code
// change. Defaults: Flash Lite primary, Haiku fallback.
//
// Why these: the AI task is classification + structuring of a bounded
// input set, not generation. Doesn't need a frontier model. Flash Lite
// hits 8s latency at $0.0013/map and passes the same eval checks as the
// alternatives. Haiku is the fallback because it's a *different provider*
// and also a fast popular model. See docs/model-benchmark.md.

export const AI_MODEL = process.env.AI_MODEL ?? "google/gemini-2.5-flash-lite";

// Comma-separated list → trimmed, deduped array. Gateway tries in order.
export const AI_FALLBACK_MODELS = (
  process.env.AI_FALLBACK_MODELS ?? "anthropic/claude-haiku-4-5"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
