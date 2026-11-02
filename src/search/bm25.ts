import { tokenize } from "./tokenize";
import type { Field, Section, SectionHit } from "./types";

/**
 * Field weights. Title outranks body because a note named after a topic is
 * almost always a better answer than one that mentions it in passing, which is
 * the single strongest signal in a personal vault.
 */
export const DEFAULT_WEIGHTS: Readonly<Record<Field, number>> = {
  title: 3.5,
  aliases: 2.5,
  tags: 2,
  heading: 1.6,
  body: 1,
  folder: 0.6,
};

const FIELDS: readonly Field[] = ["title", "aliases", "tags", "heading", "body", "folder"];

/** Term-frequency saturation. Standard BM25 value. */
const K1 = 1.2;
/** Length normalisation. Standard BM25 value. */
const B = 0.75;

interface IndexedSection {
  section: Section;
  /** term -> frequency, per field. */
  fields: Map<Field, Map<string, number>>;
  lengths: Record<Field, number>;
}

function countTerms(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of tokenize(text)) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

function fieldText(section: Section, field: Field): string {
  switch (field) {
    case "title":
      return section.noteTitle;
    case "aliases":
      return section.aliases.join(" ");
    case "tags":
      return section.tags.join(" ");
    case "heading":
      return section.heading;
    case "folder":
      return section.folder.replace(/[/\\]/g, " ");
    case "body":
      return section.body;
  }
}

/**
 * A BM25F index over note sections, held in memory and rebuilt on load.
 *
 * Fielded rather than flat: a single bag of words would let a long body drown
 * out a title match, which is the ranking the vault most depends on.
 */
export class Bm25Index {
  private readonly docs = new Map<string, IndexedSection>();
  /** term -> section ids containing it, for document frequency and candidates. */
  private readonly postings = new Map<string, Set<string>>();
  private readonly totalLengths: Record<Field, number> = {
    title: 0, aliases: 0, tags: 0, heading: 0, body: 0, folder: 0,
  };

  constructor(private readonly weights: Readonly<Record<Field, number>> = DEFAULT_WEIGHTS) {}

  get size(): number {
    return this.docs.size;
  }

  add(section: Section): void {
    this.remove(section.id);

    const fields = new Map<Field, Map<string, number>>();
    const lengths = { title: 0, aliases: 0, tags: 0, heading: 0, body: 0, folder: 0 };

    for (const field of FIELDS) {
      const counts = countTerms(fieldText(section, field));
      fields.set(field, counts);
      let length = 0;
      for (const [term, count] of counts) {
        length += count;
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Set();
          this.postings.set(term, posting);
        }
        posting.add(section.id);
      }
      lengths[field] = length;
      this.totalLengths[field] += length;
    }

    this.docs.set(section.id, { section, fields, lengths });
  }

  addAll(sections: readonly Section[]): void {
    for (const section of sections) this.add(section);
  }

  remove(sectionId: string): void {
    const doc = this.docs.get(sectionId);
    if (!doc) return;

    for (const field of FIELDS) {
      this.totalLengths[field] -= doc.lengths[field];
      for (const term of doc.fields.get(field)?.keys() ?? []) {
        const posting = this.postings.get(term);
        if (!posting) continue;
        // Only drop the posting once no field of this section still holds the term.
        if (!this.sectionStillHas(doc, term, field)) posting.delete(sectionId);
        if (posting.size === 0) this.postings.delete(term);
      }
    }
    this.docs.delete(sectionId);
  }

  /** True when a field other than `excluding` also carries `term`. */
  private sectionStillHas(doc: IndexedSection, term: string, excluding: Field): boolean {
    for (const field of FIELDS) {
      if (field === excluding) continue;
      if (doc.fields.get(field)?.has(term)) return true;
    }
    return false;
  }

  /** A note's indexed sections, in document order. Used to excerpt linked notes. */
  sectionsOf(notePath: string): Section[] {
    const sections: Section[] = [];
    for (const doc of this.docs.values()) {
      if (doc.section.notePath === notePath) sections.push(doc.section);
    }
    return sections;
  }

  /** Drops every section of a note. Used on delete and before a re-index. */
  removeNote(notePath: string): void {
    for (const [id, doc] of [...this.docs]) {
      if (doc.section.notePath === notePath) this.remove(id);
    }
  }

  /** Replaces a note's sections wholesale, so stale sections cannot survive an edit. */
  updateNote(notePath: string, sections: readonly Section[]): void {
    this.removeNote(notePath);
    this.addAll(sections);
  }

  private averageLength(field: Field): number {
    if (this.docs.size === 0) return 0;
    return this.totalLengths[field] / this.docs.size;
  }

  private idf(term: string): number {
    const df = this.postings.get(term)?.size ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (this.docs.size - df + 0.5) / (df + 0.5));
  }

  search(terms: readonly string[], limit = 50): SectionHit[] {
    if (terms.length === 0 || this.docs.size === 0) return [];

    const averages: Record<Field, number> = {
      title: this.averageLength("title"),
      aliases: this.averageLength("aliases"),
      tags: this.averageLength("tags"),
      heading: this.averageLength("heading"),
      body: this.averageLength("body"),
      folder: this.averageLength("folder"),
    };

    const scores = new Map<string, number>();
    const matched = new Map<string, Set<string>>();

    for (const term of terms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idf = this.idf(term);

      for (const id of posting) {
        const doc = this.docs.get(id);
        if (!doc) continue;

        let weightedTf = 0;
        for (const field of FIELDS) {
          const tf = doc.fields.get(field)?.get(term) ?? 0;
          if (tf === 0) continue;
          const average = averages[field];
          const normalised = average > 0 ? 1 - B + (B * doc.lengths[field]) / average : 1;
          weightedTf += (this.weights[field] * tf) / normalised;
        }
        if (weightedTf === 0) continue;

        scores.set(id, (scores.get(id) ?? 0) + (idf * weightedTf) / (K1 + weightedTf));
        let seen = matched.get(id);
        if (!seen) {
          seen = new Set();
          matched.set(id, seen);
        }
        seen.add(term);
      }
    }

    const hits: SectionHit[] = [];
    for (const [id, score] of scores) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      const seen = matched.get(id) ?? new Set<string>();
      hits.push({
        section: doc.section,
        score,
        // Query order, not match order, so reasons read back the way they were typed.
        matchedTerms: terms.filter((term) => seen.has(term)),
      });
    }

    hits.sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id));
    return hits.slice(0, limit);
  }
}
