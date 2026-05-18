# WikiCompass

**Turn any Wikipedia article into an AI-generated learning map.** A user enters a topic and a difficulty level; the app fetches bounded context from Wikipedia, asks an LLM to classify and order the concepts, and renders an interactive knowledge graph with a recommended learning path and per-node Wikipedia citations.

**Live demo:** [wiki-compass-alpha.vercel.app](https://wiki-compass-alpha.vercel.app)
**Repo:** [github.com/SafanAbbasi/WikiCompass](https://github.com/SafanAbbasi/WikiCompass)

Built for Vercel's Solutions Architect Track B (AI Cloud) take-home assessment.

---

## Problem and audience

Wikipedia is the best public reference source we have, but it isn't optimized for *learning*. Articles are dense, links are noisy, and a beginner reading "Machine learning" can't tell which of the article's 400 links are prerequisites, which are core, and which are advanced follow-ups.

WikiCompass restructures that reference data into a guided learning experience for three audiences:

- **Students** trying to learn a topic quickly
- **Knowledge workers** researching unfamiliar domains
- **Enterprise customer enablement / training teams** — the same pattern works over internal docs, support articles, or onboarding content

## Demo flow

1. Enter a topic (e.g. `Machine learning`), pick a level (Beginner / Intermediate / Advanced), and optionally add a learning goal ("I'm interviewing at Microsoft next week") to personalize the path
2. Skeleton loader for ~5 seconds while the AI works
3. See:
   - **Summary card** — topic type (concept / person / event / etc.), key takeaway, Wikipedia summary
   - **Knowledge graph** — 8–18 type-colored nodes with directed relationships, laid out top-to-bottom; click a node for explanation + Wikipedia link
   - **Learning path** — 4–10 ordered steps with one-sentence reasons and a paragraph-level "why this path" rationale that references the learning goal if one was provided
   - **Grounding badge** — "Cited N of M candidate Wikipedia articles" with an expandable list of clickable cited titles (transparency over which inputs the model used)

Ambiguous topics like `Mercury` show a deterministic chooser (planet / element / mythology / Records / Project / Prize / etc.) **before** the AI is called — the model never has to guess which Mercury you meant.

## Architecture

```
                ┌──────────────────────────────────────┐
                │            Browser (React)           │
                │  TopicForm · ResultsByState · Skeleton│
                │  KnowledgeGraph (React Flow + dagre) │
                │       NodeDetailsPanel · etc.        │
                └────────────────┬─────────────────────┘
                                 │ POST /api/wiki/map
                                 ▼
   ┌──────────────────────────────────────────────────────────────┐
   │             Next.js App Router (route handlers)              │
   │                                                              │
   │   /api/wiki/map                                              │
   │   ├─ rate-limit check (per-IP) ──────────────────────────────┼──┐
   │   ├─ getWikipediaContext                                     │  │
   │   │   ├─ summary  (REST)                                     │  │
   │   │   ├─ links    (Action API)                               │  │
   │   │   └─ lead-section links (parse)                          │  │
   │   │                                                          │  │
   │   ├─ generateWikiMap                                         │  │
   │   │   └─ generateText + Output.object                        │  │
   │   │                                                          │  │
   │   └─ post-AI pipeline:                                       │  │
   │       ├─ stripHallucinatedUrls                               │  │
   │       ├─ computeGrounding                                   │  │
   │       └─ checkGraphIntegrity                                 │  │
   └────────────────┬─────────────────────────────────┬───────────┘  │
                    │                                 │              │
                    ▼                                 ▼              ▼
       ┌─────────────────────────┐       ┌─────────────────────────┐  ┌──────────────────┐
       │   Wikipedia public API  │       │  Vercel AI Gateway      │  │ Upstash Redis    │
       │  (en.wikipedia.org)     │       │   primary: Flash-Lite   │  │ (via Vercel      │
       │   + 1h fetch revalidate │       │   fallback: Haiku 4.5   │  │  marketplace)    │
       └─────────────────────────┘       │   (transparent routing) │  │  per-IP sliding  │
                                         └────────────┬────────────┘  │  window counter  │
                                                      │               └──────────────────┘
                                                      ▼
                                      ┌────────────────────────────┐
                                      │ google / anthropic / etc.  │
                                      └────────────────────────────┘
```

## From Wikipedia to enterprise knowledge

Wikipedia is a useful demo because it's open, trusted, and well-structured — but the architecture generalizes to any trusted, structured knowledge corpus. The data layer (the Wikipedia API helpers in `lib/wiki/`) is the only thing that's domain-specific; everything else stays the same.

Swap Wikipedia for any of these:

- **Product documentation** — fetch from a docs site, internal wiki, or Notion API
- **Customer support knowledge base** — Zendesk / Intercom / Salesforce Knowledge articles + tags
- **Onboarding and enablement content** — HR docs, training transcripts, internal playbooks
- **Codebase documentation** — README and module-level docs across a monorepo

The rest of the pipeline carries over:

- Bounded context retrieval (cap candidates, dedupe, junk filter)
- Structured AI generation via the AI SDK with Zod validation
- Post-AI safety net (URL/source grounding, graph integrity check)
- Interactive graph + learning path rendering
- Eval suite asserting structural correctness and behavioral signals

**Where RAG slots in** — and where it doesn't: if the enterprise source is **structured** (Confluence, Notion, an internal wiki, Salesforce Knowledge, any docs portal with a real API exposing canonical pages + outgoing references), the data-fetch step is just another API call — no RAG needed. Swap `lib/wiki.ts` for `lib/confluence.ts` and the rest is unchanged. RAG only enters when the source is **unstructured** (PDFs, support transcripts, recorded meetings, Slack), where you have to synthesize a "page" from retrieved chunks. There RAG plays the role our Wikipedia API plays today: producing the bounded context the model classifies. Different shape of context layer for a different shape of source — same pattern.

Product value transfers cleanly: turn dense reference content into guided learning paths for employees, customers, or new hires — without rewriting the surface.

## Key technical decisions

| Decision | Why |
|---|---|
| **Live Wikipedia API, no RAG / vector DB** | The AI task is *structuring and classification* of an already-trusted source, not retrieval over hidden documents. Wikipedia is already a structured corpus. RAG would be solving a problem we don't have. The same UI + AI pattern transfers to any structured enterprise source (Confluence, Notion, Salesforce Knowledge) via the same API-call shape — RAG only enters if the source is unstructured (PDFs, transcripts). |
| **`generateText` + `Output.object` with Zod schema** | Structured output via the AI SDK v6 API: every field is type-checked before the frontend sees it. No `JSON.parse` failures, no "I'm sorry, I can't structure that" responses. Schema is the API contract. |
| **`gemini-2.5-flash-lite` as default model** | Benchmarked 6 models on the same prompt and schema (see table below). Flash-Lite is fastest (8s), cheapest ($0.0013/map, ~$133 / 100K maps), and passes all integrity checks. Frontier alternatives are 2–11× slower and 3–13× more expensive with no measurable quality gain on the eval suite. Full methodology in [docs/model-benchmark.md](docs/model-benchmark.md). |
| **Native Gateway fallback via `providerOptions.gateway.models`** | One config, no application retry code. Gateway routes the primary → fallback list on transport failures (rate limits, provider outages, timeouts) transparently. Application-level retry handles the *content* failure case (schema validation). |
| **Verify-then-strip URL pipeline** | Rule 1 of the prompt forbids URLs outside the 150-candidate set, but the model drifts ~3% of the time. For URLs that slip outside, we hit Wikipedia in parallel and keep only those that (a) resolve to a real, non-disambiguation article AND (b) have a resolved-title match against the model's intended node title (Jaccard ≥ 0.6 after stopword removal + plural stemming). Verified URLs are kept; everything else is stripped to `null` and logged. The user never sees a misleading link. |
| **Candidate priority: lead-section → See Also → tail** | Lead-section links come first (concepts the article depends on), then Wikipedia's editor-curated See Also section (concepts editors think are related), then the long tail of all other article links. Capped at 150. Empirically measured: dropped the model's "outside the candidate set" rate from ~25% (at 60-cap) to ~3% (at 150-cap with See Also priority). Tried 200; introduced eval variance, rolled back to 150. |
| **Ambiguity detected deterministically, not by the model** | `Mercury` summary returns `type: "disambiguation"` → server throws `DisambiguationError` → route returns 409 with candidate list → frontend renders chooser. The model never has to pick between Mercury planet vs element. |
| **Upstash for the rate limiter (not "Official Redis for Vercel")** | Functionally either provider would work — both are HTTPS-Redis designed for serverless. The deciding factor is `@upstash/ratelimit`: a purpose-built rate-limit SDK with sliding-window, fixed-window, and token-bucket algorithms, multi-region support, and analytics. Redis Inc.'s offering has no equivalent SDK, so I'd be rolling my own sliding window over raw INCR/EXPIRE (race conditions on increment-then-expire, TTL boundaries). For a complex Redis workload using JSON / search / vector modules, Redis Inc. would tip the choice the other way. |
| **In-memory rate-limit rejected** | A single-instance counter breaks the moment Vercel autoscales — each serverless instance has its own memory, so the effective limit multiplies by instance count. Vercel KV (now Upstash via marketplace) keeps the counter in shared external state so the limit holds across the fleet. |

### Model benchmark

Same prompt, schema, and Wikipedia context (Machine learning beginner, 150 candidates) through the AI Gateway. One run per model — directional, not statistical; sampling variance is real (especially on OpenAI reasoning models which run at default reasoning effort). Pricing approximate per public per-M-token rates.

| Model | Latency | Cost / map | Cost / 100K maps | Nodes | Integrity |
|---|---:|---:|---:|---:|:---:|
| **`google/gemini-2.5-flash-lite`** (default) | **8.0s** | **$0.0013** | **$133** | 10 | ✓ |
| `openai/gpt-4.1-mini` | 17.1s | $0.0034 | $343 | 8 | ✓ |
| `google/gemini-2.5-flash` | 23.7s | $0.013 | $1,255 | 13 | ✓ |
| `anthropic/claude-haiku-4-5` (fallback) | 30.0s | $0.017 | $1,737 | 16 | ✓ |
| `openai/gpt-5-mini` | 59.3s | $0.012 | $1,174 | 16 | ✓ |
| `openai/gpt-5-nano` | 88.2s | $0.0053 | $529 | 9 | ✓ |

Headlines:

- **Flash-Lite wins on latency and cost by a wide margin.** 2.1× faster than the next-fastest model (gpt-4.1-mini), 2.6× cheaper. Versus Haiku 4.5: 3.7× faster, 13× cheaper.
- **All six models pass integrity checks.** Schema validity, graph integrity, and URL grounding hold across providers — quality didn't separate them. Speed and cost did.
- **OpenAI reasoning models (gpt-5-nano, gpt-5-mini) run at default reasoning effort in this benchmark.** Setting `providerOptions.openai.reasoningEffort = "minimal"` would speed them up — a production deployment using them would tune that. We don't, because Flash-Lite is faster and cheaper out of the box.
- **The fallback (Haiku 4.5) is intentionally a *different provider*, not a stronger model.** Cross-provider resilience: a Google outage doesn't take both down.

## Fallback behavior

| Scenario | Status code | Body | UI |
|---|---|---|---|
| Happy path | 200 | `{ kind: "map", map, meta }` | Full graph + path + grounding badge |
| Ambiguous topic | 409 | `{ kind: "disambiguation", title, candidates }` | Chooser cards, single click re-submits |
| No Wikipedia article | 404 | `{ kind: "not_found", title }` | Friendly empty state + Try Again |
| AI fails twice | 502 | `{ kind: "ai_failed", message, fallback: {title, summary, candidateLinks} }` | Raw Wikipedia summary + candidate link list (degraded but useful) |
| Hallucinated URL in output | 200 | Map with stripped URLs + `warnings` array | Map renders normally; warnings card surfaces the issue |
| Rate limit exceeded | 429 | `{ kind: "rate_limited", message, retryAfterSeconds, limit }` + `Retry-After` header | Amber "Slow down a moment" card with the limit and a friendly explanation |
| Schema violation by model | retried once internally | (Caller never sees it) | (Caller never sees it) |
| Gateway transport failure | (Gateway tries next model) | (Caller never sees it) | (Caller never sees it) |

## Evaluation

Lightweight eval runner that exercises the full server pipeline (Wikipedia fetch → AI call → URL verify-then-strip → graph integrity check) plus the three user-facing edge cases (disambiguation, not_found, typo recovery) against 11 test cases.

```bash
npm run eval
```

> **Eval vs benchmark — different questions.** The eval suite holds the **model constant** (whatever `AI_MODEL` is set to) and varies **topics** — "does my code still produce correct output across many topics?" Run on every code change. The [benchmark](docs/model-benchmark.md) (`npm run benchmark`) holds the **topic constant** (Machine learning) and varies **models** — "which model should we use? quantify the tradeoff across providers." Run quarterly or when pricing/latency changes. Don't combine them; the cost and cadence profiles are different.

Per case, the runner emits two kinds of checks:

**Gating checks** (must pass; failure exits non-zero):

1. **Schema validity** — Zod-validated by `generateText` + `Output.object`
2. **Graph integrity** — every edge endpoint exists; exactly one `main_topic`; node count in [8, 18]; learning path length in [4, 10]
3. **URL grounding** — reports `0 hallucinated URLs (clean)` or `N stripped before render` (the pipeline always handles hallucination; this is a behavioral signal that the pipeline did its job)
4. **Forbidden absent** — unrelated terms don't appear in any text field (strong signal: the model rarely hallucinates off-topic content)
5. **Topic type** (when `expectedTopicType` is set) — asserts rule 3 (e.g. `Bill Gates → person`, not `concept`) so rule 4 applies the right arc
6. **Personalization** (when `userGoal` + `expectedGoalEcho` are set) — asserts rule 11: the `whyThisPath` paragraph echoes the goal's keywords
7. **Ambiguous regression** — `Mercury` / `ML` throw `DisambiguationError` instead of returning a confident map
8. **Candidate coverage** (for ambiguous cases) — asserts the disambig merge surfaces known-good options (`Mercury (planet)`, `Machine learning` for `ML`)
9. **Not_found regression** — junk and typo'd topics throw `WikipediaNotFoundError`
10. **Did-you-mean** (when `expectedSuggestionsInclude` is set) — asserts a typo like `Photosynthsis` returns `Photosynthesis` in its suggestions

**Info signal** (reported quantitatively; never gates):

- **Coverage** — `N/M expected concepts present (absent: ...)`. Absent concepts usually mean the candidate-link ordering didn't surface the term, not that the model failed. We report it but don't blame the model.

**Post-loop cross-level check:**

- **Audience adaptation** — when the same topic runs at multiple levels, asserts the `whyThisPath` rationales differ via Jaccard similarity (threshold 0.85). If rule 9 silently breaks, similarity shoots toward 1.0 and the check fires.

Per case, telemetry: wall-clock latency + token usage. Aggregate cost: roughly $0.03 to run the full suite on Flash-Lite (8 content generations + 3 fast edge cases). Exits non-zero on any gating-check failure (CI-ready).

Current baseline: **11/11 cases pass, 43/43 gating checks pass**, plus 7 `[INFO]` signals (coverage on content cases). A known limitation surfaces in the coverage signal: `prop=links` returns alphabetically within each lead/body fetch, so alphabetically late terms (`Supervised learning`, `Treaty of Versailles`) can get crowded out of the 150-candidate cap. A proper fix would interleave lead-section links with document-order body links by parsing wikitext. Documented in the [wiki layer](lib/wiki/).

## What are lead links?

Lead links are the hyperlinks found in the lead section (the first paragraph or intro) of a Wikipedia article. They usually point to the most important related concepts for that topic.

- In WikiCompass, the backend fetches these links separately using the Wikipedia API's section=0 (lead) parameter.
- These links are prioritized when building the candidate concept list for the learning map, because they’re more likely to be core concepts, not just tangentially related or citation links.
- This helps the AI focus on the most relevant, foundational topics when generating the learning path and graph.

**Why do this?**
When building a learning map, surfacing the most relevant, foundational topics first makes the experience more useful and less noisy for learners. Lead links are a strong signal for that, since Wikipedia authors tend to link the most important concepts in the intro.

## Local setup

```bash
git clone <repo>
cd wikicompass    # or whatever the cloned folder is named
npm install
cp .env.example .env.local
# fill in AI_GATEWAY_API_KEY from your Vercel project
npm run dev
```

Open http://localhost:3000.

### Env vars

```
AI_GATEWAY_API_KEY=...                            # required
AI_MODEL=google/gemini-2.5-flash-lite             # default
AI_FALLBACK_MODELS=anthropic/claude-haiku-4-5     # comma-separated, in priority order

# Rate limit (optional; the route degrades to a no-op if these are absent)
KV_REST_API_URL=...                               # auto-injected when Upstash is provisioned via Vercel
KV_REST_API_TOKEN=...                             # auto-injected when Upstash is provisioned via Vercel
```

### Useful scripts

```bash
npm run dev         # Next.js dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run eval        # full eval suite (11 cases)
npm run benchmark   # 6-model cost / latency benchmark
npm run test-wiki   # smoke test the Wikipedia layer (no AI call)
npm run test-ai     # smoke test the AI layer for one topic
```

## Deployment

Designed for Vercel:

1. `vercel link` (or import the repo from the Vercel dashboard)
2. Enable AI Gateway in the Vercel project (free tier is enough for the demo)
3. Add `AI_GATEWAY_API_KEY` to the Vercel project env vars (it's auto-injected by the Gateway integration in most setups)
4. Optionally set `AI_MODEL` and `AI_FALLBACK_MODELS` to override defaults
5. In the Vercel dashboard → **Storage** → **Browse Storage** → pick **Upstash** (Serverless DB) → create a **Redis** database, connect to project. This auto-injects `KV_REST_API_URL` + `KV_REST_API_TOKEN` and activates the rate limit on the next request.
6. `vercel --prod` (or push to `main` if you've enabled git integration)

Note: Vercel previously white-labeled Upstash as "Vercel KV." That branding has been retired in favor of pointing users directly at the provider marketplace; same product, same SDK, slightly different setup flow.

The first deploy will compile the route handlers. Cold-start latency for `/api/wiki/map` should be 5–6s end-to-end with Flash-Lite (vs. 15–30s seen in `next dev` due to Turbopack's per-request route compilation).

## Repo structure

```
app/
  page.tsx                       client home page
  layout.tsx                     metadata + fonts
  api/wiki/
    map/route.ts                 POST { topic, level, userGoal? } -> map | dab | 404 | ai_failed
components/
  TopicForm, ResultsByState,
  MapSkeleton, MapResult,
  KnowledgeGraph,                React Flow + dagre layout
  NodeDetailsPanel,
  ui/                            shadcn primitives
hooks/
  useWikiMap.ts                  client state machine
lib/
  schemas.ts                     central Zod schemas (request + AI output) and derived types
  wiki.ts                        search, summary, links, lead-section, context
  link-filter.ts                 pure Wikipedia link filter (blocklist + admin patterns + year detector + dedupe + cap)
  graph-layout.ts                dagre top-to-bottom positioning
  validation.ts                  URL strip, graph integrity, grounding override
  ai/
    model.ts                     env-var-driven model + fallback chain
    prompt.ts                    system + user message builder
    generateWikiMap.ts           generateText + Output.object call
evals/
  wiki-map-cases.json            11 test cases
  run-evals.ts                   runner: gating + behavioral checks (mirrors route)
scripts/
  test-wiki.ts                   manual Wikipedia smoke harness
  test-ai.ts                     manual AI smoke harness
  benchmark.ts                   6-model cost / latency benchmark
docs/
  model-benchmark.md             6-model comparison + decision rationale
```

## Production hardening shipped

- **Rate limit** — 10 req/min per IP, sliding window via `@upstash/ratelimit` against Vercel-hosted Upstash Redis. Verified live with a 12-request concurrent burst: 10 succeeded, 1 returned 429 at the configured threshold, 1 returned the `kind: "ai_failed"` graceful-degradation response (both AI Gateway primary + fallback were rate-limited downstream, route's 2-attempt retry caught it cleanly).
- **Native Gateway model fallback** — `providerOptions.gateway.models` configured with `gemini-2.5-flash-lite` primary, `claude-haiku-4-5` fallback. Gateway routes transparently on transport failures. App-side retry-once layered on top catches *content* failures (schema rejection) that survive the SDK's transport budget.
- **URL hallucination strip** — every generation's URLs are validated against the 61-URL allowed set (1 canonical + up to 60 candidate links). Any drift gets stripped to `null` server-side; the strip count + details go to server logs for ops visibility, not to the user.
- **Graph integrity check** — post-AI validation that all edge endpoints exist, exactly one `main_topic`, node/path counts in range.
- **Disambiguation merge** — strict search (quality-ranked) + actual disambig page links (curated coverage), deduped. Means typing `ML` surfaces `Machine learning` even though "ML" doesn't string-match the title.
- **"Did you mean...?" on typos** — `Photosynthsis` (typo) returns 404 + 5 suggestions via Wikipedia's fuzzy opensearch API. One click recovers.
- **Generic error responses** — internal error messages stay server-side (logs); client gets a generic message so library/version/upstream details don't leak in 5xx bodies.

## Known limitations and production next steps

- **Lead-section link ordering** — `prop=links` returns alphabetically. Coverage info signal in the eval surfaces this regularly (`Supervised learning` can fall off the 150-candidate cap on some runs). Real fix interleaves lead-section + document-order body links by parsing wikitext. Roughly 2–3 hours of work.
- **No streaming** — the AI call uses `generateText` (blocking) with a 5-second skeleton. Upgrading to `streamText` with `Output.object` and progressive node rendering ("watch the graph build itself") would cut perceived latency to ~1 second. Designed for, not yet implemented.
- **No persisted history** — every map is fresh. A "saved maps" feature with Postgres + a `share_id` is a 1-hour addition.
- **No analytics** — production would log topics searched, generation latency, validation failure rate, cost per map.
- **Single-shot prompt** — no chain-of-prompts (e.g., first classify topic type, then generate map for that type). Reasonable for MVP; would help quality on tail topics.
- **No LLM-as-judge eval** — the eval mechanically covers 10 distinct checks across structure / behavior / regression, but rules 2 (source-of-truth) and 10 (sensitive topics) remain unverified because they need qualitative judgment. LLM-as-judge would cover them at ~2× eval cost.
- **Disambiguation chooser cap = 15** — pathologically large disambig pages (50+ entries) may drop tail items. Could become a "show more" disclosure in the chooser UI when needed.
