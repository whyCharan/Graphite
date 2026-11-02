import type { NoteHit, SectionHit } from "./types";

/**
 * The vault's link graph, as the booster needs it. Obsidian's metadata cache
 * supplies this through an adapter, so the boost stays testable.
 */
export interface LinkGraph {
  /** Notes linked from, or linking to, this note. */
  neighbors(notePath: string): readonly string[];
  /** Display title for a note path, or null when the note does not exist. */
  titleOf(notePath: string): string | null;
}

export interface LinkBoostOptions {
  /** Excerpts for a neighbour pulled into the results, so it can still be cited. */
  snippetsFor: (notePath: string) => SectionHit[];
  /** Notes to return after boosting. */
  limit: number;
  /** Fraction of a match's score a neighbour inherits. */
  share?: number;
}

/**
 * Share of a linked note's score that a neighbour inherits. Small on purpose:
 * being linked from a good match is weak evidence next to matching the query.
 */
const DEFAULT_SHARE = 0.25;

/**
 * Boosts notes connected to strong matches through Obsidian's links.
 *
 * A neighbour inherits a share of its single best-scoring linked match, never
 * the sum. Summing would let a hub note that everything links to outrank the
 * notes that actually matched the question.
 */
export function applyLinkBoost(
  hits: readonly NoteHit[],
  graph: LinkGraph,
  options: LinkBoostOptions,
): NoteHit[] {
  const share = options.share ?? DEFAULT_SHARE;
  const matched = new Map(hits.map((hit) => [hit.notePath, hit]));

  /** notePath -> the best linked match found so far. */
  const best = new Map<string, { boost: number; fromPath: string; fromTitle: string }>();

  for (const hit of hits) {
    const boost = hit.score * share;
    for (const neighbor of graph.neighbors(hit.notePath)) {
      if (neighbor === hit.notePath) continue;
      const current = best.get(neighbor);
      // max, not sum: a hub linked from every match gets one share only.
      if (!current || boost > current.boost) {
        best.set(neighbor, { boost, fromPath: hit.notePath, fromTitle: hit.noteTitle });
      }
    }
  }

  const boosted: NoteHit[] = [];

  for (const hit of hits) {
    const inherited = best.get(hit.notePath);
    boosted.push(inherited ? { ...hit, score: hit.score + inherited.boost } : hit);
  }

  for (const [notePath, inherited] of best) {
    if (matched.has(notePath)) continue;
    const title = graph.titleOf(notePath);
    // An unresolved link points at a note that does not exist; it is not a result.
    if (title === null) continue;
    const snippets = options.snippetsFor(notePath);
    if (snippets.length === 0) continue;

    boosted.push({
      notePath,
      noteTitle: title,
      folder: snippets[0].section.folder,
      score: inherited.boost,
      snippets,
      reasons: [{ kind: "linked", fromTitle: inherited.fromTitle, fromPath: inherited.fromPath }],
    });
  }

  boosted.sort((a, b) => b.score - a.score || a.notePath.localeCompare(b.notePath));
  return boosted.slice(0, options.limit);
}
