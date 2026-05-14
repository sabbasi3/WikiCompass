import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";

import type { WikiContext } from "../wiki";
import { wikiMapSchema, type WikiMap } from "./schema";
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

export async function generateWikiMap(
  context: WikiContext,
  modelOverride?: string,
): Promise<GenerateWikiMapResult> {
  const { system, prompt } = buildWikiMapPrompt(context);
  const modelId = modelOverride ?? AI_MODEL;
  const isReasoningModel = /\/gpt-5/.test(modelId) || /\/o[134]/.test(modelId);
  const modelChain = [
    modelId,
    ...AI_FALLBACK_MODELS.filter((m) => m !== modelId),
  ];
  const t0 = Date.now();
  const result = await generateObject({
    model: gateway(modelId),
    schema: wikiMapSchema,
    system,
    prompt,
    temperature: 0.2,
    providerOptions: {
      ...(isReasoningModel && { openai: { reasoningEffort: "minimal" } }),
      gateway: { models: modelChain },
    },
  });
  return {
    map: result.object,
    usage: result.usage,
    latencyMs: Date.now() - t0,
  };
}
