/**
 * Provider presets. Groq, OpenAI, OpenRouter and LM Studio are one connector
 * with different base URLs rather than four integrations, which is why they
 * share the "openai" kind.
 */

export type ProviderKind = "openai" | "anthropic" | "ollama";

export type PresetId =
  | "groq"
  | "openai"
  | "openrouter"
  | "lmstudio"
  | "custom"
  | "anthropic"
  | "ollama";

export interface ProviderPreset {
  id: PresetId;
  label: string;
  kind: ProviderKind;
  /** Suggested base URL. Empty when the user must supply one. */
  baseUrl: string;
  /** Suggested model. Empty means the user must choose, and the UI says so. */
  defaultModel: string;
  /** Whether an API key is required. Local servers do not need one. */
  needsKey: boolean;
  /** Whether the base URL is editable, which only local or custom endpoints are. */
  editableBaseUrl: boolean;
}

export const PRESETS: readonly ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    // Spec Q2's default. Groq retires model names, so the field stays editable
    // and an unknown-model error names the fix (Task 13).
    defaultModel: "llama-3.3-70b-versatile",
    needsKey: true,
    editableBaseUrl: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "",
    needsKey: true,
    editableBaseUrl: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    needsKey: true,
    editableBaseUrl: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    needsKey: false,
    editableBaseUrl: true,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    kind: "openai",
    baseUrl: "",
    defaultModel: "",
    needsKey: false,
    editableBaseUrl: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-5-5",
    needsKey: true,
    editableBaseUrl: false,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "ollama",
    baseUrl: "http://localhost:11434",
    defaultModel: "",
    needsKey: false,
    editableBaseUrl: true,
  },
];

export function findPreset(id: PresetId): ProviderPreset {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  // Falling back to Groq keeps a corrupted setting from disabling the panel.
  return preset ?? PRESETS[0];
}

/**
 * SecretStorage ids, one per provider kind rather than per preset, so swapping
 * Groq for OpenRouter does not silently reuse the wrong key.
 */
export function secretIdFor(kind: ProviderKind, presetId: PresetId): string {
  return kind === "anthropic" ? "graphite-anthropic-key" : `graphite-${presetId}-key`;
}
