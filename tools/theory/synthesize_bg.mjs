/**
 * synthesize_bg.mjs — the build-time Bulgarian voice renderer (doc 81 §3.3).
 *
 * THE ARCHITECTURAL DECISION THIS FILE IS. Pre-synthesise the entire authored
 * corpus at build time; never call a TTS API for authored content at runtime.
 * Three consequences, and the middle one is the reason this is worth writing
 * before anyone has even chosen a vendor:
 *
 *  1. Marginal cost per student for the explanation track is $0.00. The whole
 *     corpus is 713,505 chars ≈ $10.70 once, on Azure's $15/1M meter — inside
 *     the 0.5M chars/month free tier if it is split across two months.
 *  2. It is ADR-002 grounding BY CONSTRUCTION. The bytes a student hears are a
 *     fixed rendering of reviewed, lawRefs-cited, `status: "approved"` content.
 *     No model is in the loop at playback, so no model CAN free-recall
 *     Bulgarian law into a 17-year-old's ears. That is a stronger guarantee
 *     than the chat path's prompt discipline, not a weaker one — the chat path
 *     forbids invention, this path makes invention impossible.
 *  3. It is ADR-004-clean and stays clean while two lines hold: TTS is
 *     output-only (we send our own authored Bulgarian text, no PII leaves the
 *     box, nothing is captured), NO voice cloning (a cloned voice is a
 *     voiceprint = biometric), and NO speech-to-text at launch.
 *
 * ⚠ NOTHING HERE HAS EVER SPOKEN A WORD. The voice audition (doc 81 §3.4, item
 * 2.0) is a hard GATE that has not been run: no bg-BG voice from any vendor has
 * been heard by a native ear, and „the vendor's language list says Bulgarian"
 * is not evidence for a language this small. So this script REFUSES to spend
 * money unless it is told to twice — credentials in the environment AND
 * `--allow-spend` on the command line — and falls back to a dry-run transport
 * that exercises every other step. Everything downstream (hashing, dedupe,
 * incremental rendering, the manifest, pruning, cost accounting) is therefore
 * testable today, and adding credentials is the only step left.
 *
 * WHAT IT WALKS. `content/questions/*.json`, and only the three fields a
 * student would ever hear spoken: `textBg`, every option's `textBg`, and
 * `explanationBg`. That is exactly the 713,505 chars doc 81 §1.2 measured
 * (109,903 + 277,566 + 326,036). `status: "approved"` only — an unreviewed
 * string must not become audio, because audio is the surface a student cannot
 * skim past and cannot see the „draft" badge on.
 *
 * KEYED BY CONTENT HASH. The output filename is a hash of everything that can
 * change the bytes: the text, the provider, the voice, the audio format and
 * the text-pipeline version. So a re-run re-synthesises only what actually
 * changed, an edited explanation costs one call, and swapping the voice
 * correctly invalidates all 3,183 files at once. Identical strings (the bank
 * has a lot of „Да" and „Не") collapse to one file for free.
 *
 * CLI
 *   node tools/theory/synthesize_bg.mjs                  plan + render (dry-run)
 *   node tools/theory/synthesize_bg.mjs --plan           report only, write nothing
 *   node tools/theory/synthesize_bg.mjs --allow-spend    arm the paid provider
 *   node tools/theory/synthesize_bg.mjs --prune          delete orphaned files
 *   node tools/theory/synthesize_bg.mjs --limit 9        the §3.4 audition subset
 *   node tools/theory/synthesize_bg.mjs --match "промил" only matching utterances
 *   node tools/theory/synthesize_bg.mjs --out <dir>      default build/tutor-audio
 *
 * ENV — read from the shell, or backfilled from `platform/.env` (loadEnv)
 *   TUTOR_TTS_PROVIDER   azure (default) | dryrun
 *   TUTOR_TTS_VOICE      default bg-BG-KalinaNeural
 *   AZURE_SPEECH_KEY     absent => dry-run, always, whatever else is set
 *   AZURE_SPEECH_REGION  default westeurope (where the $15/1M price was read)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
const QUESTIONS_DIR = path.join(REPO_ROOT, "content", "questions");

/**
 * Default output. `build/` is gitignored at the repo root, and that is
 * deliberate: 713,505 chars ≈ 11.9 hours of speech ≈ ~128-171 MB at 24-32 kbps
 * Opus. It belongs on R2/CDN, NOT in `platform/public/` — the production
 * payload is already ~189.7 MB against a 140 MB `clips-video` ceiling
 * (tools/assets/publicBudget.mjs), and every byte under public/ is `git reset
 * --hard`-ed onto the VPS by deploy.sh. Only the ~5 MB in-drive track (the sim
 * rule catalog, once it has its ≤6-word `hudBg` lines from doc 81 §4.4) is
 * small enough to earn a `tutor-audio` bucket in public/.
 */
