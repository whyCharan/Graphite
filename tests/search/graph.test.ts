import { describe, expect, it } from "vitest";
import { applyLinkBoost, type LinkGraph } from "../../src/search/graph";
import type { NoteHit, Section, SectionHit } from "../../src/search/types";

function section(notePath: string, body = "body text"): Section {
  return {
    id: `${notePath}#0`,
    notePath,
    noteTitle: notePath.replace(/\.md$/, ""),
    folder: "",
    heading: "",
    aliases: [],
    tags: [],
    body,
  };
}

function hit(notePath: string, score: number): NoteHit {
  return {
    notePath,
    noteTitle: notePath.replace(/\.md$/, ""),
    folder: "",
    score,
    snippets: [{ section: section(notePath), score, matchedTerms: ["term"] }],
    reasons: [{ kind: "terms", terms: ["term"] }],
  };
}

function graphOf(edges: Record<string, string[]>, missing: string[] = []): LinkGraph {
  return {
    neighbors: (notePath) => edges[notePath] ?? [],
    titleOf: (notePath) =>
      missing.includes(notePath) ? null : notePath.replace(/\.md$/, ""),
  };
}

function snippetsFor(notePath: string): SectionHit[] {
  return [{ section: section(notePath), score: 0, matchedTerms: [] }];
}

describe("applyLinkBoost", () => {
  it("pulls in a note linked from a strong match, labelled with its source", () => {
    const result = applyLinkBoost([hit("Groq.md", 10)], graphOf({ "Groq.md": ["Latency.md"] }), {
      limit: 8,
      snippetsFor,
    });

    const linked = result.find((note) => note.notePath === "Latency.md");
    expect(linked?.reasons).toEqual([
      { kind: "linked", fromTitle: "Groq", fromPath: "Groq.md" },
    ]);
  });

  it("gives a hub the largest single share, not the sum of every link to it", () => {
    const hits = [hit("A.md", 10), hit("B.md", 8), hit("C.md", 6)];
    const graph = graphOf({ "A.md": ["Hub.md"], "B.md": ["Hub.md"], "C.md": ["Hub.md"] });

    const result = applyLinkBoost(hits, graph, { limit: 8, snippetsFor, share: 0.25 });
    const hub = result.find((note) => note.notePath === "Hub.md");

    // One share of the best match (10 * 0.25), not 10+8+6 shares.
    expect(hub?.score).toBeCloseTo(2.5);
    expect(hub?.score).toBeLessThan(hits[2].score);
  });

  it("never lifts a linked note above the note that actually matched", () => {
    const result = applyLinkBoost([hit("Groq.md", 10)], graphOf({ "Groq.md": ["Latency.md"] }), {
      limit: 8,
      snippetsFor,
    });
    expect(result[0].notePath).toBe("Groq.md");
  });

  it("adds the inherited share to a note that already matched", () => {
    const hits = [hit("A.md", 10), hit("B.md", 4)];
    const result = applyLinkBoost(hits, graphOf({ "A.md": ["B.md"] }), {
      limit: 8,
      snippetsFor,
      share: 0.25,
    });
    const boosted = result.find((note) => note.notePath === "B.md");
    expect(boosted?.score).toBeCloseTo(6.5);
    // It matched on its own terms, so its reason stays the terms, not the link.
    expect(boosted?.reasons[0].kind).toBe("terms");
  });

  it("ignores a link pointing at a note that does not exist", () => {
    const result = applyLinkBoost(
      [hit("Groq.md", 10)],
      graphOf({ "Groq.md": ["Ghost.md"] }, ["Ghost.md"]),
      { limit: 8, snippetsFor },
    );
    expect(result.map((note) => note.notePath)).toEqual(["Groq.md"]);
  });

  it("skips a linked note that has no excerpt to quote", () => {
    const result = applyLinkBoost([hit("Groq.md", 10)], graphOf({ "Groq.md": ["Empty.md"] }), {
      limit: 8,
      snippetsFor: () => [],
    });
    expect(result.map((note) => note.notePath)).toEqual(["Groq.md"]);
  });

  it("ignores a note linking to itself", () => {
    const result = applyLinkBoost([hit("Groq.md", 10)], graphOf({ "Groq.md": ["Groq.md"] }), {
      limit: 8,
      snippetsFor,
    });
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(10);
  });

  it("respects the result limit after boosting", () => {
    const result = applyLinkBoost(
      [hit("A.md", 10)],
      graphOf({ "A.md": ["B.md", "C.md", "D.md"] }),
      { limit: 2, snippetsFor },
    );
    expect(result).toHaveLength(2);
  });

  it("returns the hits unchanged when nothing is linked", () => {
    const result = applyLinkBoost([hit("A.md", 10)], graphOf({}), { limit: 8, snippetsFor });
    expect(result).toEqual([hit("A.md", 10)]);
  });
});
