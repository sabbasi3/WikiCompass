import { Output, generateText } from "ai";
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
  const modelChain = [
    modelId,
    ...AI_FALLBACK_MODELS.filter((m) => m !== modelId),
  ];
  const t0 = Date.now();
  const result = await generateText({
    model: gateway(modelId),
    system,
    prompt,
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