export const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "build", "tutor-audio");
export const MANIFEST_NAME = "manifest.json";

/** Bumped whenever the manifest's shape changes in a way a reader must notice. */
export const MANIFEST_VERSION = 1;

/**
 * TEXT PIPELINE VERSION — the hook that makes doc 81 item 2.2 cheap later.
 *
 * Bulgarian is NOT on Azure's `<say-as interpret-as="cardinal">` language list,
 * so „0,5 промила", „50 км/ч", „ЗДвП чл. 174" and „ППЗДвП" have to be expanded
 * into Bulgarian words by our own normaliser plus a bg-BG PLS lexicon. That is
 * a 12-hour authoring job (item 2.2) that must not be half-built here: a
 * normaliser that handles four of the seven cases is worse than none, because
 * it hides the other three.
 *
 * Version 0 therefore does nothing but collapse whitespace. When the real
 * normaliser lands, bumping this constant re-renders every single file — which
 * is exactly right, because every file's pronunciation will have changed.
 */
export const TEXT_PIPELINE_VERSION = 0;

/**
 * Azure AI Speech, `westeurope`, meter „S1 Neural Text To Speech Characters",
 * read from the Azure Retail Prices API for doc 81 §3.1. Kept here so the
 * script can refuse to spend without first saying what it would cost.
 */
export const USD_PER_MILLION_CHARS = 15.0;

/** Azure's free tier. Crossing it in one run is a thing to be told about. */
export const FREE_TIER_CHARS_PER_MONTH = 500_000;

export const DEFAULT_VOICE = "bg-BG-KalinaNeural";
export const DEFAULT_REGION = "westeurope";

// ---------------------------------------------------------------------------
// The corpus — what a student can hear, and nothing else
// ---------------------------------------------------------------------------

/**
 * One thing to be spoken.
 *
 * `id` is the runtime lookup key and must stay stable across renders: the
 * manifest maps it to a hash, and a player resolves id → hash → file. Encoding
 * the source position in the id (rather than an ordinal) is what lets a
 * question be inserted, reordered or removed without invalidating its
 * neighbours' audio.
 *
 * @typedef {object} Utterance
 * @property {string} id      e.g. "q-alkohol-i-godnost-001:explain"
 * @property {string} text    the authored Bulgarian, whitespace-normalised
 * @property {"question"|"option"|"explanation"} kind
 */

/** Read the whole question bank, sorted by file then by stored order. */
export function readQuestionBank(root = REPO_ROOT) {
  const dir = path.join(root, "content", "questions");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const out = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions)) {
      throw new Error(`content/questions/${file}: expected an array of questions`);
    }
    out.push(...questions);
  }
  return out;
}

/**
 * Whitespace-normalise. See TEXT_PIPELINE_VERSION for why this is all it does.
 * Newlines and doubled spaces are invisible on screen but are real input to a
 * synthesiser, and they would also split the content hash on a cosmetic edit.
 */
export function prepareUtteranceText(raw) {
  return String(raw).replace(/\s+/g, " ").trim();
}

/**
 * Questions → utterances.
 *
 * The `status` gate is the ADR-002 argument in one line: only reviewed,
 * law-cited content becomes audio. Today that is 1,005 of the 1,089 items; the
 * 84 `needs-review` ones simply have no voice until a human approves them, and
 * the player falls back to text — which is the correct failure mode, because a
 * student can see that text is text.
 */
