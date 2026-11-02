import { requestUrl } from "obsidian";
import { OpenAiCompatibleProvider } from "./openai";
import { findPreset } from "./presets";
import type { ChatProvider, HttpFetch } from "./types";
import type { GraphiteSettings } from "../settings";
import { effectiveBaseUrl } from "../settings";

/**
 * Obsidian's `requestUrl` rather than `fetch`, because it bypasses the renderer's
 * CORS rules. Local servers such as Ollama and LM Studio do not send CORS
 * headers, so `fetch` would fail against them.
 */
export const obsidianHttp: HttpFetch = async (request) => {
  const response = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    // Status codes are mapped to user-facing messages by the provider itself.
    throw: false,
  });
  return { status: response.status, text: response.text };
};

/**
 * Builds the provider for the current settings, or null when none is usable.
 * Null means search-only mode, never an error (US-8).
 */
export function createProvider(
  settings: GraphiteSettings,
  apiKey: string | null,
  http: HttpFetch = obsidianHttp,
): ChatProvider | null {
  const preset = findPreset(settings.preset);
  const baseUrl = effectiveBaseUrl(settings);
  const model = settings.model.trim();

  if (!baseUrl || !model) return null;
  if (preset.needsKey && !apiKey) return null;

  switch (preset.kind) {
    case "openai":
      return new OpenAiCompatibleProvider({ label: preset.label, baseUrl, model, apiKey, http });
    case "anthropic":
    case "ollama":
      // Built in Tasks 14 and 15. Until then these presets fall back to search only.
      return null;
  }
};
