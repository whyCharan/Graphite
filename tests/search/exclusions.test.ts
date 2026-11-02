import { describe, expect, it } from "vitest";
import { isExcluded, parseExcludedFolders } from "../../src/search/exclusions";

describe("parseExcludedFolders", () => {
  it("accepts one folder per line", () => {
    expect(parseExcludedFolders("Private\nJournal")).toEqual(["Private", "Journal"]);
  });

  it("accepts a comma separated list", () => {
    expect(parseExcludedFolders("Private, Journal")).toEqual(["Private", "Journal"]);
  });

  it("strips surrounding slashes and blank entries", () => {
    expect(parseExcludedFolders("/Private/\n\n  \nJournal")).toEqual(["Private", "Journal"]);
  });

  it("normalises backslashes, which users paste from Windows paths", () => {
    expect(parseExcludedFolders("Private\\Daily")).toEqual(["Private/Daily"]);
  });

  it("removes duplicates", () => {
    expect(parseExcludedFolders("Private\n/Private")).toEqual(["Private"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseExcludedFolders("")).toEqual([]);
  });
});

describe("isExcluded", () => {
  it("excludes a note directly inside an excluded folder", () => {
    expect(isExcluded("Private/secret.md", ["Private"])).toBe(true);
  });

  it("excludes a note in a nested descendant", () => {
    expect(isExcluded("Private/2026/March/secret.md", ["Private"])).toBe(true);
  });

  it("keeps a note whose folder merely starts with the same letters", () => {
    expect(isExcluded("Privateer/notes.md", ["Private"])).toBe(false);
  });

  it("keeps notes when nothing is excluded", () => {
    expect(isExcluded("Private/secret.md", [])).toBe(false);
  });

  it("matches regardless of letter case", () => {
    expect(isExcluded("Private/secret.md", ["private"])).toBe(true);
  });

  it("keeps a root note when a folder is excluded", () => {
    expect(isExcluded("Inbox.md", ["Private"])).toBe(false);
  });
});
