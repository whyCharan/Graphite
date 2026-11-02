import { Bm25Index } from "./bm25";
import { isExcluded } from "./exclusions";
import { applyLinkBoost, type LinkGraph } from "./graph";
import { splitIntoSections, type NoteInput } from "./sections";
import { tokenizeQuery } from "./tokenize";
import type { NoteHit, SectionHit } from "./types";

/** Indexing progress, so the panel can show "<done> of <total> notes" (US-6). */
export interface IndexProgress {
  done: number;
  total: number;
  building: boolean;
}

export interface SearchResult {
  /** The terms actually searched, so the no-match state can list them (US-3). */
  terms: string[];
  notes: NoteHit[];
}

/**
 * How much a note gains from matching in more than one section. Well under 1,
 * so a long note matching weakly in many places cannot outrank a note whose
 * single best section is a direct hit.
 */
const ADDITIONAL_SECTION_WEIGHT = 0.15;

/** Excerpts kept per note. Bounds what a provider is sent per result. */
const MAX_SNIPPETS_PER_NOTE = 3;

/**
 * Matched terms a note needs before it counts as a result.
 *
 * Without a floor, one shared common word is enough: "who won the table tennis
 * tournament" matched a note about message queues on the word "won". Saying
 * nothing matched is the honest answer, and criterion 3 requires it.
 *
 * Computed from the user's own terms, never the expanded list, and capped at
 * two, so expansion can widen a search but never make it harder to satisfy.
 */
function requiredTermMatches(termCount: number): number {
  return Math.max(1, Math.min(2, Math.ceil(termCount / 2)));
}

/**
 * The vault's search index: sections in BM25, grouped back into notes.
 *
 * Deliberately free of Obsidian imports (spec rule) so every ranking and
 * exclusion path is unit-testable without the app. The adapter in `src/vault/`
 * feeds it.
 */
export class VaultIndex {
  private readonly bm25 = new Bm25Index();
  private readonly indexedPaths = new Set<string>();
  private excludedFolders: readonly string[] = [];
  private progressState: IndexProgress = { done: 0, total: 0, building: false };
  private linkGraph: LinkGraph | null = null;

  /** Supplies the link graph for the boost. Search works without one. */
  setLinkGraph(graph: LinkGraph | null): void {
    this.linkGraph = graph;
  }

  get progress(): IndexProgress {
    return { ...this.progressState };
  }

  get noteCount(): number {
    return this.indexedPaths.size;
  }

  get excluded(): readonly string[] {
    return this.excludedFolders;
  }

  /**
   * Replaces the exclusion list and drops any note that is now excluded.
   *
   * Returns true when the list actually changed, so the caller knows whether a
   * re-index is needed to pick up notes that are no longer excluded.
   */
  setExcludedFolders(folders: readonly string[]): boolean {
    const next = [...folders];
    const changed =
      next.length !== this.excludedFolders.length ||
      next.some((folder, at) => folder !== this.excludedFolders[at]);
    this.excludedFolders = next;
    if (!changed) return false;

    for (const path of [...this.indexedPaths]) {
      if (isExcluded(path, this.excludedFolders)) this.removeNote(path);
    }
    return true;
  }

  isExcluded(notePath: string): boolean {
    return isExcluded(notePath, this.excludedFolders);
  }

  beginBuild(total: number): void {
    this.progressState = { done: 0, total, building: true };
  }

  endBuild(): void {
    this.progressState = { ...this.progressState, building: false };
  }

  /** Indexes a note unless it is excluded. Returns false when it was skipped. */
  indexNote(note: NoteInput): boolean {
    if (this.progressState.building) this.progressState.done += 1;
    if (this.isExcluded(note.path)) {
      // A note moved into an excluded folder must not linger in the index.
      this.removeNote(note.path);
      return false;
    }
    this.bm25.updateNote(note.path, splitIntoSections(note));
    this.indexedPaths.add(note.path);
    return true;
  }

  removeNote(notePath: string): void {
    this.bm25.removeNote(notePath);
    this.indexedPaths.delete(notePath);
  }

  renameNote(oldPath: string, note: NoteInput): void {
    this.removeNote(oldPath);
    this.indexNote(note);
  }

