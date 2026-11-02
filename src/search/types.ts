/** The fields a section is indexed under. Each carries its own BM25 weight. */
export type Field = "title" | "aliases" | "tags" | "heading" | "folder" | "body";

/** One indexable unit: a note section, split at its headings. */
export interface Section {
  /** Stable id, `<notePath>#<ordinal>`. */
  id: string;
  notePath: string;
  noteTitle: string;
  /** Folder path without the file name. Empty string at the vault root. */
  folder: string;
  /** Heading this section sits under, or empty for the text before the first heading. */
  heading: string;
  aliases: string[];
  tags: string[];
  /** Section body, excluding the heading line and frontmatter. */
  body: string;
}

/** A section that matched, with the terms that put it there. */
export interface SectionHit {
  section: Section;
  score: number;
  /** Query terms found in this section, in query order. */
  matchedTerms: string[];
}

/** Why a note is in the results. Shown to the user as text, never as colour alone. */
export type MatchReason =
  | { kind: "terms"; terms: string[] }
  | { kind: "linked"; fromTitle: string; fromPath: string };

/** A note that matched, grouped from its section hits. */
export interface NoteHit {
  notePath: string;
  noteTitle: string;
  folder: string;
  score: number;
  /** Best-scoring sections first. These are the excerpts a provider may be sent. */
  snippets: SectionHit[];
  reasons: MatchReason[];
}
