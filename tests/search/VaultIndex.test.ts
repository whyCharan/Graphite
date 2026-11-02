import { beforeEach, describe, expect, it } from "vitest";
import { VaultIndex } from "../../src/search/VaultIndex";
import type { NoteInput } from "../../src/search/sections";

function note(path: string, content: string): NoteInput {
  const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, title, content };
}

describe("VaultIndex search", () => {
  let index: VaultIndex;

  beforeEach(() => {
    index = new VaultIndex();
    index.indexNote(note("Decisions/Groq.md", "# Why Groq\nwe chose Groq for latency"));
    index.indexNote(note("Meeting.md", "a long note that mentions latency in passing"));
  });

  it("returns notes ranked, not raw sections", () => {
    const result = index.search("groq latency");
    expect(result.notes[0].notePath).toBe("Decisions/Groq.md");
    expect(result.notes[0].snippets.length).toBeGreaterThan(0);
  });

  it("reports the terms it searched, so a no-match state can list them", () => {
    expect(index.search("what did I decide about Groq").terms).toEqual(["decide", "about", "groq"]);
  });

  it("returns no notes and no terms for a query of only stop words", () => {
    const result = index.search("the and of");
    expect(result.terms).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("records the matched terms as the reason a note was found", () => {
    const [first] = index.search("groq").notes;
    expect(first.reasons).toEqual([{ kind: "terms", terms: ["groq"] }]);
  });

  it("limits results to the requested number of notes", () => {
    for (let n = 0; n < 12; n += 1) index.indexNote(note(`N${n}.md`, "latency everywhere"));
    expect(index.search("latency", 8).notes).toHaveLength(8);
  });

  it("keeps at most three excerpts per note, bounding what a provider is sent", () => {
    index.indexNote(
      note("Many.md", "# A\nlatency\n\n# B\nlatency\n\n# C\nlatency\n\n# D\nlatency\n\n# E\nlatency"),
    );
    const hit = index.search("latency").notes.find((n) => n.notePath === "Many.md");
    expect(hit?.snippets.length).toBeLessThanOrEqual(3);
  });

  it("ranks a note matching in several sections above one matching in a single weak section", () => {
    index.clear();
    index.indexNote(note("Spread.md", "# One\ncaching matters\n\n# Two\ncaching again"));
    index.indexNote(note("Passing.md", `caching ${"filler ".repeat(200)}`));
    expect(index.search("caching").notes[0].notePath).toBe("Spread.md");
  });
});

describe("VaultIndex lifecycle", () => {
  let index: VaultIndex;

  beforeEach(() => {
    index = new VaultIndex();
    index.indexNote(note("A.md", "original latency note"));
  });

  it("reflects an edit on the next search", () => {
    index.indexNote(note("A.md", "rewritten caching note"));
    expect(index.search("latency").notes).toEqual([]);
    expect(index.search("caching").notes).toHaveLength(1);
  });

  it("drops a deleted note", () => {
    index.removeNote("A.md");
    expect(index.search("latency").notes).toEqual([]);
    expect(index.noteCount).toBe(0);
  });

  it("moves a renamed note to its new path and folder", () => {
    index.renameNote("A.md", note("Archive/B.md", "original latency note"));
    const [hit] = index.search("latency").notes;
    expect(hit.notePath).toBe("Archive/B.md");
    expect(hit.folder).toBe("Archive");
  });

  it("reports progress while building", () => {
    const fresh = new VaultIndex();
    fresh.beginBuild(2);
    expect(fresh.progress).toEqual({ done: 0, total: 2, building: true });
    fresh.indexNote(note("A.md", "x"));
    expect(fresh.progress.done).toBe(1);
    fresh.endBuild();
    expect(fresh.progress.building).toBe(false);
  });
});

describe("VaultIndex exclusions", () => {
  it("never indexes a note in an excluded folder", () => {
    const index = new VaultIndex();
    index.setExcludedFolders(["Private"]);
    expect(index.indexNote(note("Private/secret.md", "latency"))).toBe(false);
    expect(index.search("latency").notes).toEqual([]);
  });

  it("drops already-indexed notes when a folder becomes excluded", () => {
    const index = new VaultIndex();
    index.indexNote(note("Private/secret.md", "latency"));
    expect(index.search("latency").notes).toHaveLength(1);

    index.setExcludedFolders(["Private"]);
    expect(index.search("latency").notes).toEqual([]);
  });

  it("reports whether the exclusion list changed, so a re-index can be skipped", () => {
    const index = new VaultIndex();
    expect(index.setExcludedFolders(["Private"])).toBe(true);
    expect(index.setExcludedFolders(["Private"])).toBe(false);
  });

  it("removes a note that is edited into an excluded folder", () => {
    const index = new VaultIndex();
    index.indexNote(note("Notes/a.md", "latency"));
    index.setExcludedFolders(["Notes"]);
    index.indexNote(note("Notes/a.md", "latency again"));
    expect(index.search("latency").notes).toEqual([]);
  });
});
