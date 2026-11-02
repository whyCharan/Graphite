export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Low by default: the answer must come from the excerpts, not invention. */
  temperature?: number;
  /** Asks the provider for a JSON object, used by keyword expansion. */
  json?: boolean;
}

/** Tokens as the provider reported them. Null means it reported none (US-10). */
export interface TokenUsage {
  sent: number | null;
  received: number | null;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
}

/**
 * One interface over every provider. Implementations take an injected HTTP
 * function so request and response handling is unit-testable with fakes.
 */
export interface ChatProvider {
  readonly label: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Resolves when the endpoint, model and key all work; throws ProviderError otherwise. */
  testConnection(): Promise<void>;
}

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Raw body, used for error reporting when the body is not JSON. */
  text: string;
}

/**
 * The HTTP call. Obsidian's `requestUrl` backs this in the app, because it
 * bypasses CORS, which local servers like Ollama and LM Studio need.
 */
export type HttpFetch = (request: HttpRequest) => Promise<HttpResponse>;
