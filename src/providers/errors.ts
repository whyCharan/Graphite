/**
 * Provider failures the user can act on (US-7).
 *
 * Every failure becomes one of these kinds with a message naming the fix. No
 * raw status codes or stack traces reach the panel, and search results are
 * still shown in every case.
 */
export type ProviderErrorKind =
  | "auth"
  | "model"
  | "rate-limit"
  | "unreachable"
  | "timeout"
  | "refusal"
  | "malformed"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Maps an HTTP status to a message that names the fix. */
export function errorForStatus(
  status: number,
  providerLabel: string,
  model: string,
  body: string,
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      "auth",
      `${providerLabel} rejected the API key. Check the key in Graphite's settings, then use Test connection.`,
    );
  }

  if (status === 404) {
    return new ProviderError(
      "model",
      `${providerLabel} does not recognise the model "${model}". Check the model name against the provider's model list and update it in settings.`,
    );
  }

  if (status === 429) {
    return new ProviderError(
      "rate-limit",
      `${providerLabel} is rate limiting this key. Wait a moment and ask again, or turn off "Expand question with AI" in settings to use one request per question instead of two.`,
    );
  }

  if (status >= 500) {
    return new ProviderError(
      "unreachable",
      `${providerLabel} returned a server error. This is on the provider's side, so try again shortly.`,
    );
  }

  if (status === 400) {
    // 400 most often means the model name is wrong or unsupported for chat.
    return new ProviderError(
      "model",
      `${providerLabel} rejected the request for model "${model}". Check the model name in settings. ${firstLine(body)}`.trim(),
    );
  }

  return new ProviderError(
    "unknown",
    `${providerLabel} returned an unexpected response (status ${status}). ${firstLine(body)}`.trim(),
  );
}

/** Network-level failure, before any status was received. */
export function errorForNetwork(
  cause: unknown,
  providerLabel: string,
  baseUrl: string,
  isLocal: boolean,
): ProviderError {
  const text = String(cause instanceof Error ? cause.message : cause).toLowerCase();

  // "timed out" and "ETIMEDOUT" are both common; matching only "timeout" misses them.
  if (/timeout|timed out|etimedout|abort/.test(text)) {
    return new ProviderError(
      "timeout",
      `${providerLabel} did not respond in time. Try again, or pick a smaller model.`,
    );
  }

  if (isLocal) {
    return new ProviderError(
      "unreachable",
      `Could not reach ${providerLabel} at ${baseUrl}. Start it and check the base URL in Graphite's settings.`,
    );
  }

  return new ProviderError(
    "unreachable",
    `Could not reach ${providerLabel} at ${baseUrl}. Check your internet connection and the base URL in settings.`,
  );
}

export function malformedResponse(providerLabel: string): ProviderError {
  return new ProviderError(
    "malformed",
    `${providerLabel} sent a reply Graphite could not read. Try again, and if it keeps happening check the model name in settings.`,
  );
}

/** True for base URLs that point at the user's own machine. */
export function isLocalEndpoint(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(baseUrl);
}

function firstLine(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  // Providers return a JSON error object; its message is the useful part.
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const error = (parsed as { error?: { message?: unknown }; message?: unknown }).error;
      const message =
        (error && typeof error === "object" ? (error as { message?: unknown }).message : null) ??
        (parsed as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  } catch {
    // Not JSON; fall through to the raw first line.
  }
  return trimmed.split("\n")[0].slice(0, 200);
}
