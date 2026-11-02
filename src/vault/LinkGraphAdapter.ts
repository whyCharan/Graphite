import { TFile, type App } from "obsidian";
import type { LinkGraph } from "../search/graph";

/**
 * Obsidian's resolved-link map, shaped for the link boost.
 *
 * Only resolved links are used, so a link to a note that does not exist can
 * never introduce a result (spec: hallucination safeguards).
 */
export class MetadataLinkGraph implements LinkGraph {
  constructor(private readonly app: App) {}

  neighbors(notePath: string): readonly string[] {
    const { resolvedLinks } = this.app.metadataCache;
    const found = new Set<string>();

    for (const target of Object.keys(resolvedLinks[notePath] ?? {})) found.add(target);

    // Backlinks: resolvedLinks is keyed by source, so incoming links need a scan.
    for (const [source, targets] of Object.entries(resolvedLinks)) {
      if (source === notePath) continue;
      if (targets[notePath]) found.add(source);
    }

    found.delete(notePath);
    return [...found];
  }

  titleOf(notePath: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    return file instanceof TFile ? file.basename : null;
  }

  /** True when a wikilink target resolves to a real note, used by the quote check. */
  resolves(target: string, fromPath: string): boolean {
    return this.app.metadataCache.getFirstLinkpathDest(target, fromPath) !== null;
  }
}
