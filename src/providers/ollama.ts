import {
  errorForNetwork,
  errorForStatus,
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

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  http: HttpFetch;
}

interface OllamaResponse {
  message?: { content?: unknown };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  error?: unknown;
}

/**
 * Ollama's native chat endpoint.
 *
 * Separate from the OpenAI connector because Ollama reports token counts under
 * its own field names and returns errors as a 200 with an `error` key.
 */
export class OllamaProvider implements ChatProvider {
  constructor(private readonly options: OllamaProviderOptions) {}

  get label(): string {
    return "Ollama";
  }

  get model(): string {
    return this.options.model;
  }

  private get endpoint(): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/api/chat`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const body = JSON.stringify({
      model: this.options.model,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      stream: false,
      ...(request.json ? { format: "json" } : {}),
      options: {
        temperature: request.temperature ?? 0,
        num_predict: request.maxTokens,
      },
    });

    let response;
    try {
      response = await this.options.http({
        url: this.endpoint,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (cause) {
      // Ollama runs on the user's machine, so "not running" is the likely cause.
      throw errorForNetwork(cause, this.label, this.options.baseUrl, true);
    }

    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status, this.label, this.options.model, response.text);
    }

    return this.parse(response.text);
  }

  private parse(raw: string): CompletionResult {
    let parsed: OllamaResponse;
    try {
      parsed = JSON.parse(raw) as OllamaResponse;
    } catch {
      throw malformedResponse(this.label);
    }

    // Ollama reports a missing model as a 200 carrying an error field.
    if (typeof parsed.error === "string" && parsed.error) {
      const message = parsed.error.toLowerCase();
      if (message.includes("not found") || message.includes("try pulling")) {
        throw new ProviderError(
          "model",
          `Ollama does not have the model "${this.options.model}". Run "ollama pull ${this.options.model}" in a terminal, or change the model in settings.`,
        );
      }
      throw new ProviderError("unknown", `Ollama reported: ${parsed.error}`);
    }

    const content = parsed.message?.content;
    if (typeof content !== "string") throw malformedResponse(this.label);

    return { text: content, usage: readUsage(parsed) };
  }

  async testConnection(): Promise<void> {
    if (!this.options.baseUrl) {
      throw new ProviderError("unreachable", "Set the Ollama base URL in settings.");
    }
    if (!this.options.model) {
      throw new ProviderError(
        "model",
        'Set a model name in settings. Run "ollama list" to see what you have installed.',
      );
    }
    await this.complete({
      system: "Reply with the single word: ok",
      messages: [{ role: "user", content: "ok" }],
      maxTokens: 5,
    });
  }
}

function readUsage(parsed: OllamaResponse): TokenUsage {
  const sent = parsed.prompt_eval_count;
  const received = parsed.eval_count;
  return {
    sent: typeof sent === "number" ? sent : null,
    received: typeof received === "number" ? received : null,
  };
}
