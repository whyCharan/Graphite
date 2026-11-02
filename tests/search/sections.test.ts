import { describe, expect, it } from "vitest";
import { folderOf, splitIntoSections } from "../../src/search/sections";

function note(content: string, path = "Notes/Decisions.md") {
  return splitIntoSections({ path, title: "Decisions", content });
}

describe("splitIntoSections", () => {
  it("splits at headings and keeps each heading with its body", () => {
    const sections = note("intro text\n\n# Groq\nwe chose Groq\n\n# Firestore\nrules live here");
    expect(sections.map((section) => section.heading)).toEqual(["", "Groq", "Firestore"]);
    expect(sections[1].body).toBe("we chose Groq");
  });

  it("never starts a new section at a # inside a fenced code block", () => {
    const sections = note("# Shell\n\n```bash\n# this is a comment\necho hi\n```\n\nafter");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Shell");
    expect(sections[0].body).toContain("# this is a comment");
  });

  it("handles tilde fences as well as backtick fences", () => {
    const sections = note("# A\n\n~~~\n# not a heading\n~~~\n");
    expect(sections).toHaveLength(1);
  });

  it("reads aliases and tags from frontmatter and keeps them out of the body", () => {
    const sections = note(
      "---\naliases: [ADR, Decision Record]\ntags:\n  - architecture\n  - firestore\n---\nbody text",
    );
    expect(sections[0].aliases).toEqual(["ADR", "Decision Record"]);
    expect(sections[0].tags).toEqual(["architecture", "firestore"]);
    expect(sections[0].body).toBe("body text");
  });

  it("prefers a frontmatter title over the file name", () => {
    const sections = note("---\ntitle: Groq Decision\n---\nbody");
    expect(sections[0].noteTitle).toBe("Groq Decision");
  });

  it("collects inline tags alongside frontmatter tags", () => {
    const sections = note("---\ntags: [one]\n---\ntext with #two and #three/nested");
    expect(sections[0].tags).toEqual(["one", "two", "three/nested"]);
  });

  it("ignores a bare hash and numeric fragments when collecting inline tags", () => {
    const sections = note("a # alone and #123 are not tags");
    expect(sections[0].tags).toEqual([]);
  });

  it("splits an over-long section so one note cannot dominate a prompt", () => {
    const paragraph = `${"word ".repeat(120)}\n\n`;
    const sections = note(`# Long\n\n${paragraph.repeat(6)}`);
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) expect(section.body.length).toBeLessThanOrEqual(1500);
  });

  it("still indexes an empty note, so its title stays searchable", () => {
    const sections = note("");
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toBe("");
    expect(sections[0].noteTitle).toBe("Decisions");
  });

  it("records the folder and gives each section a stable id", () => {
    const sections = note("# A\nx\n\n# B\ny", "05_Learning/Notes/Prep/deep.md");
    expect(sections[0].folder).toBe("05_Learning/Notes/Prep");
    expect(sections.map((section) => section.id)).toEqual([
      "05_Learning/Notes/Prep/deep.md#0",
      "05_Learning/Notes/Prep/deep.md#1",
    ]);
  });
});

describe("folderOf", () => {
  it("returns an empty string for a note at the vault root", () => {
    expect(folderOf("Inbox.md")).toBe("");
  });

  it("returns the folder path for a nested note", () => {
    expect(folderOf("a/b/c.md")).toBe("a/b");
  });
});
