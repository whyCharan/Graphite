import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import type GraphitePlugin from "../main";
import { findPreset } from "../providers/presets";
import type { SearchResult } from "../search/VaultIndex";
import { renderResults } from "./results";

export const VIEW_TYPE_GRAPHITE = "graphite-chat";

/**
 * The Graphite side panel.
 *
 * Styled only with Obsidian's own theme variables, so it follows whatever
 * theme the user runs (spec Q6). Every state says what is happening and what
 * to do next, in words rather than colour or a looping spinner.
 */
export class ChatView extends ItemView {
  private input: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private lastResult: SearchResult | null = null;
  private searching = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: GraphitePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPHITE;
  }

  getDisplayText(): string {
    return "Graphite";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("graphite-panel");

    this.renderHeader(root);
    this.statusEl = root.createDiv({ cls: "graphite-status" });
    this.resultsEl = root.createDiv({ cls: "graphite-body" });
    this.renderComposer(root);

    this.renderState();
    // The panel opens ready to type (spec: keyboard).
    this.input?.focus();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Called when the index changes, so progress and results stay current. */
  onIndexChanged(): void {
    if (!this.searching) this.renderState();
  }

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "graphite-header" });
    header.createDiv({ cls: "graphite-header-title", text: "Graphite" });

    const newChat = header.createEl("button", { cls: "graphite-icon-button" });
    newChat.type = "button";
    newChat.setAttribute("aria-label", "New chat");
    setIcon(newChat, "plus");
    newChat.addEventListener("click", () => this.reset());
  }

  private renderComposer(root: HTMLElement): void {
    const composer = root.createDiv({ cls: "graphite-composer" });

    const input = composer.createEl("textarea", { cls: "graphite-input" });
    input.rows = 2;
    input.placeholder = "Ask about your notes";
    input.addEventListener("keydown", (event) => {
      // Enter sends, Shift+Enter adds a line (spec: keyboard).
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.submit();
      }
    });
    this.input = input;

    const send = composer.createEl("button", { cls: "graphite-send" });
    send.type = "button";
    send.setAttribute("aria-label", "Search notes");
    setIcon(send, "arrow-right");
    send.addEventListener("click", () => void this.submit());
  }

  private reset(): void {
    this.lastResult = null;
    if (this.input) this.input.value = "";
    this.renderState();
    this.input?.focus();
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.setText(text);
  }

  /** One line describing whether AI answers are available, and how to turn them on. */
  private providerLine(): string {
    if (!this.plugin.hasProvider) {
      return "AI answers off: search only. Set up a provider in Settings.";
    }
    const preset = findPreset(this.plugin.settings.preset);
    return `AI answers: ${preset.label}, ${this.plugin.settings.model}`;
  }

  private renderState(): void {
    const body = this.resultsEl;
    if (!body) return;
    body.empty();

    const progress = this.plugin.index.progress;
    if (progress.building) {
      this.setStatus(`Indexing your vault: ${progress.done} of ${progress.total} notes`);
    } else {
      this.setStatus("");
    }

    if (!this.lastResult) {
      const empty = body.createDiv({ cls: "graphite-empty" });
      empty.createDiv({
        cls: "graphite-empty-lead",
        text: "Ask a question and Graphite finds the notes that answer it, with a quote from each one.",
      });
      empty.createDiv({ cls: "graphite-note", text: this.providerLine() });
      if (progress.building) {
        empty.createDiv({
          cls: "graphite-note",
          text: "You can ask while indexing runs. Search uses the notes indexed so far.",
        });
      }
      return;
    }

    const { terms, notes } = this.lastResult;

    if (notes.length === 0) {
      const none = body.createDiv({ cls: "graphite-empty" });
      none.createDiv({
        cls: "graphite-empty-lead",
        text: "No notes matched that question.",
      });
      none.createDiv({
        cls: "graphite-note",
        text: terms.length > 0 ? `Searched for: ${terms.join(", ")}` : "No searchable words in that question.",
      });
      return;
    }

    body.createDiv({
      cls: "graphite-note",
      text: `${notes.length} ${notes.length === 1 ? "note" : "notes"} matched. ${this.providerLine()}`,
    });

    renderResults(body, notes, {
      openNote: (notePath, newTab) => {
        void this.app.workspace.openLinkText(notePath, "", newTab);
      },
    });
  }

  private async submit(): Promise<void> {
    const question = this.input?.value.trim() ?? "";
    if (!question || this.searching) return;

    this.searching = true;
    this.setStatus("Searching your notes");

    try {
      // Search is synchronous and local; the await keeps the UI responsive if
      // that changes and makes the working state observable.
      this.lastResult = await Promise.resolve(
        this.plugin.index.search(question, this.plugin.settings.notesPerAnswer),
      );
    } finally {
      this.searching = false;
    }

    this.renderState();
  }
}
