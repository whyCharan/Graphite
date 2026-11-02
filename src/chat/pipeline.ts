import { ProviderError } from "../providers/errors";
import type { ChatMessage, ChatProvider, TokenUsage } from "../providers/types";
import type { SearchResult } from "../search/VaultIndex";
import { tokenizeQuery } from "../search/tokenize";
import type { NoteHit } from "../search/types";
import { expandQuestion } from "./expansion";
import { ANSWER_SYSTEM_PROMPT, buildAnswerPrompt, NO_ANSWER_MARKER } from "./prompts";
import { verifyAnswer, type VerifiedAnswer } from "./quotes";

/** Conversation turns kept for follow-up questions (US-4). */
export const MAX_HISTORY_MESSAGES = 6;

/** Ceiling on an answer, generous enough for several cited claims. */
const ANSWER_MAX_TOKENS = 800;

/** What was sent to the provider, shown under the answer (US-10). */
export interface SentRecord {
  excerptCount: number;
  /** The exact user message, so the panel can show it verbatim. */
  text: string;
  usage: TokenUsage;
}

export type AskOutcome =
  /** The question had no searchable words. */
  | { kind: "no-terms" }
  /** Search found nothing, so no provider was called (US-3). */
  | { kind: "no-matches"; terms: string[] }
  /** Results only: no provider configured, or the provider failed (US-8). */
  | { kind: "search-only"; terms: string[]; notes: NoteHit[]; reason: string | null }
  /** An answer where every shown claim carries a verified quote. */
  | {
      kind: "answered";
      terms: string[];
      notes: NoteHit[];
      verified: VerifiedAnswer;
      sent: SentRecord;
    }
  /** The model answered but nothing could be verified; the answer is withheld. */
  | {
      kind: "unverified";
      terms: string[];
      notes: NoteHit[];
      removedCount: number;
      sent: SentRecord;
    };

export interface AskOptions {
  question: string;
  /** Earlier turns, oldest first. Trimmed to the last {@link MAX_HISTORY_MESSAGES}. */
  history: readonly ChatMessage[];
  provider: ChatProvider | null;
  searchTerms: (terms: readonly string[], limit: number) => SearchResult;
  notesPerAnswer: number;
  expandQuestion: boolean;
  /** Resolves a wikilink target, so unresolved links are unwrapped. */
  resolvesLink: (target: string) => boolean;
  /** Reports the current step as words, never a bare spinner (US-6). */
  onStep: (step: string) => void;
}

/** Keeps the most recent turns, so a long chat does not grow the prompt without bound. */
export function trimHistory(history: readonly ChatMessage[]): ChatMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES).map((message) => ({ ...message }));
}

/**
 * Runs a question through search, the provider and the quote check.
 *
 * Search comes first and always runs. The provider is called only when search
 * found something, so a question the vault cannot answer costs nothing and
 * cannot produce an invented answer.
 */
export async function ask(options: AskOptions): Promise<AskOutcome> {
  const { question, provider, onStep } = options;

  let terms = tokenizeQuery(question);
  if (terms.length === 0) return { kind: "no-terms" };

  if (options.expandQuestion && provider) {
    onStep("Expanding your question");
    const expansion = await expandQuestion(question, provider);
    if (expansion.terms.length > 0) terms = expansion.terms;
  }

  onStep("Searching your notes");
  const result = options.searchTerms(terms, options.notesPerAnswer);

  if (result.notes.length === 0) {
    // No matches: the answer call is skipped entirely (spec safeguard).
    return { kind: "no-matches", terms: result.terms };
  }

  if (!provider) {
    return { kind: "search-only", terms: result.terms, notes: result.notes, reason: null };
  }

  onStep(`Reading ${result.notes.length} ${result.notes.length === 1 ? "note" : "notes"}`);
  const userMessage = buildAnswerPrompt(question, result.notes);

  onStep("Writing answer");
  let text: string;
  let usage: TokenUsage;
  try {
    const completion = await provider.complete({
      system: ANSWER_SYSTEM_PROMPT,
      messages: [...trimHistory(options.history), { role: "user", content: userMessage }],
      maxTokens: ANSWER_MAX_TOKENS,
    });
    text = completion.text;
    usage = completion.usage;
  } catch (cause) {
    // Any provider failure falls back to search results with one explanation.
    const reason =
      cause instanceof ProviderError
        ? cause.message
        : "The provider could not be reached. Your search results are below.";
    return { kind: "search-only", terms: result.terms, notes: result.notes, reason };
  }

  const sent: SentRecord = { excerptCount: result.notes.length, text: userMessage, usage };

  // The model saying it found nothing is not an answer to verify.
  if (text.toLowerCase().includes(NO_ANSWER_MARKER)) {
    return { kind: "unverified", terms: result.terms, notes: result.notes, removedCount: 0, sent };
  }

  onStep("Checking quotes");
  const verified = verifyAnswer(text, result.notes, options.resolvesLink);

  if (!verified.anyVerified) {
    return {
      kind: "unverified",
      terms: result.terms,
      notes: result.notes,
      removedCount: verified.removedCount,
      sent,
    };
  }

  return { kind: "answered", terms: result.terms, notes: result.notes, verified, sent };
}
