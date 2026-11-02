import type { Section } from "./types";

/** The note as the indexer receives it. No Obsidian types cross this boundary. */
export interface NoteInput {
  path: string;
  /** File name without extension, unless frontmatter gives a title. */
  title: string;
  content: string;
}

/**
 * Sections longer than this are split further, so one sprawling note cannot
 * send a 200 KB excerpt to a provider. Measured in characters because that is
 * what bounds the prompt, not term count.
 */
const MAX_SECTION_CHARS = 1500;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})\s+(.*)$/;
/** Inline tags. Excludes a bare "#" and anything starting with a digit, as Obsidian does. */
const INLINE_TAG = /(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu;

interface Frontmatter {
  body: string;
  aliases: string[];
  tags: string[];
  title: string | null;
}

/**
 * Reads the subset of YAML that Obsidian notes actually use for aliases and
 * tags: inline arrays, comma lists, and "- item" blocks. A full YAML parser
 * would be a dependency for three keys.
 */
function parseFrontmatter(content: string): Frontmatter {
  const match = FRONTMATTER.exec(content);
  if (!match) return { body: content, aliases: [], tags: [], title: null };

  const aliases: string[] = [];
  const tags: string[] = [];
  let title: string | null = null;
  let currentKey: "aliases" | "tags" | null = null;

  for (const line of match[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const value = unquote(listItem[1]);
      if (value) (currentKey === "aliases" ? aliases : tags).push(value);
      continue;
    }

    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;

    const key = pair[1].toLowerCase();
    const value = pair[2].trim();
    if (key === "alias" || key === "aliases") {
      currentKey = "aliases";
      aliases.push(...splitInline(value));
    } else if (key === "tag" || key === "tags") {
      currentKey = "tags";
      tags.push(...splitInline(value));
    } else {
      currentKey = null;
      if (key === "title" && value) title = unquote(value);
    }
  }

  return { body: content.slice(match[0].length), aliases, tags, title };
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function splitInline(value: string): string[] {
  const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return inner
    .split(",")
    .map(unquote)
    .filter((part) => part.length > 0);
}

/** Collects inline tags, which Obsidian treats as equal to frontmatter tags. */
function collectInlineTags(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(INLINE_TAG)) found.add(match[1]);
  return [...found];
}

/**
 * Splits an over-long body at paragraph boundaries, falling back to a hard cut
 * when a single paragraph exceeds the limit.
 */
function splitLongBody(body: string): string[] {
  if (body.length <= MAX_SECTION_CHARS) return [body];

  const parts: string[] = [];
  let current = "";
  for (const paragraph of body.split(/\n\s*\n/)) {
    if (paragraph.length > MAX_SECTION_CHARS) {
      if (current) {
        parts.push(current);
        current = "";
      }
      for (let at = 0; at < paragraph.length; at += MAX_SECTION_CHARS) {
        parts.push(paragraph.slice(at, at + MAX_SECTION_CHARS));
      }
      continue;
    }
    const joined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (joined.length > MAX_SECTION_CHARS) {
      parts.push(current);
      current = paragraph;
    } else {
      current = joined;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/**
 * Splits a note into indexable sections at its headings.
 *
 * A note always yields at least one section, even when empty, so that its
 * title, aliases and tags stay searchable.
 */
export function splitIntoSections(note: NoteInput): Section[] {
  const { body, aliases, tags, title: frontmatterTitle } = parseFrontmatter(note.content);
  const noteTitle = frontmatterTitle ?? note.title;
  const folder = folderOf(note.path);
  const allTags = [...new Set([...tags, ...collectInlineTags(body)])];

  const chunks: Array<{ heading: string; lines: string[] }> = [{ heading: "", lines: [] }];
  let inFence = false;

  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      chunks[chunks.length - 1].lines.push(line);
      continue;
    }
    // A "#" inside a fenced block is code, not a heading.
    const heading = inFence ? null : HEADING.exec(line);
    if (heading) {
      chunks.push({ heading: heading[2].trim(), lines: [] });
    } else {
      chunks[chunks.length - 1].lines.push(line);
    }
  }

  const sections: Section[] = [];
  for (const chunk of chunks) {
    const text = chunk.lines.join("\n").trim();
    if (!text && !chunk.heading && chunks.length > 1) continue;
    for (const part of splitLongBody(text)) {
      sections.push({
        id: `${note.path}#${sections.length}`,
        notePath: note.path,
        noteTitle,
        folder,
        heading: chunk.heading,
        aliases,
        tags: allTags,
        body: part,
      });
    }
  }

  if (sections.length === 0) {
    sections.push({
      id: `${note.path}#0`,
      notePath: note.path,
      noteTitle,
      folder,
      heading: "",
      aliases,
      tags: allTags,
      body: "",
    });
  }

  return sections;
}
