import { Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_GRAPHITE } from "./ui/ChatView";

// Temporary built-in glyph until the ribbon icon is decided (spec Q7, task T18).
const RIBBON_ICON = "search";

export default class GraphitePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE_GRAPHITE, (leaf) => new ChatView(leaf));
    this.addRibbonIcon(RIBBON_ICON, "Open Graphite", () => this.openPanel());
    this.addCommand({
      id: "open-panel",
      name: "Open Graphite",
      callback: () => this.openPanel(),
    });
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
}
