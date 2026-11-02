import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import { ask, type AskOutcome } from "../chat/pipeline";
import { UNVERIFIED_MESSAGE } from "../chat/prompts";
import { removedClaimsMessage } from "../chat/quotes";
import type GraphitePlugin from "../main";
import { findPreset } from "../providers/presets";
import type { ChatMessage } from "../providers/types";
import { renderAnswer } from "./answer";
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
  private bodyEl: HTMLElement | null = null;
  private outcome: AskOutcome | null = null;
  private question = "";
  private history: ChatMessage[] = [];
  private busy = false;

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
    this.bodyEl = root.createDiv({ cls: "graphite-body" });
    this.renderComposer(root);

    this.render();
    // The panel opens ready to type (spec: keyboard).
    this.input?.focus();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /**
   * Puts the cursor in the question box. Called after the leaf is revealed,
   * because revealing it moves focus and undoes the focus set in onOpen.
   */
  focusInput(): void {
    this.input?.focus();
  }

  /** Called when the index changes, so indexing progress stays current. */
  onIndexChanged(): void {
    if (!this.busy) this.render();
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
    send.setAttribute("aria-label", "Ask");
    setIcon(send, "arrow-right");
    send.addEventListener("click", () => void this.submit());
  }

  private reset(): void {
    this.outcome = null;
    this.question = "";
    this.history = [];
    if (this.input) this.input.value = "";
    this.render();
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

  private openNote = (notePath: string, newTab: boolean): void => {
    void this.app.workspace.openLinkText(notePath, "", newTab);
  };

  private render(): void {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();

    const progress = this.plugin.index.progress;
    if (progress.building && !this.busy) {
      this.setStatus(`Indexing your vault: ${progress.done} of ${progress.total} notes`);
    } else if (!this.busy) {
      this.setStatus("");
    }

    if (!this.outcome) {
      this.renderEmpty(body, progress.building);
      return;
    }

    switch (this.outcome.kind) {
      case "no-terms":
        this.renderNotice(body, "That question had no words to search for.", "Try naming a topic, a project or a person.");
        return;

      case "no-matches":
        this.renderNotice(
          body,
          "No notes matched that question.",
          this.outcome.terms.length > 0
            ? `Searched for: ${this.outcome.terms.join(", ")}`
            : "No searchable words in that question.",
        );
        return;

      case "search-only": {
        if (this.outcome.reason) {
          body.createDiv({ cls: "graphite-notice", text: this.outcome.reason });
        }
        body.createDiv({
          cls: "graphite-note",
          text: this.outcome.reason
            ? "Your search results are below."
            : `${this.outcome.notes.length} ${this.outcome.notes.length === 1 ? "note" : "notes"} matched. ${this.providerLine()}`,
        });
        renderResults(body, this.outcome.notes, { openNote: this.openNote });
        return;
      }

      case "unverified": {
        body.createDiv({ cls: "graphite-notice", text: UNVERIFIED_MESSAGE });
        const removed = removedClaimsMessage(this.outcome.removedCount);
        if (removed) body.createDiv({ cls: "graphite-removed", text: removed });
        body.createDiv({ cls: "graphite-note", text: "These notes matched your question:" });
        renderResults(body, this.outcome.notes, { openNote: this.openNote });
        return;
      }

      case "answered":
        renderAnswer(body, this.outcome.verified, this.outcome.notes, this.outcome.sent, {
          openNote: this.openNote,
        });
        return;
    }
  }

  private renderEmpty(body: HTMLElement, building: boolean): void {
    const empty = body.createDiv({ cls: "graphite-empty" });
    empty.createDiv({
      cls: "graphite-empty-lead",
      text: "Ask a question and Graphite answers from your notes, with a quote from each note it cites.",
    });
    empty.createDiv({ cls: "graphite-note", text: this.providerLine() });
    if (building) {
      empty.createDiv({
        cls: "graphite-note",
        text: "You can ask while indexing runs. Search uses the notes indexed so far.",
      });
    }
  }

  private renderNotice(body: HTMLElement, lead: string, detail: string): void {
    const notice = body.createDiv({ cls: "graphite-empty" });
    notice.createDiv({ cls: "graphite-empty-lead", text: lead });
    notice.createDiv({ cls: "graphite-note", text: detail });
  }

  private async submit(): Promise<void> {
    const question = this.input?.value.trim() ?? "";
    if (!question || this.busy) return;

    this.busy = true;
    this.question = question;
    if (this.input) this.input.value = "";

    try {
      this.outcome = await ask({
        question,
        history: this.history,
        provider: this.plugin.createProvider(),
        searchTerms: (terms, limit, ownTerms) => this.plugin.index.searchTerms(terms, limit, ownTerms),
        notesPerAnswer: this.plugin.settings.notesPerAnswer,
        expandQuestion: this.plugin.settings.expandQuestion,
        resolvesLink: (target) => this.plugin.resolvesLink(target, ""),
        onStep: (step) => this.setStatus(step),
      });
      this.rememberTurn();
    } finally {
      this.busy = false;
      this.setStatus("");
    }

    this.render();
  }

  /** Keeps the turn so a follow-up can narrow the previous answer (US-4). */
  private rememberTurn(): void {
    if (this.outcome?.kind !== "answered") return;
    this.history.push({ role: "user", content: this.question });
    this.history.push({ role: "assistant", content: this.outcome.verified.answer });
  }
}
