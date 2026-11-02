import { describe, expect, it, vi } from "vitest";
import { expandQuestion, parseTerms } from "../../src/chat/expansion";
import type { ChatProvider } from "../../src/providers/types";

function provider(reply: string | Error): ChatProvider {
  return {
    label: "Groq",
    model: "test-model",
    async complete() {
      if (reply instanceof Error) throw reply;
      return { text: reply, usage: { sent: null, received: null } };
    },
    async testConnection() {},
  };
}

describe("parseTerms", () => {
  it("reads a plain JSON object", () => {
    expect(parseTerms('{"terms": ["authentication", "login", "jwt"]}')).toEqual([
      "authentication",
      "login",
      "jwt",
    ]);
  });

  it("reads JSON wrapped in a code fence", () => {
    expect(parseTerms('```json\n{"terms": ["caching", "memoize", "store"]}\n```')).toEqual([
      "caching",
      "memoize",
      "store",
    ]);
  });

  it("reads JSON surrounded by prose", () => {
    expect(parseTerms('Sure! {"terms": ["alpha", "bravo", "charlie"]} Hope that helps.')).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("splits a phrase the model returned instead of a word", () => {
    expect(parseTerms('{"terms": ["security rules", "firestore"]}')).toEqual([
      "security",
      "rule",
      "firestore",
    ]);
  });

  it("ignores non-string entries", () => {
    expect(parseTerms('{"terms": ["alpha", 7, null, "bravo"]}')).toEqual(["alpha", "bravo"]);
  });

  it("returns nothing for a reply that is not JSON", () => {
    expect(parseTerms("I think you should search for authentication.")).toEqual([]);
  });

  it("returns nothing when the JSON has no terms array", () => {
    expect(parseTerms('{"words": ["alpha"]}')).toEqual([]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseTerms("")).toEqual([]);
  });

  it("caps the number of terms", () => {
    const many = Array.from({ length: 20 }, (_unused, n) => `term${n}`);
    expect(parseTerms(JSON.stringify({ terms: many }).replace(/term/g, "word")).length).toBeLessThanOrEqual(8);
  });
});

describe("expandQuestion", () => {
  it("merges the model's terms with the question's own", async () => {
    const result = await expandQuestion("what about auth", provider('{"terms": ["authentication", "login", "jwt"]}'));

    expect(result.expanded).toBe(true);
    // The question's own term survives expansion.
    expect(result.terms).toContain("auth");
    expect(result.terms).toContain("authentication");
  });

  it("falls back to the question's own terms when the reply cannot be parsed", async () => {
    const result = await expandQuestion("what about auth", provider("not json at all"));
    expect(result).toEqual({ terms: ["auth"], expanded: false });
  });

  it("falls back when the provider fails, so search is never broken", async () => {
    const result = await expandQuestion("what about auth", provider(new Error("429")));
    expect(result).toEqual({ terms: ["auth"], expanded: false });
  });

  it("skips the call entirely when no provider is configured", async () => {
    const result = await expandQuestion("what about auth", null);
    expect(result).toEqual({ terms: ["auth"], expanded: false });
  });

  it("does not call the provider for a question with no searchable words", async () => {
    const complete = vi.fn();
    const result = await expandQuestion("the and of", { ...provider("{}"), complete });

    expect(result.terms).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("asks the provider for JSON", async () => {
    const complete = vi.fn<ChatProvider["complete"]>(async () => ({
      text: '{"terms": ["alpha", "bravo", "charlie"]}',
      usage: { sent: null, received: null },
    }));
    await expandQuestion("question", { ...provider("{}"), complete });

    expect(complete.mock.calls[0][0].json).toBe(true);
  });
});
