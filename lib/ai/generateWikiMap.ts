import type { WikiContext } from "../wiki";
import type { WikiMap } from "./schema";

export async function generateWikiMap(_context: WikiContext): Promise<WikiMap> {
  throw new Error("generateWikiMap not implemented");
}
