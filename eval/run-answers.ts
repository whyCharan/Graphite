/**
 * Answer evaluation against a live provider (success criteria 1, 1a and 3).
 *
 * Runs every evaluation question through the real pipeline: search, keyword
 * expansion, the provider and the quote check. Reports how many claims the
 * quote check removed, which is the figure that decides whether the check is
 * practical, and confirms unanswerable questions never reach the provider.
 *
 * The key is read from GROQ_API_KEY in the environment or in `.env`, which is
 * git-ignored. It is never printed.
 *
 * Run: node eval/run.mjs eval/run-answers.ts [--limit 35] [--no-expand] [--samples 3]
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ask, type AskOutcome } from "../src/chat/pipeline.ts";
import { OpenAiCompatibleProvider } from "../src/providers/openai.ts";
import type { HttpFetch } from "../src/providers/types.ts";
import { VaultIndex } from "../src/search/VaultIndex.ts";
import { EXCLUDED_FOLDER } from "./notes.ts";

interface Questions {
  answerable: Array<{ question: string; expected: string[] }>;
  unanswerable: Array<{ question: string }>;
}

const ROOT = resolve(process.cwd());
const VAULT_ROOT = join(ROOT, "test-vault");
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";

/** Spacing between questions, to stay inside the free tier's per-minute limit. */
const PAUSE_MS = 2500;
/** Wait before retrying a rate-limited question. */
const RATE_LIMIT_WAIT_MS = 20000;

