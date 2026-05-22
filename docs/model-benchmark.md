# Model benchmark

Comparison of seven AI Gateway models on the WikiCompass generation task. Used to inform model selection and the production fallback-routing story.

> **Benchmark vs eval — different questions.** This benchmark holds the **topic constant** (Machine learning beginner) and varies **models** to answer "which model should we use?" The [eval suite](../README.md#evaluation) (`npm run eval`) holds the **model constant** and varies **topics** to answer "did my code regress?" Cost and cadence are different — eval runs on every code change (~$0.03/run), benchmark runs quarterly or when pricing/latency changes (~$0.05–0.15/run). Don't combine them.

## Methodology

Each model was called once with identical inputs:

- **Topic:** Machine learning, level: beginner
- **Prompt:** `lib/ai/prompt.ts` (system + user message)
- **Context:** Wikipedia REST API; **150 candidate links** (lead-section → See Also → tail, deduped and capped)
- **Schema:** `wikiMapSchema` in `lib/schemas.ts` via AI SDK `generateText` with `Output.object` (structured-output mode)
- **Temperature:** 0.2
- **Post-generation:** URL safety pipeline runs (verify-then-strip) and graph integrity check, exactly as the production route does

Per-model latency is wall-clock from the `generateText` call. Cost figures use approximate public per-token pricing as of late 2025 / early 2026 and the actual input/output tokens from each run.

## Results

| Model | Latency | Cost/map | Nodes | Path | Integrity |
|---|---:|---:|---:|---:|:---:|
| **`google/gemini-2.5-flash-lite`** (default) | **6.1s** | **$0.0013** | 10 | 8 | ✓ |
| `zai/glm-4.7-flash` | 12.7s | $0.0011 | 14 | 8 | ✓ |
| `openai/gpt-4.1-mini` | 14.5s | $0.0036 | 8 | 8 | ✓ |
| `anthropic/claude-haiku-4-5` (fallback) | 27.4s | $0.018 | 17 | 8 | ✓ |
| `google/gemini-2.5-flash` | 33.3s | $0.019 | 13 | 10 | ✓ |
| `openai/gpt-5-mini` | 79.4s | $0.014 | 16 | 9 | ✓ |
| `openai/gpt-5-nano` | 83.5s | $0.0045 | 14 | 7 | ✓ |

### URL safety pipeline

Number of URLs the model wrote outside the 150-candidate set, how many our post-gen verifier kept, how many it stripped. Only Flash-Lite reached outside in this run — the other five stayed entirely within the candidate set the prompt told them to use.

| Model | Unknown URLs | Verified + kept | Stripped |
|---|---:|---:|---:|
| `google/gemini-2.5-flash-lite` | 2 | 2 | 0 |
| `zai/glm-4.7-flash` | 0 | 0 | 0 |
| `openai/gpt-4.1-mini` | 0 | 0 | 0 |
| `google/gemini-2.5-flash` | 0 | 0 | 0 |
| `anthropic/claude-haiku-4-5` | 0 | 0 | 0 |
| `openai/gpt-5-mini` | 0 | 0 | 0 |
| `openai/gpt-5-nano` | 0 | 0 | 0 |

### Cost at scale

| Model | Per map | 100K maps |
|---|---:|---:|
| `zai/glm-4.7-flash` | $0.0011 | **$113** |
| `google/gemini-2.5-flash-lite` | $0.0013 | $129 |
| `openai/gpt-4.1-mini` | $0.0036 | $365 |
| `openai/gpt-5-nano` | $0.0045 | $446 |
| `openai/gpt-5-mini` | $0.014 | $1,371 |
| `anthropic/claude-haiku-4-5` | $0.018 | $1,844 |
| `google/gemini-2.5-flash` | $0.019 | $1,882 |

The cost story is the SA-grade line: the same workload that costs $1,844 on Haiku 4.5 costs $129 on Flash-Lite — **14× cheaper** with no measurable quality regression in the eval suite. `glm-4.7-flash` is marginally cheaper still but ~2× slower, and only one of the three GLM variants we tried honored `Output.object` reliably (see below).

### Models that don't honor `Output.object` reliably

A few models we tried failed structured-output generation on the same prompt + schema and were excluded from the headline tables. The generation pipeline uses AI SDK `Output.object` ([generateWikiMap.ts](../lib/ai/generateWikiMap.ts)), so a model that can't produce a schema-valid response is unusable here without a per-model JSON-parse fallback. Single-run signal — but a model that flakes once on a controlled prompt is not a safe production default.

| Model | Failure mode |
|---|---|
| `deepseek/deepseek-v3.1` | response did not match schema |
| `deepseek/deepseek-r1` | response could not be parsed as JSON (reasoning model — output likely wrapped) |
| `zai/glm-4.6` | response did not match schema |
| `zai/glm-4.5-air` | response did not match schema |

Only `zai/glm-4.7-flash` from the GLM family passed; both DeepSeek variants failed. This is a property of the prompt + provider routing on the AI Gateway, not a definitive judgement on the models — switching to a manual JSON-extraction code path could rescue them, but at the cost of losing the schema-validation guarantee everywhere else.

`glm-4.7-flash` passed the benchmark but regressed against the eval suite — **9/12 cases, 47/50 gating checks** vs. Flash Lite's clean 12/12 / 50/50. All three failures were the same `graph integrity: expected 1 main_topic, found 0` check, and only on **biographies and historical events** (World War I, Bill Gates ×2); concept / place / organization / work cases all passed. The model produces schema-valid output but doesn't reliably honor the `main_topic` flag for those topic types. The first case (Machine learning) also retried after an initial schema fail before succeeding — a sign that structured-output compliance is borderline.

The Haiku fallback stays. `glm-4.7-flash` could be revisited if the prompt were tightened to be more explicit about `main_topic` selection — but that's a prompt change that affects every model, not a model swap.

### Topic-type adaptation (concept vs. biography)

Verified separately that the prompt's topic-type adaptation works across model choices: Bill Gates (biography) produces person / organization / event / work nodes with a biographical learning arc — zero `prerequisite` nodes — on both Haiku and Flash-Lite. The behavior is prompt-driven, not model-specific.

## Decision

**Default to `google/gemini-2.5-flash-lite`.**

The trade-off matrix:

- **Latency:** 8s vs. 17s vs. 23s+. The sub-10-second tier is the only one that feels like a product, not a demo with a long spinner.
- **Cost at enterprise scale:** Flash-Lite is 2.6–13× cheaper than every alternative. At 100K maps/month: $133 vs. $343 (gpt-4.1-mini) vs. $1,737 (Haiku).
- **Quality:** All six models pass schema validity, graph integrity, and URL grounding checks. Node counts vary (Flash-Lite: 10, Haiku: 16, gpt-5-nano: 9) but all fall within the schema's 8–18 range. Explanation quality is comparable across the top three; Haiku is marginally more verbose, Flash-Lite is marginally more terse.

## Production fallback routing

Wired via the AI SDK's native Gateway `models` provider option — the Gateway tries an ordered list of models and falls back on transport-level failures (rate limits, provider outages, timeouts). All in one config, no application-side retry code.

```ts
// lib/ai/generateWikiMap.ts
generateText({
  model: gateway(AI_MODEL),
  output: Output.object({ schema: wikiMapSchema }),
  providerOptions: {
    gateway: { models: [AI_MODEL, ...AI_FALLBACK_MODELS] },
  },
  ...
});
```

The chain is configured via env vars:

- `AI_MODEL` — primary model (default `google/gemini-2.5-flash-lite`)
- `AI_FALLBACK_MODELS` — comma-separated list, in priority order (default `anthropic/claude-haiku-4-5`)

The fallback is intentionally a **different provider** (Anthropic vs Google), not a stronger model. Cross-provider resilience — a Google outage doesn't take both down.

This means we pay Flash-Lite pricing on the happy path, and degrade gracefully to Haiku if Flash-Lite times out, hits a rate limit, or the provider is unavailable. The application doesn't see the failure — the Gateway handles the routing transparently. Observability lives in the Vercel AI Gateway dashboard.

In addition, the `/api/wiki/map` route does one application-side retry on `generateText` failure for the *application-layer* error case (e.g., schema validation failure where the response was successful but malformed). The two retry layers compose: Gateway handles transport, application handles content.

## Caveats and what we did *not* test

- **Single run per model.** Latency has real per-call variance (network, model server load, time-of-day on shared infra); a fair benchmark would average 5–10 runs per model. These numbers are directional, not statistical. The relative *ordering* is stable across runs we've observed; the absolute *gaps* shift by ~10–20%.
- **OpenAI reasoning models run at default reasoning effort.** `gpt-5-nano` and `gpt-5-mini` would be substantially faster with `providerOptions.openai.reasoningEffort = "minimal"`. A production deployment that picks them would tune that. We didn't, because the comparison reflects how our current code calls them — Flash-Lite is faster and cheaper out of the box, so the optimization doesn't change the decision.
- **One topic per benchmark cell.** Only Machine learning (beginner) was tested across all models. Topic-type adaptation (biography, event, place) was checked separately on the top two models. Production should run the full 11-case eval suite per candidate model before swapping the default.
- **No human quality review.** All checks are automated (schema, graph integrity, URL grounding, integrity issues). LLM-as-judge for explanation quality would add a useful dimension but adds eval complexity and cost.

## How to re-run

```sh
# Set env vars in .env.local (AI_GATEWAY_API_KEY, etc.)
npm run benchmark
```

Re-run quarterly or when model pricing / latency changes are announced. Update both this doc and the inline summary table in [README.md](../README.md#model-benchmark).
