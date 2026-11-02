/**
 * Runs an evaluation script written in TypeScript.
 *
 * The scripts import from `src/`, which uses extensionless imports that Node's
 * ESM resolver rejects. Bundling with esbuild (already a build dependency)
 * keeps the production source free of tooling concessions.
 *
 * Usage: node eval/run.mjs eval/run-retrieval.ts [args...]
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) {
  console.error("Usage: node eval/run.mjs <entry.ts> [args...]");
  process.exit(1);
}

const directory = await mkdtemp(join(tmpdir(), "graphite-eval-"));
const outfile = join(directory, "eval.mjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Only Obsidian is external; the pure core has no runtime dependencies.
  external: ["obsidian"],
  logLevel: "warning",
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}
