/**
 * Retrieval evaluation (success criterion 2 and 3).
 *
 * Indexes `test-vault/` with the real search core and reports how often an
 * expected note lands in the top results, and whether questions the vault
 * cannot answer correctly return nothing.
 *
 * Run: node eval/run-retrieval.ts [--top 8] [--verbose]
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { VaultIndex } from "../src/search/VaultIndex.ts";
import { EXCLUDED_FOLDER } from "./notes.ts";

interface Questions {
  answerable: Array<{ question: string; expected: string[] }>;
  unanswerable: Array<{ question: string }>;
}

// Resolved from the working directory rather than the module's own, because
// the script is bundled to a temporary file before it runs.
const ROOT = resolve(process.cwd());
const VAULT_ROOT = join(ROOT, "test-vault");
const EVAL_ROOT = join(ROOT, "eval");

function argValue(flag: string, fallback: number): number {
  const at = process.argv.indexOf(flag);
  if (at === -1) return fallback;
  const parsed = Number(process.argv[at + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory)) {
    const full = join(directory, entry);
    if ((await stat(full)).isDirectory()) found.push(...(await markdownFiles(full)));
    else if (entry.endsWith(".md")) found.push(full);
  }
  return found;
}

async function buildIndex(): Promise<VaultIndex> {
  const index = new VaultIndex();
  index.setExcludedFolders([EXCLUDED_FOLDER]);

  for (const file of await markdownFiles(VAULT_ROOT)) {
    const path = relative(VAULT_ROOT, file).replace(/\\/g, "/");
    const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
    index.indexNote({ path, title, content: await readFile(file, "utf8") });
  }
  return index;
}

async function main(): Promise<void> {
  const top = argValue("--top", 8);
  const verbose = process.argv.includes("--verbose");

  const index = await buildIndex();
  const questions: Questions = JSON.parse(
    await readFile(join(EVAL_ROOT, "questions.json"), "utf8"),
  );

  console.log(`Indexed ${index.noteCount} notes (excluding ${EXCLUDED_FOLDER}/)\n`);

  let found = 0;
  const misses: string[] = [];

  for (const item of questions.answerable) {
    const notes = index.search(item.question, top).notes;
    const paths = notes.map((note) => note.notePath);
    const hit = item.expected.some((expected) => paths.includes(expected));

    if (hit) found += 1;
    else misses.push(item.question);

    if (verbose) {
      const rank = paths.findIndex((path) => item.expected.includes(path));
      console.log(`${hit ? "hit " : "MISS"}  rank ${rank === -1 ? "-" : rank + 1}  ${item.question}`);
      if (!hit) console.log(`        got: ${paths.slice(0, 3).join(", ") || "nothing"}`);
    }
  }

  let quiet = 0;
  const falsePositives: string[] = [];
  for (const item of questions.unanswerable) {
    const notes = index.search(item.question, top).notes;
    if (notes.length === 0) quiet += 1;
    else falsePositives.push(`${item.question} -> ${notes[0].notePath}`);
  }

  const excludedLeak = questions.answerable.some((item) =>
    index
      .search(item.question, top)
      .notes.some((note) => note.notePath.startsWith(`${EXCLUDED_FOLDER}/`)),
  );

  const total = questions.answerable.length;
  console.log(`\nRetrieval: ${found}/${total} questions have an expected note in the top ${top}`);
  console.log(`No-match honesty: ${quiet}/${questions.unanswerable.length} unanswerable questions returned nothing`);
  console.log(`Excluded folder leaked into results: ${excludedLeak ? "YES" : "no"}`);

  if (misses.length > 0) {
    console.log(`\nMissed (${misses.length}):`);
    for (const question of misses) console.log(`  ${question}`);
  }
  if (falsePositives.length > 0) {
    console.log(`\nAnswered when it should not have (${falsePositives.length}):`);
    for (const line of falsePositives) console.log(`  ${line}`);
  }

  // Criterion 2 is stated against 30 questions; scale it to however many exist.
  const target = Math.ceil((25 / 30) * total);
  const pass = found >= target && !excludedLeak;
  console.log(`\nCriterion 2 target: ${target}/${total}. ${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
}

await main();
