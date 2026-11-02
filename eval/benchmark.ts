/**
 * Performance benchmark (success criterion 4).
 *
 * Builds an index over a synthetic 5,000-note vault held in memory, never on
 * disk, and reports full index time and median search time.
 *
 * Run: node eval/run.mjs eval/benchmark.ts [--notes 5000] [--queries 30]
 */
import { VaultIndex } from "../src/search/VaultIndex.ts";
import type { NoteInput } from "../src/search/sections.ts";

const TOPICS = [
  "postgres", "elasticsearch", "kafka", "redis", "webhook", "parcel", "carrier",
  "migration", "replication", "latency", "throughput", "idempotency", "retention",
  "signature", "pooling", "caching", "rollback", "alerting", "onboarding", "pricing",
];

const FOLDERS = ["Decisions", "Engineering", "Security", "Product", "Runbooks", "Research"];

function argValue(flag: string, fallback: number): number {
  const at = process.argv.indexOf(flag);
  if (at === -1) return fallback;
  const parsed = Number(process.argv[at + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Deterministic generator, so a run is comparable with the one before it. */
function makeNote(position: number): NoteInput {
  const topic = TOPICS[position % TOPICS.length];
  const second = TOPICS[(position * 7 + 3) % TOPICS.length];
  const folder = FOLDERS[position % FOLDERS.length];
  const sections = 3 + (position % 5);

  const body: string[] = [`---\ntags: [${topic}, generated]\naliases: [note-${position}]\n---\n`];
  for (let section = 0; section < sections; section += 1) {
    body.push(`## ${topic} section ${section}`);
    body.push(
      `This section discusses ${topic} and its relationship to ${second}. ` +
        `Operational notes for case ${position}-${section} follow, covering thresholds, ` +
        `retries and the agreed behaviour when the ${second} path degrades. ` +
        "Additional filler keeps the section a realistic length for a working note.",
    );
    body.push("");
  }

  return {
    path: `${folder}/${topic}-${position}.md`,
    title: `${topic} ${position}`,
    content: body.join("\n"),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function main(): Promise<void> {
  const noteCount = argValue("--notes", 5000);
  const queryCount = argValue("--queries", 30);

  const notes = Array.from({ length: noteCount }, (_unused, position) => makeNote(position));

  const index = new VaultIndex();
  const buildStart = performance.now();
  index.beginBuild(noteCount);
  for (const note of notes) index.indexNote(note);
  index.endBuild();
  const buildMs = performance.now() - buildStart;

  const queries = Array.from(
    { length: queryCount },
    (_unused, n) => `${TOPICS[n % TOPICS.length]} ${TOPICS[(n * 3 + 1) % TOPICS.length]}`,
  );

  // One warm-up pass, so the first query does not carry JIT cost into the median.
  for (const query of queries) index.search(query, 8);

  const timings: number[] = [];
  for (const query of queries) {
    const start = performance.now();
    index.search(query, 8);
    timings.push(performance.now() - start);
  }

  const searchMedian = median(timings);
  const buildSeconds = buildMs / 1000;

  console.log(`Notes indexed:        ${index.noteCount}`);
  console.log(`Full index build:     ${buildSeconds.toFixed(2)} s   (target under 30 s)`);
  console.log(`Search median:        ${searchMedian.toFixed(2)} ms  (target under 100 ms)`);
  console.log(`Search slowest:       ${Math.max(...timings).toFixed(2)} ms`);

  const pass = buildSeconds < 30 && searchMedian < 100;
  console.log(`\nCriterion 4: ${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
}

await main();