export function utterancesFromQuestions(questions, { statuses = ["approved"] } = {}) {
  const allowed = new Set(statuses);
  const out = [];
  const seenIds = new Set();

  for (const q of questions) {
    if (!allowed.has(q.status)) continue;
    if (seenIds.has(q.id)) throw new Error(`duplicate question id "${q.id}"`);
    seenIds.add(q.id);

    const push = (suffix, kind, raw) => {
      const text = prepareUtteranceText(raw ?? "");
      if (text.length === 0) return; // an absent explanation is not an error
      out.push({ id: `${q.id}:${suffix}`, text, kind });
    };

    push("text", "question", q.textBg);
    for (const option of q.options ?? []) {
      push(`opt:${option.id}`, "option", option.textBg);
    }
    push("explain", "explanation", q.explanationBg);
  }

  // Deterministic order so a plan, a manifest and a --limit subset are all
  // reproducible; the whole point of content-hash keying is that two runs of
  // the same input do the same work.
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** The corpus, from disk. */
export function collectUtterances(root = REPO_ROOT, options) {
  return utterancesFromQuestions(readQuestionBank(root), options);
}

// ---------------------------------------------------------------------------
// Content-hash keying — why a re-run is nearly free
// ---------------------------------------------------------------------------

/**
 * Everything that can change the produced bytes, in one string.
 *
 * Leaving any of these OUT is the classic build-cache bug: change the voice,
 * get the old voice back, and spend an afternoon convincing yourself the vendor
 * is broken. The text goes last so a truncated key can still be read by eye.
 */
export function utteranceKey({ text, provider, voice, format, pipeline }) {
  return [
    `provider=${provider}`,
    `voice=${voice}`,
    `format=${format}`,
    `pipeline=${pipeline}`,
    `text=${text}`,
  ].join("\n");
}

/** 128 bits of SHA-256, hex. Collision risk over ~3,200 files is nil. */
export function contentHash(key) {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 32);
}

export function hashUtterance(utterance, provider) {
  return contentHash(
    utteranceKey({
      text: utterance.text,
      provider: provider.id,
      voice: provider.voice,
      format: provider.format.ext,
      pipeline: TEXT_PIPELINE_VERSION,
    }),
  );
}

// ---------------------------------------------------------------------------
// The provider seam — one function is the entire vendor decision
// ---------------------------------------------------------------------------

/**
 * A synthesiser. Mirrors the `TutorModel` seam (modules/tutor/model.ts): a
 * minimal interface, one default implementation, injectable for tests — so
 * doc 81 §3.4's contingency ladder („Kalina is flat, another vendor is warmer →
 * switch vendor, keep the architecture") costs one file, not a rewrite.
 *
 * `emitsVisemes` is on the interface rather than assumed, because it is the
 * ONLY reason to be on Azure at all: bg-BG gets 22 viseme IDs with 100-ns-tick
 * offsets free on the same call, and Bulgarian gets neither ARKit blend shapes
 * nor SVG. If a warmer vendor wins the audition, mouth timings are recoverable
 * offline with Rhubarb Lip Sync over the same WAV — so this flag records what
 * the pipeline got, it does not lock the vendor in.
 *
 * @typedef {object} SpeechProvider
 * @property {string} id
 * @property {string} voice
 * @property {{ext: string, mime: string}} format
 * @property {boolean} costsMoney   true => the spend guard applies
 * @property {boolean} emitsVisemes
 * @property {(text: string) => Promise<{audio: Uint8Array, visemes: unknown[] | null}>} synthesize
 */

/**
 * The NO-OP transport. Not a mock in a test file — the DEFAULT, and the thing
 * every developer and every CI run uses, because the audition gate has not been
 * passed and nobody should be able to spend money by cloning the repo.
 *
 * It writes a real file so the incremental / manifest / prune / dedupe paths
 * are genuinely exercised, and writes something that could never be mistaken
 * for audio: extension `.dry`, and a body naming what is missing. The bytes are
 * a pure function of the text, so two runs produce identical output.
 */
export function createDryRunProvider({ voice = DEFAULT_VOICE, reason = "" } = {}) {
  return {
    id: "dryrun",
    voice,
    format: { ext: "dry", mime: "text/plain" },
    costsMoney: false,
    emitsVisemes: false,
    reason,
    async synthesize(text) {
      const body =
        `DRY RUN — no audio was synthesised.\n` +
        `voice=${voice} chars=${[...text].length}\n` +
        `Run the voice audition first (docs/ai/81_AI_TUTOR_STRATEGY.md §3.4).\n`;
      return { audio: new TextEncoder().encode(body), visemes: null };
    },
  };
}

/** XML-escape SSML text. Transport concern, not pronunciation — see §2.2. */
export function escapeSsml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSsml(text, voice, lang = "bg-BG") {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}">${escapeSsml(text)}</voice>` +
    `</speak>`
  );
}

