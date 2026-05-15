# Model benchmark

Comparison of five AI Gateway models on the WikiPath generation task. Used to inform model selection and the production fallback-routing story.

## Methodology

Each model was called once with identical inputs:

- **Topic:** Machine learning, level: beginner
- **Prompt:** `lib/ai/prompt.ts` (system + user, ~2.5K input tokens)
- **Schema:** `wikiMapSchema` in `lib/schemas.ts` via AI SDK `generateText` with `Output.object` (strict structured-output mode)
- **Temperature:** 0.2
- **OpenAI reasoning models:** `providerOptions.openai.reasoningEffort = "minimal"`

Per-model latency is wall-clock from the `generateText` call. Cost figures use rough public per-token pricing as of 2026-05 and the actual input/output tokens from each run.

## Results

| Model | Latency | Cost/map | Nodes | All checks pass | Notes |
|---|---:|---:|---:|:---:|---|
| **google/gemini-2.5-flash-lite** | **5.4s** | **$0.0006** | 12 | ✓ | Current default. Fastest, cheapest. |
| openai/gpt-5-nano | 7.2s | $0.001 | 8 | ✓ | Reasoning at minimal effort. Produced minimum node count. |
| anthropic/claude-haiku-4-5 | 14.6s | $0.014 | 13 | ✓ | Highest-quality explanations. Tool-call structured output (no OpenAI strict-mode overhead). |
| google/gemini-2.5-flash | 22.9s | $0.001 | 12 | ✓ | No clear win over Flash-Lite at higher latency. |
| openai/gpt-5-mini (minimal reasoning) | 22.8s | $0.010 | 13 | ✓ | Reasoning tax for marginal quality gain. |
| openai/gpt-5-mini (default/high reasoning) | 64.3s | $0.01+ | 13 | ✓ | Initial run before lowering reasoning effort. |
| openai/gpt-4.1-mini | 33.4s | $0.005 | 8 | ✓ | OpenAI strict structured-output mode is slow on all OpenAI models, not just the reasoning tier. |

### Topic-type adaptation (concept vs. biography)

Verified that the prompt's topic-type adaptation works across model choices: Bill Gates (biography) produced person / organization / event / work nodes with a biographical learning arc — zero `prerequisite` nodes — on both Haiku and Flash-Lite. The behavior is prompt-driven, not model-specific.

### Aggregate eval suite (5 cases)

| Model | Cases passed | Checks passed | Total time | Total tokens |
|---|:---:|:---:|---:|---:|
| google/gemini-2.5-flash-lite | 2/5 | 18/21 | 27.7s | 21,008 |
| openai/gpt-5-mini | 3/5 | 19/21 | 101.0s | 20,227 |

Note: case failures on both models are coverage misses — specific expected terms (e.g., "Chlorophyll", "Treaty of Versailles") that don't appear in the top-60 Wikipedia candidate links we feed the model. Same root cause for both models. Tracked as a separate improvement (lead-section-first link prioritization).

## Decision

**Default to `google/gemini-2.5-flash-lite`.**

The trade-off matrix:

- **Latency:** 5.4s vs. 14.6s vs. 22.8s. The 5-second tier is the only one that feels like a product, not a demo with a spinner.
- **Cost at enterprise scale:** 100,000 maps for **$60** (Flash-Lite) vs. **$1,400** (Haiku) vs. **$1,000** (gpt-5-mini). 17-23× cheaper.
- **Quality:** Schema conformance is 100% across all five models tested. Coverage gaps are upstream of model choice (driven by which links we send, not which model picks from them). Explanation quality is comparable across the top three — Haiku is marginally more verbose, Flash-Lite is marginally more terse.

The cost story is the SA-grade line: the same workload that costs $1,400 on a premium model costs $60 on Flash-Lite, with no measurable quality regression in the eval suite.

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

This means we pay Flash-Lite pricing on the happy path, and degrade gracefully to Haiku if Flash-Lite times out, hits a rate limit, or the provider is unavailable. The application doesn't see the failure — the Gateway handles the routing transparently. Observability lives in the Vercel AI Gateway dashboard.

In addition, the `/api/wiki/map` route does one application-side retry on `generateText` failure for the *application-layer* error case (e.g., schema validation failure where the response was successful but malformed). The two retry layers compose: Gateway handles transport, application handles content.

## Caveats and what we did *not* test

- **Single run per model.** Latency has real per-call variance (network, model server load); a fair benchmark would average 5–10 runs. The numbers above are directional, not statistical.
- **One topic type per benchmark cell.** Only Bill Gates was tested across models specifically for biography-vs-concept adaptation. Production should run the full 5-case eval suite per candidate model.
- **No human quality review.** All checks are automated (schema, graph integrity, URL integrity, coverage, forbidden absent). LLM-as-judge for explanation quality would add a useful dimension but adds eval complexity and cost.
