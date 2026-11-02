import type { ChatProvider } from "../providers/types";
import { tokenizeQuery } from "../search/tokenize";
import { EXPANSION_SYSTEM_PROMPT } from "./prompts";

/** Spec range for expanded terms. More than this adds noise, fewer adds nothing. */
const MIN_TERMS = 3;
const MAX_TERMS = 8;

/**
 * Turns a question into search terms using the provider.
 *
 * Always returns usable terms: on any failure, unparseable reply or empty
 * result, it falls back to the question's own terms. Expansion is an
 * optimisation, so it must never be able to break search.
 */
export async function expandQuestion(
  question: string,
  provider: ChatProvider | null,
): Promise<{ terms: string[]; expanded: boolean }> {
  const own = tokenizeQuery(question);
  if (!provider || own.length === 0) return { terms: own, expanded: false };

  try {
    const result = await provider.complete({
      system: EXPANSION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
      maxTokens: 120,
      json: true,
    });

    const parsed = parseTerms(result.text);
    if (parsed.length === 0) return { terms: own, expanded: false };

    // The question's own terms always stay in: expansion adds, never replaces.
    const merged = [...new Set([...own, ...parsed])].slice(0, MAX_TERMS + own.length);
    return { terms: merged, expanded: merged.length > own.length };
  } catch {
    // A provider failure must not stop search (US-8).
    return { terms: own, expanded: false };
  }
}

/**
 * Reads the terms out of the model's reply.
 *
 * Tolerant on purpose: models wrap JSON in prose or code fences, and an
 * unreadable reply is a fallback, never an error.
 */
export function parseTerms(raw: string): string[] {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];
  const terms = (parsed as { terms?: unknown }).terms;
  if (!Array.isArray(terms)) return [];

  const cleaned: string[] = [];
  for (const term of terms) {
    if (typeof term !== "string") continue;
    // Each entry is tokenised, so a model that returns a phrase still yields terms.
    for (const token of tokenizeQuery(term)) {
      if (!cleaned.includes(token)) cleaned.push(token);
    }
  }

  return cleaned.length >= MIN_TERMS ? cleaned.slice(0, MAX_TERMS) : cleaned;
}
