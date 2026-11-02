import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../../src/providers/errors";
import { OpenAiCompatibleProvider } from "../../src/providers/openai";
import type { HttpFetch, HttpResponse } from "../../src/providers/types";

function respond(status: number, text: string): HttpFetch {
  return async () => ({ status, text }) satisfies HttpResponse;
}

function providerWith(http: HttpFetch, overrides: Partial<{ baseUrl: string; model: string }> = {}) {
  return new OpenAiCompatibleProvider({
    label: "Groq",
    baseUrl: overrides.baseUrl ?? "https://api.groq.com/openai/v1",
    model: overrides.model ?? "llama-3.3-70b-versatile",
    apiKey: "test-key",
    http,
  });
}

const okBody = JSON.stringify({
  choices: [{ message: { content: "the answer" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
});

const request = {
  system: "system prompt",
  messages: [{ role: "user" as const, content: "question" }],
  maxTokens: 400,
};

describe("OpenAiCompatibleProvider: successful requests", () => {
  it("returns the reply text and the tokens the provider reported", async () => {
    const result = await providerWith(respond(200, okBody)).complete(request);
    expect(result.text).toBe("the answer");
    expect(result.usage).toEqual({ sent: 120, received: 30 });
  });

  it("reports usage as not available when the provider omits it", async () => {
    const body = JSON.stringify({ choices: [{ message: { content: "x" } }] });
    const result = await providerWith(respond(200, body)).complete(request);
    expect(result.usage).toEqual({ sent: null, received: null });
  });

  it("posts to the chat completions endpoint with the key and model", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http).complete(request);

    const sent = http.mock.calls[0][0];
    expect(sent.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(sent.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(sent.body ?? "{}")).toMatchObject({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "question" },
      ],
    });
  });

  it("does not send an Authorization header when no key is set, as local servers expect", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    const provider = new OpenAiCompatibleProvider({
      label: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      apiKey: null,
      http,
    });
    await provider.complete(request);
    expect(http.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it("tolerates a base URL with a trailing slash", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http, { baseUrl: "https://api.groq.com/openai/v1/" }).complete(request);
    expect(http.mock.calls[0][0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("asks for a JSON object only when the caller wants one", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    await providerWith(http).complete({ ...request, json: true });
    expect(JSON.parse(http.mock.calls[0][0].body ?? "{}").response_format).toEqual({
      type: "json_object",
    });
  });
});

describe("OpenAiCompatibleProvider: failures name the fix", () => {
  it("maps 401 to an API key message", async () => {
    const error = await providerWith(respond(401, "")).complete(request).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("auth");
    expect(error.message).toContain("API key");
  });

  it("maps 403 to the same API key message", async () => {
    const error = await providerWith(respond(403, "")).complete(request).catch((e) => e);
    expect(error.kind).toBe("auth");
  });

  it("maps 404 to an unknown-model message naming the model", async () => {
    const error = await providerWith(respond(404, "")).complete(request).catch((e) => e);
    expect(error.kind).toBe("model");
    expect(error.message).toContain("llama-3.3-70b-versatile");
  });

  it("maps 429 to a rate-limit message suggesting expansion is turned off", async () => {
    const error = await providerWith(respond(429, "")).complete(request).catch((e) => e);
    expect(error.kind).toBe("rate-limit");
    expect(error.message).toContain("Expand question with AI");
  });

  it("maps a 500 to a provider-side message", async () => {
    const error = await providerWith(respond(500, "")).complete(request).catch((e) => e);
    expect(error.kind).toBe("unreachable");
  });

  it("surfaces the provider's own error text from a 400", async () => {
    const body = JSON.stringify({ error: { message: "model_decommissioned" } });
    const error = await providerWith(respond(400, body)).complete(request).catch((e) => e);
    expect(error.kind).toBe("model");
    expect(error.message).toContain("model_decommissioned");
  });

  it("maps a network failure on a local endpoint to a start-it message", async () => {
    const provider = new OpenAiCompatibleProvider({
      label: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      model: "local",
      apiKey: null,
      http: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const error = await provider.complete(request).catch((e) => e);
    expect(error.kind).toBe("unreachable");
    expect(error.message).toContain("Start it");
  });

  it("maps a timeout to its own message", async () => {
    const provider = providerWith(async () => {
      throw new Error("The operation timed out");
    });
    const error = await provider.complete(request).catch((e) => e);
    expect(error.kind).toBe("timeout");
  });

  it("rejects a response that is not JSON", async () => {
    const error = await providerWith(respond(200, "<html>oops</html>")).complete(request).catch((e) => e);
    expect(error.kind).toBe("malformed");
  });

  it("rejects a JSON response with no message content", async () => {
    const error = await providerWith(respond(200, JSON.stringify({ choices: [] })))
      .complete(request)
      .catch((e) => e);
    expect(error.kind).toBe("malformed");
  });

  it("reports a content filter as a refusal", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
    });
    const error = await providerWith(respond(200, body)).complete(request).catch((e) => e);
    expect(error.kind).toBe("refusal");
  });

  it("never puts the API key into an error message", async () => {
    const error = await providerWith(respond(401, "")).complete(request).catch((e) => e);
    expect(error.message).not.toContain("test-key");
  });
});

describe("OpenAiCompatibleProvider.testConnection", () => {
  it("resolves when the provider replies", async () => {
    await expect(providerWith(respond(200, okBody)).testConnection()).resolves.toBeUndefined();
  });

  it("asks for a base URL before sending anything", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    const error = await providerWith(http, { baseUrl: "" }).testConnection().catch((e) => e);
    expect(error.message).toContain("base URL");
    expect(http).not.toHaveBeenCalled();
  });

  it("asks for a model before sending anything", async () => {
    const http = vi.fn<HttpFetch>(async () => ({ status: 200, text: okBody }));
    const error = await providerWith(http, { model: "" }).testConnection().catch((e) => e);
    expect(error.kind).toBe("model");
    expect(http).not.toHaveBeenCalled();
  });
});
