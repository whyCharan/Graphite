import { describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama";
import type { HttpFetch } from "../../src/providers/types";

function respond(status: number, text: string): HttpFetch {
  return async () => ({ status, text });
}

function providerWith(http: HttpFetch, model = "llama3") {
  return new OllamaProvider({ baseUrl: "http://localhost:11434", model, http });
}

const okBody = JSON.stringify({
  message: { content: "the answer" },
  prompt_eval_count: 90,
  eval_count: 12,
});

const request = {
  system: "system prompt",
  messages: [{ role: "user" as const, content: "question" }],
  maxTokens: 400,
};

describe("OllamaProvider", () => {
  it("returns the reply and Ollama's own token counts", async () => {
    const result = await providerWith(respond(200, okBody)).complete(request);
    expect(result.text).toBe("the answer");
    expect(result.usage).toEqual({ sent: 90, received: 12 });
  });

  it("posts to the native chat endpoint with streaming off", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http).complete(request);

    const sent = http.mock.calls[0][0];
    expect(sent.url).toBe("http://localhost:11434/api/chat");
    expect(JSON.parse(sent.body ?? "{}")).toMatchObject({ model: "llama3", stream: false });
  });

  it("sends no API key header, because a local server needs none", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http).complete(request);
    expect(http.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it("asks for JSON format only when requested", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http).complete({ ...request, json: true });
    expect(JSON.parse(http.mock.calls[0][0].body ?? "{}").format).toBe("json");
  });

  it("tells the user to start Ollama when the server cannot be reached", async () => {
    const provider = providerWith(async () => {
      throw new Error("ECONNREFUSED");
    });
    const error = await provider.complete(request).catch((e) => e);

    expect(error.kind).toBe("unreachable");
    expect(error.message).toContain("Start it");
    expect(error.message).toContain("http://localhost:11434");
  });

  it("recognises a missing model reported inside a 200 response", async () => {
    const body = JSON.stringify({ error: 'model "llama3" not found, try pulling it first' });
    const error = await providerWith(respond(200, body)).complete(request).catch((e) => e);

    expect(error.kind).toBe("model");
    expect(error.message).toContain("ollama pull llama3");
  });

  it("surfaces any other error Ollama reports in a 200", async () => {
    const body = JSON.stringify({ error: "out of memory" });
    const error = await providerWith(respond(200, body)).complete(request).catch((e) => e);
    expect(error.message).toContain("out of memory");
  });

  it("reports usage as not available when Ollama omits the counts", async () => {
    const result = await providerWith(respond(200, JSON.stringify({ message: { content: "x" } })))
      .complete(request);
    expect(result.usage).toEqual({ sent: null, received: null });
  });

  it("rejects a response that is not JSON", async () => {
    const error = await providerWith(respond(200, "not json")).complete(request).catch((e) => e);
    expect(error.kind).toBe("malformed");
  });

  it("asks for a model before sending anything", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    const error = await providerWith(http, "").testConnection().catch((e) => e);

    expect(error.kind).toBe("model");
    expect(error.message).toContain("ollama list");
    expect(http).not.toHaveBeenCalled();
  });

  it("resolves a connection test when the server replies", async () => {
    await expect(providerWith(respond(200, okBody)).testConnection()).resolves.toBeUndefined();
  });
});
