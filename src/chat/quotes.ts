import type { NoteHit } from "../search/types";
import { normalizeForMatch, unwrapUnresolvedWikilinks } from "./normalize";

/** A `[n: "quote"]` citation as the model wrote it. */
export interface Citation {
  /** 1-based index into the excerpts that were sent. */
  number: number;
  quote: string;
  /** Whether the number names a retrieved note and the quote is in its excerpt. */
  verified: boolean;
}

export interface Claim {
  /** The claim's text, with its citations removed. */
  text: string;
  citations: Citation[];
  /** True when at least one citation verified. Only these are shown. */
  verified: boolean;
}

export interface VerifiedAnswer {
  /** The answer rebuilt from verified claims only. Empty when none survived. */
  answer: string;
  claims: Claim[];
  /** Claims dropped because no citation verified. Reported to the user as text. */
  removedCount: number;
  /** Notes actually cited by a surviving claim, in order of first appearance. */
  citedNotes: NoteHit[];
  /** False when the model produced claims but none could be verified. */
  anyVerified: boolean;
}

/** Matches `[2: "quote"]`, tolerating curly quotes and loose spacing. */
const CITATION = /\[\s*(\d+)\s*:\s*["“]([^"”]*)["”]\s*\]/g;

/** Private-use placeholder, so sentence splitting cannot cut inside a citation. */
const MASK_OPEN = "";
const MASK_CLOSE = "";

interface ParsedCitation {
  number: number;
  quote: string;
}

/**
 * Splits an answer into claims.
 *
 * Citations are masked first: a quote may contain a full stop, and splitting on
 * sentence boundaries without masking would tear the citation in half.
 */
function splitClaims(answer: string): Array<{ text: string; citations: ParsedCitation[] }> {
  const found: ParsedCitation[] = [];
  const masked = answer.replace(CITATION, (_whole, number: string, quote: string) => {
    found.push({ number: Number(number), quote });
    return `${MASK_OPEN}${found.length - 1}${MASK_CLOSE}`;
  });

  // A claim ends after its citations, so the split happens after a citation
  // mask, and a sentence boundary that is followed by one does not split at
  // all. Otherwise "We chose Groq. [1: "…"]" would leave the citation stranded
  // in its own claim and drop the sentence it belongs to.
  const pieces = masked
    .split(
      new RegExp(
        `(?<=${MASK_CLOSE})\\s+(?!${MASK_OPEN})|(?:\\n+|(?<=[.!?])\\s+)(?!${MASK_OPEN})`,
      ),
    )
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);

  return pieces.map((piece) => {
    const citations: ParsedCitation[] = [];
    const text = piece
      .replace(new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, "g"), (_whole, index: string) => {
        citations.push(found[Number(index)]);
        return "";
      })
      .replace(/\s+/g, " ")
      // Some models put the full stop after the citation, which would leave
      // "throughput ." once the citation is removed.
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim();
    return { text, citations };
  });
}

/**
 * Checks one citation against the excerpts that were sent.
 *
 * Both sides are normalised, so formatting differences pass and any changed
 * word fails. An empty quote never verifies: it would otherwise match
 * everything.
 */
function verifyCitation(citation: ParsedCitation, hits: readonly NoteHit[]): boolean {
  const hit = hits[citation.number - 1];
  if (!hit) return false;
  const quote = normalizeForMatch(citation.quote);
  if (quote.length === 0) return false;
  return hit.snippets.some((snippet) => normalizeForMatch(snippet.section.body).includes(quote));
}

/**
 * Verifies a model's answer against the notes it was given.
 *
 * Claims survive only when at least one of their citations names a retrieved
 * note and carries a quote found in that note's excerpt. Everything else is
 * removed and counted, so the panel can say how many claims were dropped.
 */
export function verifyAnswer(
  rawAnswer: string,
  hits: readonly NoteHit[],
  resolvesLink: (target: string) => boolean = () => false,
): VerifiedAnswer {
  const parsed = splitClaims(rawAnswer);
  const claims: Claim[] = [];
  const citedPaths = new Set<string>();
  const citedNotes: NoteHit[] = [];
  let removedCount = 0;

  for (const piece of parsed) {
    const citations: Citation[] = piece.citations.map((citation) => ({
      number: citation.number,
      quote: citation.quote,
      verified: verifyCitation(citation, hits),
    }));
    const verified = citations.some((citation) => citation.verified);

    // A claim with no citation has no grounding at all, so it is removed too.
    if (!verified) {
      if (piece.text.length > 0) removedCount += 1;
      continue;
    }

    for (const citation of citations) {
      if (!citation.verified) continue;
      const hit = hits[citation.number - 1];
      if (hit && !citedPaths.has(hit.notePath)) {
        citedPaths.add(hit.notePath);
        citedNotes.push(hit);
      }
    }

    claims.push({
      text: unwrapUnresolvedWikilinks(piece.text, resolvesLink),
      citations,
      verified: true,
    });
  }

  return {
    answer: claims.map((claim) => claim.text).join(" "),
    claims,
    removedCount,
    citedNotes,
    anyVerified: claims.length > 0,
  };
}

/** The user-facing sentence for dropped claims. Text, never colour alone (US-2). */
export function removedClaimsMessage(removedCount: number): string | null {
  if (removedCount <= 0) return null;
  if (removedCount === 1) return "1 claim removed: its quote wasn't found in the note.";
  return `${removedCount} claims removed: their quotes weren't found in the notes.`;
}
