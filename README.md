# WikiPath

**Turn any Wikipedia article into an AI-generated learning map.** A user enters a topic and a difficulty level; the app fetches bounded context from Wikipedia, asks an LLM to classify and order the concepts, and renders an interactive knowledge graph with a recommended learning path and per-node Wikipedia citations.

Built for Vercel's Solutions Architect Track B (AI Cloud) take-home assessment.

---

## Problem and audience

Wikipedia is the best public reference source we have, but it isn't optimized for *learning*. Articles are dense, links are noisy, and a beginner reading "Machine learning" can't tell which of the article's 400 links are prerequisites, which are core, and which are advanced follow-ups.

WikiPath restructures that reference data into a guided learning experience for three audiences:

- **Students** trying to learn a topic quickly
- **Knowledge workers** researching unfamiliar domains
- **Enterprise customer enablement / training teams** — the same pattern works over internal docs, support articles, or onboarding content

## Demo flow

1. Enter a topic (e.g. `Machine learning`), pick a level (Beginner / Intermediate / Advanced)
2. Skeleton loader for ~5 seconds while the AI works
3. See:
   - **Summary card** — topic type (concept / person / event / etc.), confidence badge, key takeaway, Wikipedia summary
   - **Knowledge graph** — 8–15 type-colored nodes with directed relationships, laid out top-to-bottom; click a node for explanation + Wikipedia link
   - **Learning path** — 4–8 ordered steps with one-sentence reasons and a paragraph-level "why this path" rationale
   - **Grounding badge** — "Selected N concepts from M candidate Wikipedia links" (transparency over which inputs the model saw)

Ambiguous topics like `Mercury` show a deterministic chooser (planet / element / mythology / Records / Project / Prize / etc.) **before** the AI is called — the model never has to guess which Mercury you meant.

## Architecture

