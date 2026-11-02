import { describe, expect, it } from "vitest";
import { plainText } from "../../src/ui/results";

describe("plainText", () => {
  it("removes emphasis markers but keeps the words", () => {
    expect(plainText("A **parcel** is one __tracked__ item.")).toBe("A parcel is one tracked item.");
  });

  it("removes inline code ticks and strikethrough", () => {
    expect(plainText("Use `PgBouncer`, not ~~pgpool~~.")).toBe("Use PgBouncer, not pgpool.");
  });

  it("shows a wikilink's alias, or its target when there is none", () => {
    expect(plainText("See [[Glossary]] and [[Use Postgres|the ADR]].")).toBe("See Glossary and the ADR.");
  });

  it("shows a Markdown link's text without its URL", () => {
    expect(plainText("Read [the docs](https://example.com) first.")).toBe("Read the docs first.");
  });

  it("drops heading hashes and collapses whitespace", () => {
    expect(plainText("## Decision\n\nWe   chose\nPostgres.")).toBe("Decision We chose Postgres.");
  });
});
