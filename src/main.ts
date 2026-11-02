import { Plugin } from "obsidian";
import { createProvider } from "./providers";
import { findPreset, secretIdFor } from "./providers/presets";
import { ProviderError } from "./providers/errors";
import { parseExcludedFolders } from "./search/exclusions";
import { VaultIndex } from "./search/VaultIndex";
import {
  DEFAULT_SETTINGS,
  GraphiteSettingTab,
  isProviderConfigured,
  type GraphiteSettings,
} from "./settings";
import { ChatView, VIEW_TYPE_GRAPHITE } from "./ui/ChatView";
import { MetadataLinkGraph } from "./vault/LinkGraphAdapter";
import { VaultIndexer } from "./vault/VaultIndexer";

// Temporary built-in glyph until the ribbon icon is decided (spec Q7, task T18).
const RIBBON_ICON = "search";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export default class GraphitePlugin extends Plugin {
  settings: GraphiteSettings = { ...DEFAULT_SETTINGS };
  readonly index = new VaultIndex();
  private indexer: VaultIndexer | null = null;
  private linkGraph: MetadataLinkGraph | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.linkGraph = new MetadataLinkGraph(this.app);
    this.index.setLinkGraph(this.linkGraph);
    this.index.setExcludedFolders(parseExcludedFolders(this.settings.excludedFolders));

    this.indexer = new VaultIndexer(this.app, this.index);
    this.indexer.registerVaultEvents(this);
    this.indexer.setChangeListener(() => this.refreshViews());

    this.registerView(VIEW_TYPE_GRAPHITE, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon(RIBBON_ICON, "Open Graphite", () => this.openPanel());
    this.addCommand({
      id: "open-panel",
      name: "Open Graphite",
      callback: () => this.openPanel(),
    });
    this.addSettingTab(new GraphiteSettingTab(this.app, this));

    // Indexing waits for the vault to settle, so startup is not slowed down.
    this.app.workspace.onLayoutReady(() => {
      void this.indexer?.buildAll();
    });
  }

  onunload(): void {
    this.indexer?.dispose();
    this.indexer = null;
    this.index.setLinkGraph(null);
  }

  /** Reveals the existing panel, or opens one in the right sidebar. */
  private async openPanel(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GRAPHITE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_GRAPHITE, active: true });
    await workspace.revealLeaf(leaf);
  }

  private refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPHITE)) {
      const view = leaf.view;
      if (view instanceof ChatView) view.onIndexChanged();
    }
  }

  async loadSettings(): Promise<void> {
    const stored: unknown = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored as Partial<GraphiteSettings> | null) };
  }

  async saveSettings(): Promise<void> {
    // Only the settings object is persisted; keys live in SecretStorage.
    await this.saveData(this.settings);
  }

  /** Re-indexes after the excluded-folder list changes, without a restart (US-11). */
  async applyExclusions(): Promise<void> {
    await this.indexer?.applyExclusions(parseExcludedFolders(this.settings.excludedFolders));
  }

  readApiKey(): string | null {
    const preset = findPreset(this.settings.preset);
    if (!preset.needsKey) return null;
    return this.app.secretStorage.getSecret(secretIdFor(preset.kind, preset.id));
  }

  /** True when an AI answer can be attempted. False means search-only, not an error. */
  get hasProvider(): boolean {
    return isProviderConfigured(this.settings, this.readApiKey());
  }

  createProvider() {
    return createProvider(this.settings, this.readApiKey());
  }

  /** Resolves a wikilink target against the vault, for the quote check. */
  resolvesLink(target: string, fromPath: string): boolean {
    return this.linkGraph?.resolves(target, fromPath) ?? false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const provider = this.createProvider();
    if (!provider) {
      const preset = findPreset(this.settings.preset);
      if (preset.kind !== "openai") {
        return { ok: false, message: `${preset.label} is not available yet in this version.` };
      }
      return { ok: false, message: "Set the base URL, model and API key first." };
    }

    try {
      await provider.testConnection();
      return { ok: true, message: "Connection works." };
    } catch (cause) {
      if (cause instanceof ProviderError) return { ok: false, message: cause.message };
      return { ok: false, message: "The connection test failed. Check the settings above." };
    }
  }
}
