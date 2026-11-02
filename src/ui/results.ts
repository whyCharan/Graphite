import type { NoteHit, MatchReason } from "../search/types";
import { normalizeForMatch } from "../chat/normalize";

/** Characters of excerpt shown per result. Enough to judge relevance, short enough to scan. */
const EXCERPT_LENGTH = 220;

export interface ResultCallbacks {
  /** Opens a note. `newTab` is true for Ctrl/Cmd+click or Ctrl/Cmd+Enter. */
  openNote: (notePath: string, newTab: boolean) => void;
}

/**
 * Renders the ranked notes.
 *
 * Every result is a button, so Tab reaches it and Enter opens it without any
 * extra key handling (US-1). Match reasons are written as text, never carried
 * by colour alone (US-9).
 */
export function renderResults(
  container: HTMLElement,
  notes: readonly NoteHit[],
  callbacks: ResultCallbacks,
): void {
  const list = container.createDiv({ cls: "graphite-results" });

  for (const note of notes) {
    const item = list.createEl("button", { cls: "graphite-result" });
    item.type = "button";
    item.setAttribute("aria-label", `Open ${note.noteTitle}`);

    item.createDiv({ cls: "graphite-result-title", text: note.noteTitle });
    if (note.folder) {
      item.createDiv({ cls: "graphite-result-folder", text: note.folder });
    }

    const excerpt = buildExcerpt(note);
    if (excerpt.text) {
      renderExcerpt(item.createDiv({ cls: "graphite-result-excerpt" }), excerpt.text, excerpt.terms);
    }

    const reason = describeReasons(note.reasons);
    if (reason) item.createDiv({ cls: "graphite-result-reason", text: reason });

    item.addEventListener("click", (event) => {
      callbacks.openNote(note.notePath, event.ctrlKey || event.metaKey);
    });
    item.addEventListener("keydown", (event) => {
      // Enter and Space already activate a button; only the modifier needs handling.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        callbacks.openNote(note.notePath, true);
      }
    });
  }
}

/** Reasons as a sentence. Several reasons are joined so none is hidden. */
export function describeReasons(reasons: readonly MatchReason[]): string {
  const parts: string[] = [];
  for (const reason of reasons) {
    if (reason.kind === "terms" && reason.terms.length > 0) {
      parts.push(`Matched: ${reason.terms.join(", ")}`);
    } else if (reason.kind === "linked") {
      parts.push(`Linked from ${reason.fromTitle}`);
    }
  }
  return parts.join(" · ");
}

interface Excerpt {
  text: string;
  terms: string[];
}

/**
 * Picks the excerpt window around the first matched term, so the user sees why
 * the note matched rather than its opening boilerplate.
 */
function buildExcerpt(note: NoteHit): Excerpt {
  const best = note.snippets[0];
  if (!best) return { text: "", terms: [] };

  const body = plainText(best.section.body);
  const terms = best.matchedTerms;
  if (body.length <= EXCERPT_LENGTH) return { text: body, terms };

  const lowered = body.toLowerCase();
  let start = 0;
  for (const term of terms) {
    const at = lowered.indexOf(term.toLowerCase());
    if (at !== -1) {
      // Keep a little context before the match rather than cutting at it.
      start = Math.max(0, at - 40);
      break;
    }
  }

  const slice = body.slice(start, start + EXCERPT_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = start + EXCERPT_LENGTH < body.length ? "…" : "";
  return { text: `${prefix}${slice}${suffix}`, terms };
}

/**
 * Writes the excerpt, marking matched words.
 *
 * Built with createEl rather than innerHTML, so note content can never be
 * interpreted as markup.
 */
function renderExcerpt(target: HTMLElement, text: string, terms: readonly string[]): void {
  if (terms.length === 0) {
    target.setText(text);
    return;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ivg");
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > lastIndex) target.appendText(text.slice(lastIndex, at));
    target.createEl("mark", { text: match[0] });
    lastIndex = at + match[0].length;
  }
  if (lastIndex < text.length) target.appendText(text.slice(lastIndex));
}

/**
 * Strips the Markdown markers an excerpt would otherwise show literally, such
 * as "**parcel**", keeping every word. Display only: the quote check works on
 * the note text itself.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exported for tests: the excerpt a note would show. */
export function excerptFor(note: NoteHit): string {
  return buildExcerpt(note).text;
}

/** Exported for tests: whether a term would be marked in an excerpt. */
export function wouldMark(text: string, term: string): boolean {
  return normalizeForMatch(text).includes(normalizeForMatch(term));
}
