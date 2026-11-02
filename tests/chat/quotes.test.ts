import { describe, expect, it } from "vitest";
import { removedClaimsMessage, verifyAnswer } from "../../src/chat/quotes";
import type { NoteHit, Section } from "../../src/search/types";

function hit(notePath: string, body: string): NoteHit {
  const section: Section = {
    id: `${notePath}#0`,
    notePath,
    noteTitle: notePath.replace(/\.md$/, ""),
    folder: "",
    heading: "",
    aliases: [],
    tags: [],
    body,
  };
  return {
    notePath,
    noteTitle: section.noteTitle,
    folder: "",
    score: 1,
    snippets: [{ section, score: 1, matchedTerms: [] }],
    reasons: [{ kind: "terms", terms: [] }],
  };
}

const hits = [
  hit("Groq.md", "We chose Groq for latency on the free tier."),
  hit("Firestore.md", "Security rules were reviewed before the deploy."),
];

describe("verifyAnswer: citations that should pass", () => {
  it("keeps a claim whose quote appears in the cited note", () => {
    const result = verifyAnswer('We picked Groq. [1: "we chose Groq for latency"]', hits);
    expect(result.claims).toHaveLength(1);
    expect(result.removedCount).toBe(0);
    expect(result.anyVerified).toBe(true);
  });

  it("accepts a quote differing only in letter case", () => {
    const result = verifyAnswer('Yes. [1: "WE CHOSE GROQ FOR LATENCY"]', hits);
    expect(result.claims).toHaveLength(1);
  });

  it("accepts a quote differing only in whitespace", () => {
    const result = verifyAnswer('Yes. [1: "we   chose\nGroq for latency"]', hits);
    expect(result.claims).toHaveLength(1);
  });

  it("accepts a quote the model wrapped in Markdown emphasis", () => {
    const result = verifyAnswer('Yes. [1: "we **chose** Groq for *latency*"]', hits);
    expect(result.claims).toHaveLength(1);
  });

  it("accepts curly quotes around the quoted text", () => {
    const result = verifyAnswer("Yes. [1: “we chose Groq for latency”]", hits);
    expect(result.claims).toHaveLength(1);
  });

  it("keeps a claim when one of several citations verifies", () => {
    const result = verifyAnswer(
      'Both things. [1: "we chose Groq for latency"] [2: "never written anywhere"]',
      hits,
    );
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].citations.map((c) => c.verified)).toEqual([true, false]);
  });

  it("leaves no stray space when the model puts the full stop after the citation", () => {
    const result = verifyAnswer('We picked Groq [1: "we chose Groq for latency"]. Next.', hits);
    expect(result.claims[0].text).toBe("We picked Groq.");
  });

  it("strips the citation markup from the claim text it shows", () => {
    const result = verifyAnswer('We picked Groq. [1: "we chose Groq for latency"]', hits);
    expect(result.claims[0].text).toBe("We picked Groq.");
  });
});

describe("verifyAnswer: citations that must fail", () => {
  it("rejects a citation numbering a note that was not retrieved", () => {
    const result = verifyAnswer('Claim. [9: "we chose Groq for latency"]', hits);
    expect(result.claims).toEqual([]);
    expect(result.removedCount).toBe(1);
  });

  it("rejects a quote with a changed word", () => {
    const result = verifyAnswer('Claim. [1: "we chose Groq for throughput"]', hits);
    expect(result.claims).toEqual([]);
  });

  it("rejects a quote taken from a different note than the one cited", () => {
    const result = verifyAnswer('Claim. [1: "security rules were reviewed"]', hits);
    expect(result.claims).toEqual([]);
  });

  it("rejects an empty quote, which would otherwise match everything", () => {
    const result = verifyAnswer('Claim. [1: ""]', hits);
    expect(result.claims).toEqual([]);
  });

  it("removes a claim carrying no citation at all", () => {
    const result = verifyAnswer("Graphite is wonderful and fast.", hits);
    expect(result.claims).toEqual([]);
    expect(result.removedCount).toBe(1);
  });

  it("reports that nothing verified when every claim fails", () => {
    const result = verifyAnswer('A. [9: "x"] B. [9: "y"]', hits);
    expect(result.anyVerified).toBe(false);
    expect(result.answer).toBe("");
    expect(result.removedCount).toBe(2);
  });
});

describe("verifyAnswer: mixed answers", () => {
  it("keeps the verified claim, drops the rest, and counts them", () => {
    const answer = [
      'Groq was chosen for latency. [1: "we chose Groq for latency"]',
      'The team also adopted GraphQL. [1: "we adopted GraphQL"]',
      "And everything is fine.",
    ].join(" ");
    const result = verifyAnswer(answer, hits);
    expect(result.claims).toHaveLength(1);
    expect(result.removedCount).toBe(2);
    expect(result.answer).toBe("Groq was chosen for latency.");
  });

  it("does not split a claim on a full stop inside its quote", () => {
    const result = verifyAnswer('Decided. [1: "Groq for latency on the free tier."]', hits);
    expect(result.claims).toHaveLength(1);
  });

  it("lists each cited note once, in order of first appearance", () => {
    const answer = [
      'One. [2: "security rules were reviewed"]',
      'Two. [1: "we chose Groq for latency"]',
      'Three. [2: "before the deploy"]',
    ].join(" ");
    const result = verifyAnswer(answer, hits);
    expect(result.citedNotes.map((note) => note.notePath)).toEqual(["Firestore.md", "Groq.md"]);
  });
});

describe("verifyAnswer: wikilinks", () => {
  it("unwraps a wikilink whose target does not exist", () => {
    const result = verifyAnswer(
      'See [[Missing Note]]. [1: "we chose Groq for latency"]',
      hits,
      () => false,
    );
    expect(result.claims[0].text).toBe("See Missing Note.");
  });

  it("keeps a wikilink whose target resolves", () => {
    const result = verifyAnswer(
      'See [[Groq]]. [1: "we chose Groq for latency"]',
      hits,
      (target) => target === "Groq",
    );
    expect(result.claims[0].text).toBe("See [[Groq]].");
  });
});

describe("removedClaimsMessage", () => {
  it("says nothing when no claims were removed", () => {
    expect(removedClaimsMessage(0)).toBeNull();
  });

  it("uses the singular for one removed claim", () => {
    expect(removedClaimsMessage(1)).toBe("1 claim removed: its quote wasn't found in the note.");
  });

  it("uses the plural for several", () => {
    expect(removedClaimsMessage(3)).toContain("3 claims removed");
  });
});
