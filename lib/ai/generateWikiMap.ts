// The single AI call. Output.object grammar-constrains the model to our
// Zod schema — no JSON.parse, no "sure here's your data:" preambles.
// providerOptions.gateway.models lets the Gateway transparently fall back
// to the next model on transport failure (5xx, timeout, rate limit) before
// our route ever sees the error. Cross-provider fallback by default.

import { Output, generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

import type { WikiContext } from "../wiki";
import { wikiMapSchema, type WikiMap } from "../schemas";
import { buildWikiMapPrompt } from "./prompt";
import { AI_FALLBACK_MODELS, AI_MODEL } from "./model";

export type GenerateWikiMapResult = {
  map: WikiMap;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
};

// modelOverride exists so the benchmark script can swap models without
// touching env vars. Production calls pass no override.
export async function generateWikiMap(
  context: WikiContext,
  modelOverride?: string,
): Promise<GenerateWikiMapResult> {
  const { system, prompt } = buildWikiMapPrompt(context);
  const modelId = modelOverride ?? AI_MODEL;
  // Ensure the primary model is first in the chain even when it equals
  // a fallback (dedupe). Gateway tries them in order.
  const modelChain = [
    modelId,
    ...AI_FALLBACK_MODELS.filter((m) => m !== modelId),
  ];
  const t0 = Date.now();
  const result = await generateText({
    model: gateway(modelId),
    system,
    prompt,
    // Low temperature: this is classification, not creative writing.
    // 0.2 keeps the model's choices stable across runs without going fully deterministic.
    temperature: 0.2,
    output: Output.object({ schema: wikiMapSchema }),
    providerOptions: {
      gateway: { models: modelChain },
    },
  });
  return {
    map: result.output,
    usage: result.usage,
    latencyMs: Date.now() - t0,
  };
}
