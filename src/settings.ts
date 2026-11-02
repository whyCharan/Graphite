import { PluginSettingTab, Setting, type App } from "obsidian";
import type GraphitePlugin from "./main";
import { findPreset, PRESETS, secretIdFor, type PresetId } from "./providers/presets";

export interface GraphiteSettings {
  preset: PresetId;
  /** Overrides the preset's base URL. Empty means use the preset's own. */
  baseUrl: string;
  /** Empty means the user has not chosen one; the panel then says AI answers are off. */
  model: string;
  /** Notes sent per answer. Spec range 3 to 20. */
  notesPerAnswer: number;
  expandQuestion: boolean;
  /** Raw text as typed, one folder per line or comma separated. */
  excludedFolders: string;
}

export const DEFAULT_SETTINGS: GraphiteSettings = {
  preset: "groq",
  baseUrl: "",
  model: "llama-3.3-70b-versatile",
  notesPerAnswer: 8,
  expandQuestion: true,
  excludedFolders: "",
};

export const MIN_NOTES_PER_ANSWER = 3;
export const MAX_NOTES_PER_ANSWER = 20;

/** The base URL in force: the user's override, else the preset's. */
export function effectiveBaseUrl(settings: GraphiteSettings): string {
  const preset = findPreset(settings.preset);
  return settings.baseUrl.trim() || preset.baseUrl;
}

/**
 * Whether a provider is configured enough to call. Search never depends on
 * this: a false answer means search-only mode, not an error (US-8).
 */
export function isProviderConfigured(settings: GraphiteSettings, apiKey: string | null): boolean {
  const preset = findPreset(settings.preset);
  if (!settings.model.trim()) return false;
  if (!effectiveBaseUrl(settings)) return false;
  if (preset.needsKey && !apiKey) return false;
  return true;
}

export class GraphiteSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: GraphitePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderProviderSection(containerEl);
    this.renderSearchSection(containerEl);
  }

  private renderProviderSection(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;
    const preset = findPreset(settings.preset);

    new Setting(containerEl).setName("AI provider").setHeading();

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Graphite has no server. Requests go only to the provider you choose here.")
      .addDropdown((dropdown) => {
        for (const option of PRESETS) dropdown.addOption(option.id, option.label);
        dropdown.setValue(settings.preset).onChange(async (value) => {
          const chosen = findPreset(value as PresetId);
          settings.preset = chosen.id;
          settings.baseUrl = "";
          settings.model = chosen.defaultModel;
          await this.plugin.saveSettings();
          // Redraw: which fields apply depends on the preset.
          this.display();
        });
      });

    if (preset.editableBaseUrl || !preset.baseUrl) {
      new Setting(containerEl)
        .setName("Base URL")
        .setDesc(preset.baseUrl ? `Default: ${preset.baseUrl}` : "Required for this provider.")
        .addText((text) =>
          text
            .setPlaceholder(preset.baseUrl || "https://…")
            .setValue(settings.baseUrl)
            .onChange(async (value) => {
              settings.baseUrl = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Model")
      .setDesc(
        preset.defaultModel
          ? `Default: ${preset.defaultModel}. Provider model names change; edit this if the model is rejected.`
          : "Required. Use the model name exactly as your provider lists it.",
      )
      .addText((text) =>
        text
          .setPlaceholder(preset.defaultModel || "model-name")
          .setValue(settings.model)
          .onChange(async (value) => {
            settings.model = value;
            await this.plugin.saveSettings();
          }),
      );

    if (preset.needsKey) {
      const secretId = secretIdFor(preset.kind, preset.id);
      const stored = this.plugin.readApiKey();

      new Setting(containerEl)
        .setName("API key")
        .setDesc(
          stored
            ? "A key is saved in Obsidian's secret storage. Type a new one to replace it."
            : "Stored in Obsidian's secret storage, never in this plugin's data file.",
        )
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder(stored ? "Key saved" : "Paste your key").onChange((value) => {
            const key = value.trim();
            if (key) this.app.secretStorage.setSecret(secretId, key);
          });
        });
    }

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Sends one very short request to check the base URL, model and key.")
      .addButton((button) =>
        button
          .setButtonText("Test")
          .setCta()
          .onClick(async () => {
            button.setButtonText("Testing…").setDisabled(true);
            const result = await this.plugin.testConnection();
            button.setButtonText("Test").setDisabled(false);
            const status = containerEl.querySelector<HTMLElement>(".graphite-test-result");
            if (status) {
              status.textContent = result.ok ? "Connection works." : result.message;
              status.toggleClass("graphite-test-error", !result.ok);
            }
          }),
      );

    containerEl.createDiv({ cls: "graphite-test-result" });

    new Setting(containerEl)
      .setName("Expand question with AI")
      .setDesc(
        "Turns your question into search terms and synonyms before searching. Costs one extra request per question.",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.expandQuestion).onChange(async (value) => {
          settings.expandQuestion = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderSearchSection(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Search").setHeading();

    new Setting(containerEl)
      .setName("Notes per answer")
      .setDesc(`How many notes are sent with a question (${MIN_NOTES_PER_ANSWER} to ${MAX_NOTES_PER_ANSWER}).`)
      .addSlider((slider) =>
        slider
          .setLimits(MIN_NOTES_PER_ANSWER, MAX_NOTES_PER_ANSWER, 1)
          .setValue(settings.notesPerAnswer)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.notesPerAnswer = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc(
        "One folder per line. Notes in these folders are never indexed, never searched and never sent. Changes apply immediately.",
      )
      .addTextArea((area) =>
        area
          .setPlaceholder("Private\nJournal")
          .setValue(settings.excludedFolders)
          .onChange(async (value) => {
            settings.excludedFolders = value;
            await this.plugin.saveSettings();
            await this.plugin.applyExclusions();
          }),
      );
  }
}
