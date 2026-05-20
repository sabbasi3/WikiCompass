// Helpers for pulling plain text out of AI SDK message shapes.
//
// useChat sends UIMessages with a parts[] array (text parts, tool-call
// parts, etc.). DurableAgent returns ModelMessages with content that's
// either a string or an array of parts. Both layers need a "give me
// just the text" projection — collected here so the chat route and the
// chat workflow share one implementation.

import type { ModelMessage, UIMessage } from "ai";

// A text-shaped part — the one part type we actually use. useChat's
// streamed messages can also contain tool-call / tool-result / data /
// step-start / step-finish parts, none of which we need to render or
// persist. This narrows to just the parts we care about.
export type TextPart = { type: "text"; text: string };

// Filter to text parts only, with the right runtime + type narrowing.
// Lives here so the API route's sanitizer, the workflow's response
// extractor, and the React bubble component all share one definition.
export function textOnlyParts(
  parts: UIMessage["parts"] | undefined,
): TextPart[] {
  return (parts ?? []).filter(
    (part): part is TextPart =>
      part.type === "text" &&
      typeof (part as { text?: unknown }).text === "string",
  );
}

// Pulls plain text from a UIMessage. Used by the chat API route to
// persist the user's typed input. Tolerant of both the parts-array
// shape (current AI SDK) and an older top-level content string, since
// we don't fully control what useChat sends across versions.
export function textFromUIMessage(message: UIMessage): string {
  if (message.parts) {
    return textOnlyParts(message.parts)
      .map((part) => part.text)
      .join("");
  }
  const maybeContent = (message as { content?: unknown }).content;
  return typeof maybeContent === "string" ? maybeContent : "";
}

// Pulls plain text from the last assistant ModelMessage in an agent's
// result. Tool-call / tool-result parts are skipped — we only persist
// the model's final spoken text to chat history.
export function lastAssistantText(messages: ModelMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return "";
  if (typeof last.content === "string") return last.content;
  return last.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