```
                ┌──────────────────────────────────────┐
                │            Browser (React)           │
                │  TopicForm · ResultsShell · Skeleton │
                │  KnowledgeGraph (React Flow + dagre) │
                │       NodeDetailsPanel · etc.        │
                └────────────────┬─────────────────────┘
                                 │ POST /api/wiki/map
                                 ▼
   ┌──────────────────────────────────────────────────────────────┐
   │             Next.js App Router (route handlers)              │
   │                                                              │
   │   /api/wiki/search        /api/wiki/map                      │
   │   ├─ searchWikipedia      ├─ rate-limit check (per-IP) ──────┼──┐
   │                           ├─ getWikipediaContext             │  │
   │                           │   ├─ summary  (REST)             │  │
   │                           │   ├─ links    (Action API)       │  │
   │                           │   └─ lead-section links (parse)  │  │
   │                           │                                  │  │
   │                           ├─ generateWikiMap                 │  │
   │                           │   └─ generateObject (AI SDK)     │  │
   │                           │                                  │  │
   │                           └─ post-AI pipeline:               │  │
   │                               ├─ stripHallucinatedUrls       │  │
   │                               ├─ overrideGrounding           │  │
   │                               └─ checkGraphIntegrity         │  │
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

## Key technical decisions

| Decision | Why |
|---|---|
| **Live Wikipedia API, no RAG / vector DB** | The AI task is *structuring and classification* of an already-trusted source, not retrieval over hidden documents. Wikipedia is already a structured corpus. Adding RAG to MVP is over-engineering. The same UI + AI pattern transfers to enterprise knowledge bases — that's where RAG would slot in. |
| **`generateObject` with Zod schema** | Structured output: every field is type-checked before the frontend sees it. No `JSON.parse` failures, no "I'm sorry, I can't structure that" responses. Schema is the API contract. |
| **`gemini-2.5-flash-lite` as default model** | Benchmarked 5 models on the same prompt. Flash-Lite hits 5-second latency and ~$0.0006/map — 17× cheaper than Haiku 4.5 with comparable structured-output quality. See [docs/model-benchmark.md](docs/model-benchmark.md). |
| **Native Gateway fallback via `providerOptions.gateway.models`** | One config, no application retry code. Gateway routes the primary → fallback list on transport failures (rate limits, provider outages, timeouts) transparently. Application-level retry handles the *content* failure case (schema validation). |
| **URL strip post-generation** | The prompt forbids hallucinated URLs, but the model can drift. After every generation, the route strips any `wikipediaUrl` not in the candidate set we fetched and adds a warning. Trust nothing from the model on URLs. |
| **Lead-section-first link filter** | Heavily-cited articles (WWI, biographies) leak citation-author links into the top-60 candidates. Prepending lead-section links (intro paragraph only) puts core concepts at the top. Surfaced and quantified by the evals. |
| **Ambiguity detected deterministically, not by the model** | `Mercury` summary returns `type: "disambiguation"` → server throws `DisambiguationError` → route returns 409 with candidate list → frontend renders chooser. The model never has to pick between Mercury planet vs element. |
| **Upstash for the rate limiter (not "Official Redis for Vercel")** | Functionally either provider would work — both are HTTPS-Redis designed for serverless. The deciding factor is `@upstash/ratelimit`: a purpose-built rate-limit SDK with sliding-window, fixed-window, and token-bucket algorithms, multi-region support, and analytics. Redis Inc.'s offering has no equivalent SDK, so I'd be rolling my own sliding window over raw INCR/EXPIRE (race conditions on increment-then-expire, TTL boundaries). For a complex Redis workload using JSON / search / vector modules, Redis Inc. would tip the choice the other way. |
| **In-memory rate-limit rejected** | A single-instance counter breaks the moment Vercel autoscales — each serverless instance has its own memory, so the effective limit multiplies by instance count. Vercel KV (now Upstash via marketplace) keeps the counter in shared external state so the limit holds across the fleet. |

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

Lightweight eval runner that exercises the full server pipeline (Wikipedia fetch → AI call → URL strip → grounding override → graph integrity check) against five test cases.

```bash
npm run eval
```

Per case, asserts:

1. **Schema validity** — Zod-validated by `generateObject`
2. **Graph integrity** — every edge endpoint exists; exactly one `main_topic`; node count in [8, 15]; learning path length in [4, 8]
3. **URL integrity** — zero hallucinated URLs after the strip pass
4. **Coverage** — required terms (e.g. `Chlorophyll` for Photosynthesis) appear in node titles, learning-path titles, or summary
5. **Forbidden absent** — unrelated terms don't appear in any text field
6. **Ambiguous regression** — `Mercury` throws `DisambiguationError` instead of returning a confident map

Per case, telemetry: wall-clock latency + token usage. Aggregate cost: ~$0.013 to run the full suite on Flash-Lite (5 generations × ~4K tokens). Exits non-zero on any case failure (CI-ready).

Current baseline: **3/5 cases pass, 19/21 checks pass.** The two coverage failures (Photosynthesis missing "Light-dependent reactions" / "Carbon dioxide"; WWI sometimes missing "Treaty of Versailles" / "Trench warfare") share a known cause: `prop=links` returns alphabetically within each lead/body fetch, so alphabetically late terms get crowded out of the top 60. A proper fix would interleave lead links with document-order body links. Documented in the [wiki layer](lib/wiki.ts).

## Local setup

```bash
git clone <repo>
cd wikipath
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
UPSTASH_REDIS_REST_URL=...                        # auto-injected when Upstash is provisioned via Vercel
UPSTASH_REDIS_REST_TOKEN=...                      # auto-injected when Upstash is provisioned via Vercel
```

### Useful scripts

```bash
npm run dev         # Next.js dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run eval        # full eval suite (5 cases)
npm run test-wiki   # smoke test the Wikipedia layer (no AI call)
npm run test-ai     # smoke test the AI layer for one topic
```

## Deployment

Designed for Vercel:

1. `vercel link` (or import the repo from the Vercel dashboard)
2. Enable AI Gateway in the Vercel project (free tier is enough for the demo)
3. Add `AI_GATEWAY_API_KEY` to the Vercel project env vars (it's auto-injected by the Gateway integration in most setups)
4. Optionally set `AI_MODEL` and `AI_FALLBACK_MODELS` to override defaults
5. In the Vercel dashboard → **Storage** → **Browse Storage** → pick **Upstash** (Serverless DB) → create a **Redis** database, connect to project. This auto-injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` and activates the rate limit on the next request.
6. `vercel --prod` (or push to `main` if you've enabled git integration)

Note: Vercel previously white-labeled Upstash as "Vercel KV." That branding has been retired in favor of pointing users directly at the provider marketplace; same product, same SDK, slightly different setup flow.

The first deploy will compile the route handlers. Cold-start latency for `/api/wiki/map` should be 5–6s end-to-end with Flash-Lite (vs. 15–30s seen in `next dev` due to Turbopack's per-request route compilation).

## Repo structure

```
app/
  page.tsx                       client home page
  layout.tsx                     metadata + fonts
  api/wiki/
    search/route.ts              POST { query } -> { candidates }
    context/route.ts             (stub — not exposed to UI in MVP)
    map/route.ts                 POST { topic, level } -> map | dab | 404 | ai_failed
components/
  TopicForm, ResultsShell,
  MapSkeleton, MapResult,
  KnowledgeGraph,                React Flow + dagre layout
  NodeDetailsPanel,
  ui/                            shadcn primitives
hooks/
  useWikiMap.ts                  client state machine
lib/
  wiki.ts                        search, summary, links, lead-section, context
  context.ts                     pure link filter
  graph-layout.ts                dagre top-to-bottom positioning
  validation.ts                  URL strip, graph integrity, grounding override
  ai/
    model.ts                     env-var-driven model + fallback chain
    schema.ts                    Zod schema for WikiMap output
    prompt.ts                    system + user message builder
    generateWikiMap.ts           generateObject call
evals/
  wiki-map-cases.json            5 test cases
  run-evals.ts                   runner with 7 check types
scripts/
  test-wiki.ts                   manual Wikipedia smoke harness
  test-ai.ts                     manual AI smoke harness
docs/
  model-benchmark.md             5-model comparison + decision rationale
```

## Known limitations and production next steps

- **Lead-section link ordering** — `prop=links` returns alphabetically. A proper fix interleaves lead-section + document-order body links by fetching wikitext. Roughly 2–3 hours of work.
- **Rate limit auto-activates when Upstash is provisioned** — `lib/rate-limit.ts` runs 10 req/min/IP sliding window via `@upstash/ratelimit`, but only when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set. Without them the limiter is a no-op so local dev works without external dependencies. Provision Upstash from the Vercel marketplace and the limit activates on the next request.
- **No streaming** — the AI call uses `generateObject` (blocking) with a 5-second skeleton. Upgrading to `streamObject` and progressive node rendering ("watch the graph build itself") would cut perceived latency to ~1 second. Designed for, not yet implemented.
- **No persisted history** — every map is fresh. A "saved maps" feature with Postgres + a `share_id` is a 1-hour addition.
- **No analytics** — production would log topics searched, generation latency, validation failure rate, cost per map.
- **Single-shot prompt** — no chain-of-prompts (e.g., first classify topic type, then generate map for that type). Reasonable for MVP; would help quality on tail topics.
- **No LLM-as-judge eval** — the eval suite checks schema, graph integrity, URL integrity, and string-coverage. Quality of explanations is not automatically graded; that would add an LLM-judge dimension at ~2× the eval cost.
