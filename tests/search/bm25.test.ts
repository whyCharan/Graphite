import { beforeEach, describe, expect, it } from "vitest";
import { Bm25Index } from "../../src/search/bm25";
import { splitIntoSections } from "../../src/search/sections";
import { tokenizeQuery } from "../../src/search/tokenize";
import type { Section } from "../../src/search/types";

function sectionsFor(path: string, title: string, content: string): Section[] {
  return splitIntoSections({ path, title, content });
}

describe("Bm25Index ranking", () => {
  let index: Bm25Index;

  beforeEach(() => {
    index = new Bm25Index();
    index.addAll(sectionsFor("Firestore.md", "Firestore", "a note about storage rules"));
    index.addAll(
      sectionsFor(
        "Meeting.md",
        "Meeting",
        "we talked at length about many topics and mentioned firestore once among them",
      ),
    );
  });

  it("ranks a title match above a body-only match", () => {
    const hits = index.search(tokenizeQuery("firestore"));
    expect(hits[0].section.notePath).toBe("Firestore.md");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("reports which query terms matched, in query order", () => {
    const hits = index.search(tokenizeQuery("storage firestore"));
    expect(hits[0].matchedTerms).toEqual(["storage", "firestore"]);
  });

  it("returns nothing for a term no note contains", () => {
    expect(index.search(tokenizeQuery("kubernetes"))).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(index.search([])).toEqual([]);
  });
});

describe("Bm25Index mutation", () => {
  it("stops returning a note once it is removed", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("Groq.md", "Groq", "we chose Groq for latency"));
    expect(index.search(tokenizeQuery("latency"))).toHaveLength(1);

    index.removeNote("Groq.md");
    expect(index.search(tokenizeQuery("latency"))).toEqual([]);
    expect(index.size).toBe(0);
  });

  it("reflects edited content and drops the old terms", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("Note.md", "Note", "original wording about latency"));

    index.updateNote("Note.md", sectionsFor("Note.md", "Note", "rewritten wording about caching"));

    expect(index.search(tokenizeQuery("latency"))).toEqual([]);
    expect(index.search(tokenizeQuery("caching"))).toHaveLength(1);
  });

  it("removes stale sections when an edit shortens a note", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("Note.md", "Note", "# One\nalpha\n\n# Two\nbravo"));
    expect(index.size).toBe(2);

    index.updateNote("Note.md", sectionsFor("Note.md", "Note", "# One\nalpha"));
    expect(index.size).toBe(1);
    expect(index.search(tokenizeQuery("bravo"))).toEqual([]);
  });

  it("keeps a term searchable when only one of its fields is rewritten", () => {
    const index = new Bm25Index();
    // "firestore" sits in both the title and the body here.
    index.addAll(sectionsFor("Firestore.md", "Firestore", "firestore rules"));
    index.updateNote("Firestore.md", sectionsFor("Firestore.md", "Firestore", "rules only"));
    expect(index.search(tokenizeQuery("firestore"))).toHaveLength(1);
  });

  it("re-adding the same section id replaces rather than duplicates it", () => {
    const index = new Bm25Index();
    const [section] = sectionsFor("Note.md", "Note", "alpha");
    index.add(section);
    index.add(section);
    expect(index.size).toBe(1);
  });

  it("searches an empty index without failing", () => {
    expect(new Bm25Index().search(tokenizeQuery("anything"))).toEqual([]);
  });
});

describe("Bm25Index fields", () => {
  it("finds a note by its alias", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("ADR-1.md", "ADR-1", "---\naliases: [Groq Decision]\n---\nbody"));
    expect(index.search(tokenizeQuery("groq decision"))).toHaveLength(1);
  });

  it("finds a note by its tag", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("Note.md", "Note", "---\ntags: [architecture]\n---\nbody"));
    expect(index.search(tokenizeQuery("architecture"))).toHaveLength(1);
  });

  it("finds a note by a word in its folder path", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("Decisions/Note.md", "Note", "body"));
    expect(index.search(tokenizeQuery("decisions"))).toHaveLength(1);
  });

  it("ranks a heading match above a body match for the same term", () => {
    const index = new Bm25Index();
    index.addAll(sectionsFor("A.md", "A", "# Caching\nnotes here"));
    index.addAll(sectionsFor("B.md", "B", "# Other\nthis mentions caching inside the body text"));
    const hits = index.search(tokenizeQuery("caching"));
    expect(hits[0].section.notePath).toBe("A.md");
  });
});
