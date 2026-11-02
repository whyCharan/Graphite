/**
 * Writes `test-vault/` from the note definitions in `notes.ts`.
 *
 * The vault is generated rather than hand-maintained so it stays reproducible:
 * delete the folder, run this, and the evaluation corpus is identical.
 *
 * Run: node eval/generate-test-vault.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { TEST_NOTES } from "./notes.ts";

// Resolved from the working directory, so the script works whether it is run
// directly or bundled to a temporary file first.
const VAULT_ROOT = resolve(process.cwd(), "test-vault");

async function main(): Promise<void> {
  for (const note of TEST_NOTES) {
    const target = join(VAULT_ROOT, note.path);
    await mkdir(dirname(target), { recursive: true });
    // Normalised to LF, so the corpus is byte-identical across platforms.
    await writeFile(target, `${note.content.replace(/\r\n/g, "\n")}\n`, "utf8");
  }

  const folders = new Set(TEST_NOTES.map((note) => note.path.split("/")[0]));
  console.log(`Wrote ${TEST_NOTES.length} notes to test-vault/`);
  console.log(`Folders: ${[...folders].sort().join(", ")}`);
}

await main();
