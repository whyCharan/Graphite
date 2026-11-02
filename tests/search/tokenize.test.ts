import { describe, expect, it } from "vitest";
import { tokenize, tokenizeQuery } from "../../src/search/tokenize";

describe("tokenize", () => {
  it("lowercases and splits on punctuation", () => {
    expect(tokenize("Firestore Rules, Reviewed!")).toEqual(["firestore", "rule", "reviewed"]);
  });

  it("drops stop words that carry no retrieval signal", () => {
    expect(tokenize("what did I decide about the schema")).toEqual(["decide", "schema"]);
  });

  it("splits slug titles, so a word inside a hyphenated note name is findable", () => {
    expect(tokenize("code-generation-reasoning-specialized-llms")).toContain("reasoning");
  });

  it("folds regular plurals to one term", () => {
    expect(tokenize("rules")).toEqual(tokenize("rule"));
    expect(tokenize("queries")).toEqual(tokenize("query"));
    expect(tokenize("indexes")).toEqual(tokenize("index"));
  });

  it("keeps stems whose trailing s is not a plural", () => {
    expect(tokenize("css")).toEqual(["css"]);
    expect(tokenize("class")).toEqual(["class"]);
  });

  it("strips diacritics so accented and unaccented spellings match", () => {
    expect(tokenize("café")).toEqual(tokenize("cafe"));
  });

  it("keeps non-Latin scripts, which have no accents to strip", () => {
    expect(tokenize("日本語 のノート")).toEqual(["日本語", "のノート"]);
  });

  it("ignores single characters and empty input", () => {
    expect(tokenize("a x 1")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("tokenizeQuery", () => {
  it("removes duplicates but keeps the order the user typed", () => {
    expect(tokenizeQuery("firestore rules firestore schema")).toEqual([
      "firestore",
      "rule",
      "schema",
    ]);
  });
});
