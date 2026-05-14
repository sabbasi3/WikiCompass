import type { WikiMap } from "./ai/schema";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateWikiMap(
  _map: WikiMap,
  _allowedUrls: Set<string>,
): ValidationResult {
  return { ok: true, errors: [] };
}
