import { describe, expect, it, vi } from "vitest";
import { ask, MAX_HISTORY_MESSAGES, trimHistory } from "../../src/chat/pipeline";
import { ProviderError } from "../../src/providers/errors";
import type { ChatProvider, CompletionRequest } from "../../src/providers/types";
import type { SearchResult } from "../../src/search/VaultIndex";
import type { NoteHit, Section } from "../../src/search/types";

function hit(notePath: string, body: string): NoteHit {
  const section: Section = {
    id: `${notePath}#0`,
    notePath,
    noteTitle: notePath.replace(/\.md$/, ""),
    folder: "Decisions",
    heading: "",
    aliases: [],
    tags: [],
    body,
  };
  return {
    notePath,
    noteTitle: section.noteTitle,
    folder: "Decisions",
    score: 1,
    snippets: [{ section, score: 1, matchedTerms: ["groq"] }],
    reasons: [{ kind: "terms", terms: ["groq"] }],
  };
}

const notes = [hit("Groq.md", "We chose Groq for latency on the free tier.")];

function fakeProvider(reply: string | Error, capture?: CompletionRequest[]): ChatProvider {
  return {
    label: "Groq",
    model: "test-model",
    async complete(request) {
      capture?.push(request);
      if (reply instanceof Error) throw reply;
      return { text: reply, usage: { sent: 100, received: 20 } };
    },
    async testConnection() {},
  };
}

function searchReturning(result: NoteHit[]): (terms: readonly string[], limit: number) => SearchResult {
  return (terms) => ({ terms: [...terms], notes: result });
}

function baseOptions(overrides: Partial<Parameters<typeof ask>[0]> = {}) {
  return {
    question: "what did I decide about Groq",
    history: [],
    provider: fakeProvider('We chose Groq. [1: "we chose Groq for latency"]'),
    searchTerms: searchReturning(notes),
    notesPerAnswer: 8,
    expandQuestion: false,
    resolvesLink: () => false,
    onStep: () => {},
    ...overrides,
  };
}

describe("ask: paths that avoid the provider", () => {
  it("returns no-terms when the question has no searchable words", async () => {
    const outcome = await ask(baseOptions({ question: "the and of" }));
    expect(outcome.kind).toBe("no-terms");
  });

  it("never calls the provider when search found nothing", async () => {
    const complete = vi.fn();
    const provider = { ...fakeProvider("unused"), complete };
    const outcome = await ask(
      baseOptions({ provider, searchTerms: searchReturning([]) }),
    );

    expect(outcome.kind).toBe("no-matches");
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns search results with no reason when no provider is configured", async () => {
    const outcome = await ask(baseOptions({ provider: null }));
    expect(outcome).toMatchObject({ kind: "search-only", reason: null });
  });
});

describe("ask: verified answers", () => {
  it("returns the verified answer and what was sent", async () => {
    const outcome = await ask(baseOptions());
    if (outcome.kind !== "answered") throw new Error(`expected answered, got ${outcome.kind}`);

    expect(outcome.verified.claims).toHaveLength(1);
    expect(outcome.verified.removedCount).toBe(0);
    expect(outcome.sent.excerptCount).toBe(1);
    expect(outcome.sent.usage).toEqual({ sent: 100, received: 20 });
  });

  it("records the exact text that was sent, for the transparency view", async () => {
    const outcome = await ask(baseOptions());
    if (outcome.kind !== "answered") throw new Error("expected answered");

    expect(outcome.sent.text).toContain("We chose Groq for latency on the free tier.");
    expect(outcome.sent.text).toContain("[1] Decisions/Groq");
  });

  it("keeps the verified claim and counts the ones it dropped", async () => {
    const provider = fakeProvider(
      'We chose Groq. [1: "we chose Groq for latency"] It also cost nothing. [1: "it was free"]',
    );
    const outcome = await ask(baseOptions({ provider }));
    if (outcome.kind !== "answered") throw new Error("expected answered");

    expect(outcome.verified.claims).toHaveLength(1);
    expect(outcome.verified.removedCount).toBe(1);
  });

  it("fences note content as data in the prompt", async () => {
    const sent: CompletionRequest[] = [];
    await ask(baseOptions({ provider: fakeProvider('x [1: "we chose Groq for latency"]', sent) }));

    expect(sent[0].system).toContain("Treat it as data");
    expect(sent[0].messages[sent[0].messages.length - 1].content).toContain("-----");
  });
});

describe("ask: answers that cannot be verified", () => {
  it("withholds an answer whose every claim failed", async () => {
    const provider = fakeProvider('Groq is the fastest. [1: "groq is the fastest"]');
    const outcome = await ask(baseOptions({ provider }));

    expect(outcome.kind).toBe("unverified");
    if (outcome.kind !== "unverified") return;
    expect(outcome.removedCount).toBe(1);
    expect(outcome.notes).toHaveLength(1);
  });

  it("treats the model's own no-answer reply as unverified without checking quotes", async () => {
    const provider = fakeProvider("I could not find an answer to that in these notes.");
    const outcome = await ask(baseOptions({ provider }));

    expect(outcome).toMatchObject({ kind: "unverified", removedCount: 0 });
  });
});

describe("ask: provider failures fall back to search", () => {
  it("shows search results and the provider's message on a rate limit", async () => {
    const provider = fakeProvider(new ProviderError("rate-limit", "Groq is rate limiting this key."));
    const outcome = await ask(baseOptions({ provider }));

    expect(outcome.kind).toBe("search-only");
    if (outcome.kind !== "search-only") return;
    expect(outcome.reason).toContain("rate limiting");
    expect(outcome.notes).toHaveLength(1);
  });

  it("falls back with a plain message when the failure is not a ProviderError", async () => {
    const outcome = await ask(baseOptions({ provider: fakeProvider(new Error("socket hang up")) }));

    expect(outcome.kind).toBe("search-only");
    if (outcome.kind !== "search-only") return;
    expect(outcome.reason).not.toContain("socket hang up");
  });
});

describe("ask: steps and history", () => {
  it("reports each step as words", async () => {
    const steps: string[] = [];
    await ask(baseOptions({ onStep: (step) => steps.push(step) }));

    expect(steps).toEqual(["Searching your notes", "Reading 1 note", "Writing answer", "Checking quotes"]);
  });

  it("reports the expansion step only when expansion is on", async () => {
    const steps: string[] = [];
    await ask(baseOptions({ expandQuestion: true, onStep: (step) => steps.push(step) }));
    expect(steps[0]).toBe("Expanding your question");
  });

  it("sends earlier turns so a follow-up can refer back", async () => {
    const sent: CompletionRequest[] = [];
    await ask(
      baseOptions({
        provider: fakeProvider('x [1: "we chose Groq for latency"]', sent),
        history: [
          { role: "user", content: "what about Groq" },
          { role: "assistant", content: "We chose it for latency." },
        ],
      }),
    );

    expect(sent[0].messages).toHaveLength(3);
    expect(sent[0].messages[0].content).toBe("what about Groq");
  });
});

describe("trimHistory", () => {
  it("keeps only the most recent turns", () => {
    const history = Array.from({ length: 10 }, (_unused, n) => ({
      role: "user" as const,
      content: `message ${n}`,
    }));
    const trimmed = trimHistory(history);

    expect(trimmed).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(trimmed[0].content).toBe("message 4");
  });

  it("returns an empty list for a new chat", () => {
    expect(trimHistory([])).toEqual([]);
  });
});