/**
 * Azure AI Speech over the REST endpoint.
 *
 * ⚠ HONEST LIMITATION, stated here rather than discovered later: the REST
 * endpoint returns AUDIO ONLY. Azure's viseme events arrive on the Speech
 * SDK's WebSocket channel (`SpeechSynthesizer.visemeReceived`), so
 * `emitsVisemes` is false for this transport and the manifest records it. That
 * costs nothing today — lip-sync is doc 81 v3, conditional on the voice being
 * good — and when it is wanted, the fix is a second provider in this file
 * using `microsoft-cognitiveservices-speech-sdk`, with no change anywhere else.
 *
 * `ogg-48khz-16bit-mono-opus` is the format doc 81 §3.2 sized the corpus at.
 */
export function createAzureProvider({
  key,
  region = DEFAULT_REGION,
  voice = DEFAULT_VOICE,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!key) throw new Error("createAzureProvider: AZURE_SPEECH_KEY is required");
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  return {
    id: "azure",
    voice,
    format: { ext: "opus", mime: "audio/ogg" },
    costsMoney: true,
    emitsVisemes: false,
    async synthesize(text) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "ogg-48khz-16bit-mono-opus",
          // Azure asks for one; an unnamed client is the first thing their
          // throttling documentation tells you to fix.
          "User-Agent": "knijka-ai-tutor-synth",
        },
        body: buildSsml(text, voice),
      });
      if (!response.ok) {
        throw new Error(
          `Azure TTS ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }
      return { audio: new Uint8Array(await response.arrayBuffer()), visemes: null };
    },
  };
}

/**
 * THE VENDOR DECISION, as a function.
 *
 * Two independent brakes, and both must be released:
 *  - credentials must exist in the environment, and
 *  - `--allow-spend` must be passed.
 * Missing either one gives the dry-run transport with a `reason` the CLI
 * prints. A test suite, a CI run and a fresh clone therefore CANNOT call a paid
 * API even if a key leaks into the environment, which is the property doc 81
 * §3.4 needs while the audition is still outstanding.
 */
/**
 * The keys this script reads out of `platform/.env`, and nothing else.
 *
 * WHY THIS EXISTS. The script runs from the repo root (`node
 * tools/theory/synthesize_bg.mjs`), so nothing loads `platform/.env` — the file
 * where every other secret in this product already lives. Without this, setting
 * AZURE_SPEECH_KEY in the obvious place produces „AZURE_SPEECH_KEY is not set",
 * and the founder debugs the wrong thing.
 *
 * The allow-list is the point: a build script has no business inheriting
 * DATABASE_URL or STRIPE_SECRET_KEY because it happened to parse the file they
 * share. A real environment variable always wins over the file, so CI and a
 * one-off `AZURE_SPEECH_KEY=… node …` still behave exactly as written.
 */
const ENV_FILE_KEYS = [
  "TUTOR_TTS_PROVIDER",
  "TUTOR_TTS_VOICE",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
];

/** Minimal `KEY="value"` reader — no dependency, no interpolation, no export. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
  }
  return out;
}

/** process.env, backfilled from platform/.env for the keys above only. */
export function loadEnv(env = process.env, root = REPO_ROOT) {
  const file = path.join(root, "platform", ".env");
  if (!fs.existsSync(file)) return { ...env };
  const parsed = parseEnvFile(fs.readFileSync(file, "utf8"));
  const merged = { ...env };
  for (const key of ENV_FILE_KEYS) {
    if ((merged[key] ?? "").trim().length === 0 && parsed[key] !== undefined) {
      merged[key] = parsed[key];
    }
  }
  return merged;
}

export function selectProvider(env = process.env, { allowSpend = false, fetchImpl } = {}) {
  const requested = (env.TUTOR_TTS_PROVIDER ?? "azure").trim().toLowerCase();
  const voice = (env.TUTOR_TTS_VOICE ?? "").trim() || DEFAULT_VOICE;

  if (requested === "dryrun") {
    return createDryRunProvider({ voice, reason: "TUTOR_TTS_PROVIDER=dryrun" });
  }
  if (requested !== "azure") {
    return createDryRunProvider({
      voice,
      reason: `unknown TUTOR_TTS_PROVIDER "${requested}" (known: azure, dryrun)`,
    });
  }

  const key = (env.AZURE_SPEECH_KEY ?? "").trim();
  if (key.length === 0) {
    return createDryRunProvider({ voice, reason: "AZURE_SPEECH_KEY is not set" });
  }
  if (!allowSpend) {
    return createDryRunProvider({
      voice,
      reason: "credentials found but --allow-spend was not passed",
    });
  }
  return createAzureProvider({
    key,
    region: (env.AZURE_SPEECH_REGION ?? "").trim() || DEFAULT_REGION,
    voice,
    fetchImpl,
  });
}

// ---------------------------------------------------------------------------
// Plan → render → manifest
// ---------------------------------------------------------------------------

export function usdForChars(chars) {
  return (chars / 1_000_000) * USD_PER_MILLION_CHARS;
}

/**
 * Decide what a run would do, without doing any of it.
 *
 * `--plan` prints this and stops, which is how the founder sees the bill before
 * agreeing to it. Note that `chars` counts only what would actually be SENT:
 * an incremental run over an edited explanation is one call, not 3,183, and
 * duplicate strings are billed once because they hash to one file.
 */
export function planRender({ utterances, provider, existingHashes = new Set() }) {
  const jobs = new Map(); // hash -> { hash, text, chars, ids[] }
  let reusedIds = 0;

  for (const utterance of utterances) {
    const hash = hashUtterance(utterance, provider);
    if (existingHashes.has(hash)) {
      reusedIds += 1;
      continue;
    }
    const job = jobs.get(hash);
    if (job) job.ids.push(utterance.id);
    else jobs.set(hash, { hash, text: utterance.text, chars: [...utterance.text].length, ids: [utterance.id] });
  }

  const list = [...jobs.values()].sort((a, b) => (a.hash < b.hash ? -1 : 1));
  const chars = list.reduce((n, j) => n + j.chars, 0);
  return {
    jobs: list,
    reusedIds,
    totalIds: utterances.length,
    chars,
    estUsd: usdForChars(chars),
  };
}

const HASH_FILE_RE = /^([0-9a-f]{32})\.([a-z0-9]+)$/;

/** Hashes already rendered in `dir` for this provider's format. */
export function readExistingHashes(dir, ext) {
  if (!fs.existsSync(dir)) return new Set();
  const out = new Set();
  for (const name of fs.readdirSync(dir)) {
    const m = HASH_FILE_RE.exec(name);
    if (m && m[2] === ext) out.add(m[1]);
  }
  return out;
}

/**
 * The manifest a runtime player reads: utterance id → file.
 *
 * Deliberately free of timestamps and of anything else that varies run to run.
 * A no-op re-render must produce a BYTE-IDENTICAL manifest, or „nothing
 * changed" is unprovable and every render becomes a diff to review.
 */
export function buildManifest({ utterances, provider, hashes, sizes }) {
  const entries = {};
  const files = {};
  for (const utterance of utterances) {
    const hash = hashes.get(utterance.id);
    entries[utterance.id] = hash;
    if (!files[hash]) {
      files[hash] = {
        file: `${hash}.${provider.format.ext}`,
        chars: [...utterance.text].length,
        bytes: sizes.get(hash) ?? 0,
      };
    }
  }
  const sortObject = (o) =>
    Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

  return {
    version: MANIFEST_VERSION,
    provider: provider.id,
    voice: provider.voice,
    format: provider.format,
    // A player must know whether it can drive a mouth from this render, and a
    // future re-render must be able to say „these files predate visemes".
    visemes: provider.emitsVisemes,
    textPipeline: TEXT_PIPELINE_VERSION,
    utterances: sortObject(entries),
    files: sortObject(files),
  };
}

/**
 * Render the plan.
 *
 * Sequential on purpose. This is a build step that runs a handful of times in
 * the product's life, the whole corpus is ~$10.70, and a parallel fan-out at a
 * vendor whose rate limits nobody has measured buys minutes while risking a
 * half-written cache. `onProgress` exists so the CLI can show a line; the
 * function itself prints nothing, so it is usable from a test.
 */
export async function renderCorpus({
  utterances,
  provider,
  outDir,
  prune = false,
  onProgress = () => {},
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const existing = readExistingHashes(outDir, provider.format.ext);
  const plan = planRender({ utterances, provider, existingHashes: existing });

  let done = 0;
  for (const job of plan.jobs) {
    const { audio } = await provider.synthesize(job.text);
    fs.writeFileSync(path.join(outDir, `${job.hash}.${provider.format.ext}`), audio);
    done += 1;
    onProgress({ done, total: plan.jobs.length, job });
  }

  // Sizes are read back from disk rather than from the buffer we just wrote, so
  // the manifest describes what is actually there — including files reused from
  // a previous run, which we never held in memory.
  const hashes = new Map();
  const sizes = new Map();
  for (const utterance of utterances) {
    const hash = hashUtterance(utterance, provider);
    hashes.set(utterance.id, hash);
    if (!sizes.has(hash)) {
      const file = path.join(outDir, `${hash}.${provider.format.ext}`);
      sizes.set(hash, fs.existsSync(file) ? fs.statSync(file).size : 0);
    }
  }

  const live = new Set(hashes.values());
  const orphans = [];
  for (const name of fs.readdirSync(outDir)) {
    const m = HASH_FILE_RE.exec(name);
    if (!m || live.has(m[1])) continue;
    orphans.push(name);
    if (prune) fs.unlinkSync(path.join(outDir, name));
  }

  const manifest = buildManifest({ utterances, provider, hashes, sizes });
  fs.writeFileSync(
    path.join(outDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return {
    manifest,
    synthesised: plan.jobs.length,
    reusedIds: plan.reusedIds,
    chars: plan.chars,
    // `usd` is what was ACTUALLY spent — zero on the dry-run transport, which
    // is the whole point of it. `estUsd` is what the same run would have cost
    // at a paying vendor, and it is the number the founder needs to see BEFORE
    // arming one. Reporting the estimate as spend is how a dry run quietly
    // stops being reassuring.
    usd: provider.costsMoney ? plan.estUsd : 0,
    estUsd: plan.estUsd,
    orphans,
    pruned: prune ? orphans.length : 0,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    plan: false,
    allowSpend: false,
    prune: false,
    limit: null,
    match: null,
    out: DEFAULT_OUT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") args.plan = true;
    else if (arg === "--allow-spend") args.allowSpend = true;
    else if (arg === "--prune") args.prune = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--match") args.match = argv[++i];
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit expects a positive integer");
  }
  return args;
}

/**
 * `--match` + `--limit` exist for the audition (doc 81 §3.4): three real
 * explanations containing article numbers, „промила" and „км/ч", synthesised on
 * each candidate vendor and played to five 17-year-olds. Those are the strings
 * that decide whether this product has a voice at all, so getting at them must
 * not require editing the script.
 */
export function selectSubset(utterances, { match = null, limit = null } = {}) {
  let out = utterances;
  if (match) {
    const re = new RegExp(match, "i");
    out = out.filter((u) => re.test(u.text));
  }
  if (limit !== null) out = out.slice(0, limit);
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const provider = selectProvider(loadEnv(), { allowSpend: args.allowSpend });
  const all = collectUtterances();
  const utterances = selectSubset(all, args);

  console.log(`corpus     ${all.length} utterances (approved questions only)`);
  if (utterances.length !== all.length) {
    console.log(`subset     ${utterances.length} after --match/--limit`);
  }
  console.log(`provider   ${provider.id} · voice ${provider.voice} · .${provider.format.ext}`);
  if (provider.reason) {
    console.log(`           DRY RUN — ${provider.reason}`);
    console.log(`           to arm: set AZURE_SPEECH_KEY and pass --allow-spend`);
  }

  const existing = readExistingHashes(args.out, provider.format.ext);
  const plan = planRender({ utterances, provider, existingHashes: existing });
  console.log(
    `plan       ${plan.jobs.length} to synthesise · ${plan.reusedIds}/${plan.totalIds} ids reused · ` +
      `${plan.chars.toLocaleString("en-US")} chars · $${plan.estUsd.toFixed(2)}`,
  );
  if (plan.chars > FREE_TIER_CHARS_PER_MONTH) {
    console.log(
      `           ⚠ over Azure's ${FREE_TIER_CHARS_PER_MONTH.toLocaleString("en-US")} chars/month free tier — ` +
        `split the run across two months to pay $0.00`,
    );
  }
  if (args.plan) return;

  const result = await renderCorpus({
    utterances,
    provider,
    outDir: args.out,
    prune: args.prune,
    onProgress: ({ done, total }) => {
      if (done === total || done % 100 === 0) process.stdout.write(`\r  ${done}/${total}`);
    },
  });
  if (result.synthesised > 0) process.stdout.write("\n");

  console.log(`wrote      ${path.relative(REPO_ROOT, args.out)}/${MANIFEST_NAME}`);
  console.log(
    `done       ${result.synthesised} synthesised · $${result.usd.toFixed(2)} spent ` +
      `(would have been $${result.estUsd.toFixed(2)}) · ` +
      `${result.orphans.length} orphaned${args.prune ? ` (${result.pruned} pruned)` : " (--prune to delete)"}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.stack ?? error));
    process.exit(1);
  });
}
