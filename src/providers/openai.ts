import {
  errorForNetwork,
  errorForStatus,
  isLocalEndpoint,
  malformedResponse,
  ProviderError,
} from "./errors";
import type {
  ChatProvider,
  CompletionRequest,
  CompletionResult,
  HttpFetch,
  TokenUsage,
} from "./types";

export interface OpenAiProviderOptions {
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  http: HttpFetch;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
}

/**
 * The OpenAI-compatible connector, shared by Groq, OpenAI, OpenRouter, LM
 * Studio and any custom endpoint. One connector rather than four integrations,
 * because they differ only in base URL, key and model.
 */
export class OpenAiCompatibleProvider implements ChatProvider {
  constructor(private readonly options: OpenAiProviderOptions) {}

  get label(): string {
    return this.options.label;
  }

  get model(): string {
    return this.options.model;
  }

  private get endpoint(): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
    return headers;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const body = JSON.stringify({
      model: this.options.model,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0,
      ...(request.json ? { response_format: { type: "json_object" } } : {}),
    });

    let response;
    try {
      response = await this.options.http({
        url: this.endpoint,
        method: "POST",
        headers: this.headers(),
        body,
      });
    } catch (cause) {
      throw errorForNetwork(
        cause,
        this.label,
        this.options.baseUrl,
        isLocalEndpoint(this.options.baseUrl),
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status, this.label, this.options.model, response.text);
    }

    return this.parse(response.text);
  }

  private parse(raw: string): CompletionResult {
    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(raw) as ChatCompletionResponse;
    } catch {
      throw malformedResponse(this.label);
    }

    const choice = parsed.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") throw malformedResponse(this.label);

    if (choice?.finish_reason === "content_filter") {
      throw new ProviderError(
        "refusal",
        `${this.label} declined to answer this question. Rephrasing it usually helps.`,
      );
    }

    // Reasoning models spend completion tokens thinking before they write. When
    // the allowance runs out first, the reply is empty, which must not pass as
    // an answer that simply contained nothing.
    if (content.trim() === "" && choice?.finish_reason === "length") {
      throw new ProviderError(
        "truncated",
        `${this.label} used its whole token allowance before writing an answer. Try a non-reasoning model, or lower "Notes per answer" in settings.`,
      );
    }

    return { text: content, usage: readUsage(parsed) };
  }

  /** Sends the smallest possible request, so a test costs almost nothing. */
  async testConnection(): Promise<void> {
    if (!this.options.baseUrl) {
      throw new ProviderError("unreachable", "Set a base URL for this provider in settings.");
    }
    if (!this.options.model) {
      throw new ProviderError("model", "Set a model name for this provider in settings.");
    }
    try {
      await this.complete({
        system: "Reply with the single word: ok",
        messages: [{ role: "user", content: "ok" }],
        maxTokens: 16,
      });
    } catch (cause) {
      // A reasoning model may spend a tiny allowance thinking and write nothing.
      // The key, model and endpoint all worked, which is what the test checks.
      if (cause instanceof ProviderError && cause.kind === "truncated") return;
      throw cause;
    }
  }
}

function readUsage(parsed: ChatCompletionResponse): TokenUsage {
  const sent = parsed.usage?.prompt_tokens;
  const received = parsed.usage?.completion_tokens;
  return {
    sent: typeof sent === "number" ? sent : null,
    received: typeof received === "number" ? received : null,
  };
}
