import { TFile, type App, type Plugin } from "obsidian";
import type { VaultIndex } from "../search/VaultIndex";
import type { NoteInput } from "../search/sections";

/**
 * Delay before a change is re-indexed. Long enough to coalesce the burst of
 * modify events Obsidian fires while typing, well inside the 2 second budget
 * the spec sets for a change to show up in search.
 */
const REINDEX_DELAY_MS = 400;

/** How often the panel is told about build progress, in notes. */
const PROGRESS_STRIDE = 25;

/**
 * Connects Obsidian's vault to the pure {@link VaultIndex}.
 *
 * Everything Obsidian-shaped stops here: the index itself never sees a TFile,
 * so its ranking and exclusion logic stays testable without the app.
 */
export class VaultIndexer {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: (() => void) | null = null;

  constructor(
    private readonly app: App,
    private readonly index: VaultIndex,
  ) {}

  /** Registers a callback fired whenever the index changes, so the panel can refresh. */
  setChangeListener(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  private async toNoteInput(file: TFile): Promise<NoteInput> {
    return {
      path: file.path,
      title: file.basename,
      // cachedRead is the read Obsidian recommends when the content is not being edited.
      content: await this.app.vault.cachedRead(file),
    };
  }

  /** Indexes every Markdown note. Safe to call again; it replaces what is there. */
  async buildAll(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    this.index.clear();
    this.index.beginBuild(files.length);
    this.onChange?.();

    for (const [position, file] of files.entries()) {
      if (this.index.isExcluded(file.path)) continue;
      this.index.indexNote(await this.toNoteInput(file));
      // Yield periodically so a large vault does not freeze the UI thread.
      if (position % PROGRESS_STRIDE === 0) {
        this.onChange?.();
        await Promise.resolve();
      }
    }

    this.index.endBuild();
    this.onChange?.();
  }

  /** Re-indexes after the exclusion list changes, without a restart (US-11). */
  async applyExclusions(folders: readonly string[]): Promise<void> {
    if (!this.index.setExcludedFolders(folders)) return;
    await this.buildAll();
  }

  private schedule(path: string, work: () => Promise<void> | void): void {
    const existing = this.pending.get(path);
    if (existing) clearTimeout(existing);
    this.pending.set(
      path,
      setTimeout(() => {
        this.pending.delete(path);
        void Promise.resolve(work()).then(() => this.onChange?.());
      }, REINDEX_DELAY_MS),
    );
  }

  /** Subscribes to vault events. The plugin owns the lifetime through registerEvent. */
  registerVaultEvents(plugin: Plugin): void {
    const { vault } = this.app;

    plugin.registerEvent(
      vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.schedule(file.path, async () => {
            this.index.indexNote(await this.toNoteInput(file));
          });
        }
      }),
    );

    plugin.registerEvent(
      vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.schedule(file.path, async () => {
            this.index.indexNote(await this.toNoteInput(file));
          });
        }
      }),
    );

    plugin.registerEvent(
      vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.schedule(file.path, () => {
            this.index.removeNote(file.path);
          });
        }
      }),
    );

    plugin.registerEvent(
      vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          this.schedule(file.path, async () => {
            this.index.renameNote(oldPath, await this.toNoteInput(file));
          });
        }
      }),
    );
  }

  /** Cancels pending re-index timers so none fire after the plugin unloads. */
  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.onChange = null;
  }
}
