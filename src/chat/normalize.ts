/**
 * Text normalisation for the quote check.
 *
 * A model reproducing a quote from a note will often differ in case, spacing,
 * or Markdown markers it copied or dropped. Those differences are not
 * misquotes, so both sides are folded the same way before comparison. Anything
 * that changes a *word* must survive normalisation and fail the check.
 */

/** Curly quotes and dashes, which models and editors substitute freely. */
const SMART_CHARACTERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[–—―]/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
];

/**
 * Removes Markdown that decorates text without changing the words: emphasis
 * markers, inline code ticks, heading hashes, list bullets and link syntax.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/[*_~`]/g, "");
}

/**
 * Folds text to its comparable form. Used on both the model's quote and the
 * excerpt that was actually sent, so a match means the words agree.
 */
export function normalizeForMatch(text: string): string {
  let folded = text;
  for (const [pattern, replacement] of SMART_CHARACTERS) folded = folded.replace(pattern, replacement);
  folded = stripMarkdown(folded);
  return folded.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Turns `[[target]]` and `[[target|alias]]` into plain text unless the target
 * resolves in the vault, so an answer can never link to a note that does not
 * exist (spec: hallucination safeguards).
 */
export function unwrapUnresolvedWikilinks(
  text: string,
  resolves: (target: string) => boolean,
): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, target: string, alias?: string) => {
    return resolves(target.trim()) ? whole : (alias ?? target).trim();
  });
}