function argValue(flag: string, fallback: number): number {
  const at = process.argv.indexOf(flag);
  if (at === -1) return fallback;
  const parsed = Number(process.argv[at + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function readKey(): Promise<string | null> {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
  try {
    const env = await readFile(join(ROOT, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => entry.startsWith("GROQ_API_KEY="));
    const value = line?.slice("GROQ_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

async function readModel(): Promise<string> {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL.trim();
  try {
    const env = await readFile(join(ROOT, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => entry.startsWith("GROQ_MODEL="));
    return line?.slice("GROQ_MODEL=".length).trim() || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/** Node's fetch stands in for Obsidian's requestUrl outside the app. */
const nodeHttp: HttpFetch = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(60000),
  });
  return { status: response.status, text: await response.text() };
};

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

function isRateLimited(outcome: AskOutcome): boolean {
  return outcome.kind === "search-only" && (outcome.reason ?? "").includes("rate limiting");
}

async function main(): Promise<void> {
  const key = await readKey();
  if (!key) {
    console.error("No key found. Add GROQ_API_KEY=... to .env in the project root, or set it in the environment.");
    process.exitCode = 1;
    return;
  }

  const model = await readModel();
  const expand = !process.argv.includes("--no-expand");
  const sampleCount = argValue("--samples", 3);

  const index = await buildIndex();
  const questions: Questions = JSON.parse(await readFile(join(ROOT, "eval", "questions.json"), "utf8"));
  const answerable = questions.answerable.slice(0, argValue("--limit", questions.answerable.length));

  // Calls are counted so the unanswerable check can prove no request was made.
  let calls = 0;
  const http: HttpFetch = async (request) => {
    calls += 1;
    return nodeHttp(request);
  };
  const provider = new OpenAiCompatibleProvider({ label: "Groq", baseUrl: GROQ_BASE_URL, model, apiKey: key, http });

  console.log(`Model: ${model}. Expansion: ${expand ? "on" : "off"}. Questions: ${answerable.length}\n`);

  try {
    await provider.testConnection();
  } catch (cause) {
    console.error(`Connection test failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
    return;
  }

  let answered = 0;
  let unverified = 0;
  let failed = 0;
  let keptClaims = 0;
  let removedClaims = 0;
  let expectedFound = 0;
  let sentTokens = 0;
  let receivedTokens = 0;
  const samples: string[] = [];
  const failures: string[] = [];

  for (const [position, item] of answerable.entries()) {
    let outcome: AskOutcome | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      outcome = await ask({
        question: item.question,
        history: [],
        provider,
        searchTerms: (terms, limit, ownTerms) => index.searchTerms(terms, limit, ownTerms),
        notesPerAnswer: 8,
        expandQuestion: expand,
        resolvesLink: () => false,
        onStep: () => {},
      });
      if (!isRateLimited(outcome)) break;
      console.log(`  rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000} s`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
    if (!outcome) continue;

    const notes = "notes" in outcome ? outcome.notes : [];
    if (notes.some((note) => item.expected.includes(note.notePath))) expectedFound += 1;

    let line = `${String(position + 1).padStart(2)}  ${outcome.kind.padEnd(11)}  ${item.question}`;

    if (outcome.kind === "answered") {
      answered += 1;
      keptClaims += outcome.verified.claims.length;
      removedClaims += outcome.verified.removedCount;
      sentTokens += outcome.sent.usage.sent ?? 0;
      receivedTokens += outcome.sent.usage.received ?? 0;
      line += `  (${outcome.verified.claims.length} kept, ${outcome.verified.removedCount} removed)`;
      if (samples.length < sampleCount) {
        const quotes = outcome.verified.claims
          .flatMap((claim) => claim.citations.filter((c) => c.verified).map((c) => `[${c.number}] "${c.quote}"`))
          .join("\n      ");
        samples.push(`Q: ${item.question}\n   A: ${outcome.verified.answer}\n      ${quotes}`);
      }
    } else if (outcome.kind === "unverified") {
      unverified += 1;
      removedClaims += outcome.removedCount;
      sentTokens += outcome.sent.usage.sent ?? 0;
      receivedTokens += outcome.sent.usage.received ?? 0;
      line += `  (${outcome.removedCount} removed)`;
    } else if (outcome.kind === "search-only") {
      failed += 1;
      failures.push(`${item.question}: ${outcome.reason ?? "no provider"}`);
    }

    console.log(line);
    await sleep(PAUSE_MS);
  }

  // Criterion 3: unanswerable questions must not reach the provider at all.
  let silent = 0;
  for (const item of questions.unanswerable) {
    const before = calls;
    const outcome = await ask({
      question: item.question,
      history: [],
      provider,
      searchTerms: (terms, limit, ownTerms) => index.searchTerms(terms, limit, ownTerms),
      notesPerAnswer: 8,
      // Expansion is off here so the call count measures only the answer call.
      expandQuestion: false,
      resolvesLink: () => false,
      onStep: () => {},
    });
    if (outcome.kind === "no-matches" && calls === before) silent += 1;
  }

  const totalClaims = keptClaims + removedClaims;
  const dropRate = totalClaims === 0 ? 0 : (removedClaims / totalClaims) * 100;

  console.log("\nResults");
  console.log(`  Answered with verified claims:   ${answered}/${answerable.length}`);
  console.log(`  Withheld (nothing verified):     ${unverified}/${answerable.length}`);
  console.log(`  Provider failed, search shown:   ${failed}/${answerable.length}`);
  console.log(`  Expected note retrieved:         ${expectedFound}/${answerable.length}`);
  console.log(`  Claims kept / removed:           ${keptClaims} / ${removedClaims}`);
  console.log(`  Claim drop rate:                 ${dropRate.toFixed(1)}%   (criterion 1a: 20% or less)`);
  console.log(`  Unanswerable, no provider call:  ${silent}/${questions.unanswerable.length}`);
  console.log(`  Tokens sent / received:          ${sentTokens} / ${receivedTokens}`);

  if (samples.length > 0) {
    console.log("\nSample answers (shown claims only, with their verified quotes)\n");
    for (const sample of samples) console.log(`${sample}\n`);
  }
  if (failures.length > 0) {
    console.log("Provider failures:");
    for (const failure of failures) console.log(`  ${failure}`);
  }

  const pass = totalClaims > 0 && dropRate <= 20 && silent === questions.unanswerable.length;
  console.log(`\nCriteria 1a and 3: ${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
}

await main();
