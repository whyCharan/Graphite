/**
 * Query and document text are tokenised by the same function, so a term only
 * matches when both sides were folded identically.
 */

/**
 * Closed-class English words carry no retrieval signal and would otherwise
 * dominate short queries. Kept small on purpose: anything a note might be
 * genuinely about stays searchable.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "did", "do", "does",
  "for", "from", "had", "has", "have", "how", "i", "if", "in", "into", "is",
  "it", "its", "of", "on", "or", "so", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "to", "was", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "you", "your",
]);

/** Words whose trailing "s" belongs to the stem, not a plural. */
const PROTECTED_STEMS = new Set(["css", "js", "ts", "aws", "gas", "class", "less", "jss"]);

/**
 * Strips diacritics so "café" and "cafe" are one term.
 *
 * Limited to the combining marks NFD produces for Latin accents. The broader
 * \p{Diacritic} class also matches the Japanese prolonged sound mark (U+30FC),
 * which would silently rewrite ノート as ノト.
 */
function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Folds regular English plurals to their singular. Deliberately shallow: a
 * stemmer that also folded verb forms would collide distinct note topics.
 */
function foldPlural(term: string): string {
  if (term.length < 4 || PROTECTED_STEMS.has(term)) return term;
  if (term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.endsWith("sses")) return term.slice(0, -2);
  if (term.endsWith("es") && /(ch|sh|x|z)es$/.test(term)) return term.slice(0, -2);
  if (term.endsWith("s") && !term.endsWith("ss") && !term.endsWith("us")) return term.slice(0, -1);
  return term;
}

/**
 * Splits text into comparable terms.
 *
 * Hyphens and underscores split, because vault note names are often slugs
 * ("code-generation-reasoning") and a user searching "reasoning" expects to
 * find them.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const folded = stripAccents(text.toLowerCase());
  const raw = folded.split(/[^\p{L}\p{N}]+/u);
  const terms: string[] = [];
  for (const piece of raw) {
    if (!piece || piece.length < 2) continue;
    if (STOP_WORDS.has(piece)) continue;
    terms.push(foldPlural(piece));
  }
  return terms;
}

/**
 * Tokenises a query, dropping duplicates but keeping the order the user typed,
 * so match reasons read back in a predictable sequence.
 */
export function tokenizeQuery(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of tokenize(query)) {
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

/** Exposed so the no-match state can tell the user which terms were tried. */
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}