  clear(): void {
    for (const path of [...this.indexedPaths]) this.removeNote(path);
  }

  /**
   * Searches the index and groups section hits by note.
   *
   * `limit` counts notes, not sections, because that is what the panel and the
   * "notes per answer" setting both mean.
   */
  search(query: string, limit = 8): SearchResult {
    const terms = tokenizeQuery(query);
    if (terms.length === 0) return { terms, notes: [] };

    return { terms, notes: this.rank(terms, limit, terms) };
  }

  /**
   * Searches with terms already expanded, so expansion stays out of the index.
   *
   * `ownTerms` are the terms from the user's own question. The relevance floor
   * is set from them alone: expanded terms are alternatives, and counting them
   * raised the bar for a one-word question from one match to two, so "what is a
   * leg" stopped finding the glossary.
   */
  searchTerms(terms: readonly string[], limit = 8, ownTerms: readonly string[] = terms): SearchResult {
    if (terms.length === 0) return { terms: [...terms], notes: [] };
    return { terms: [...terms], notes: this.rank(terms, limit, ownTerms) };
  }

  private rank(terms: readonly string[], limit: number, ownTerms: readonly string[]): NoteHit[] {
    // Over-fetch sections so a note whose hits are spread thin still groups well.
    const sectionHits = this.bm25.search(terms, Math.max(limit * 8, 50));
    // Group more notes than asked for, so the boost has neighbours to work with.
    const grouped = groupByNote(sectionHits, terms, limit * 2, ownTerms);
    if (!this.linkGraph) return grouped.slice(0, limit);

    return applyLinkBoost(grouped, this.linkGraph, {
      limit,
      snippetsFor: (notePath) => this.leadingSnippets(notePath),
    });
  }

  /**
   * Excerpts for a note pulled in by the link boost rather than by matching.
   * It never matched a term, so the leading sections stand in, and it can still
   * be quoted and verified like any other result.
   */
  private leadingSnippets(notePath: string): SectionHit[] {
    return this.bm25
      .sectionsOf(notePath)
      .slice(0, MAX_SNIPPETS_PER_NOTE)
      .filter((section) => section.body.trim().length > 0)
      .map((section) => ({ section, score: 0, matchedTerms: [] }));
  }
}

function groupByNote(
  sectionHits: readonly SectionHit[],
  terms: readonly string[],
  limit: number,
  ownTerms: readonly string[],
): NoteHit[] {
  const required = requiredTermMatches(ownTerms.length);
  const own = new Set(ownTerms);
  const byNote = new Map<string, SectionHit[]>();
  for (const hit of sectionHits) {
    const existing = byNote.get(hit.section.notePath);
    if (existing) existing.push(hit);
    else byNote.set(hit.section.notePath, [hit]);
  }

  const notes: NoteHit[] = [];

  for (const [notePath, hits] of byNote) {
    hits.sort((a, b) => b.score - a.score);
    const [best, ...rest] = hits;
    const score = best.score + ADDITIONAL_SECTION_WEIGHT * rest.reduce((sum, h) => sum + h.score, 0);

    const matched = new Set<string>();
    for (const hit of hits) for (const term of hit.matchedTerms) matched.add(term);
    if (matched.size < required) continue;

    // A note found only through one word the AI added, with none of the user's
    // own, is not trusted: expanding "salary bands" added "level", which pulled
    // in two unrelated notes where the honest reply was that nothing matched.
    // Two independent expanded words agreeing is still accepted, which is how
    // "paged" finds a note that says "we page" and names "alerts".
    const ownMatched = [...matched].filter((term) => own.has(term)).length;
    if (ownMatched === 0 && matched.size < 2) continue;

    notes.push({
      notePath,
      noteTitle: best.section.noteTitle,
      folder: best.section.folder,
      score,
      snippets: hits.slice(0, MAX_SNIPPETS_PER_NOTE),
      reasons: [{ kind: "terms", terms: terms.filter((term) => matched.has(term)) }],
    });
  }

  notes.sort((a, b) => b.score - a.score || a.notePath.localeCompare(b.notePath));
  return notes.slice(0, limit);
}
