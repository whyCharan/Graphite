import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_GRAPHITE = "graphite-chat";

/** The Graphite side panel. Search and answers are added in later tasks (T5, T9). */
export class ChatView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
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
    this.contentEl.empty();
    this.contentEl.createEl("h4", { text: "Graphite" });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
