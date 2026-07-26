/**
 * Tests for the build-time Bulgarian voice renderer.
 * Run: node --test tools/theory/synthesize_bg.test.mjs
 *
 * Two kinds, following verify_drafts.test.mjs: pure-function units on synthetic
 * fixtures, plus live invariants over the real /content bank (invariants, never
 * counts — the bank grows as the founder approves drafts).
 *
 * THE LOAD-BEARING TEST IN THIS FILE is „no paid provider without both brakes".
 * The voice audition (doc 81 §3.4) has not been run and no vendor has been
 * chosen, so a test suite, a CI run or a fresh clone must be structurally
 * incapable of spending money — even with a key in the environment. Every other
 * test here runs the FULL pipeline against the dry-run transport, which is what
 * makes „adding credentials is the only remaining step" a claim rather than a
 * hope.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_VOICE,
  TEXT_PIPELINE_VERSION,
  USD_PER_MILLION_CHARS,
  buildManifest,
  buildSsml,
  collectUtterances,
  contentHash,
  createAzureProvider,
  createDryRunProvider,
  escapeSsml,
  hashUtterance,
  loadEnv,
  parseArgs,
  parseEnvFile,
  planRender,
  prepareUtteranceText,
  readQuestionBank,
  renderCorpus,
  selectProvider,
  selectSubset,
  usdForChars,
  utteranceKey,
  utterancesFromQuestions,
} from "./synthesize_bg.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuestion(overrides = {}) {
  return {
    id: "q-test-001",
    textBg: "До каква концентрация на алкохол законът допуска да управляваш?",
    options: [
      { id: "a", textBg: "До 0,0 промила", correct: false },
      { id: "b", textBg: "До 0,5 промила", correct: true },
    ],
    explanationBg: "Законът забранява шофиране с над 0,5 промила (ЗДвП чл. 5).",
    status: "approved",
    ...overrides,
  };
}

const DRY = createDryRunProvider();

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tutor-audio-"));
}

// ---------------------------------------------------------------------------
// Corpus selection
// ---------------------------------------------------------------------------

test("only approved questions become audio", () => {
  const utterances = utterancesFromQuestions([
    makeQuestion({ id: "q-ok-001" }),
    makeQuestion({ id: "q-pending-001", status: "needs-review" }),
    makeQuestion({ id: "q-draft-001", status: "draft" }),
  ]);
  const ids = new Set(utterances.map((u) => u.id.split(":")[0]));
  assert.deepEqual([...ids], ["q-ok-001"]);
});

test("each question yields its text, every option and its explanation", () => {
  const utterances = utterancesFromQuestions([makeQuestion()]);
  assert.deepEqual(
    utterances.map((u) => u.id).sort(),
    ["q-test-001:explain", "q-test-001:opt:a", "q-test-001:opt:b", "q-test-001:text"],
  );
  assert.deepEqual(
    utterances.map((u) => u.kind).sort(),
    ["explanation", "option", "option", "question"],
  );
});

test("a missing explanation is skipped, not rendered as an empty file", () => {
  const utterances = utterancesFromQuestions([makeQuestion({ explanationBg: "   " })]);
  assert.equal(utterances.some((u) => u.id.endsWith(":explain")), false);
});

test("whitespace is normalised so a cosmetic edit does not re-bill the corpus", () => {
  assert.equal(prepareUtteranceText("  До\n  0,5   промила "), "До 0,5 промила");
  const [a] = utterancesFromQuestions([makeQuestion({ textBg: "Едно  две" })]);
  const [b] = utterancesFromQuestions([makeQuestion({ textBg: "Едно\tдве" })]);
  assert.equal(hashUtterance(a, DRY), hashUtterance(b, DRY));
});

test("a duplicate question id is a hard error — ids are the runtime lookup key", () => {
  assert.throws(
    () => utterancesFromQuestions([makeQuestion(), makeQuestion()]),
    /duplicate question id/,
  );
});

// ---------------------------------------------------------------------------
// Live invariants over the real bank
// ---------------------------------------------------------------------------

test("the real bank walks cleanly and covers exactly the three spoken fields", () => {
  const bank = readQuestionBank();
  assert.ok(bank.length > 1_000, `expected a real bank, got ${bank.length}`);

  // Independently re-derive what SHOULD be spoken, so the test proves coverage
  // rather than restating a number that content edits would break. Doc 81 §1.2
  // measured this at 713,505 chars across all statuses.
  const statuses = ["approved", "needs-review", "draft"];
  let expected = 0;
  for (const q of bank) {
    if (!statuses.includes(q.status)) continue;
    for (const raw of [q.textBg, q.explanationBg, ...(q.options ?? []).map((o) => o.textBg)]) {
      expected += [...prepareUtteranceText(raw ?? "")].length;
    }
  }
  const actual = utterancesFromQuestions(bank, { statuses }).reduce(
    (n, u) => n + [...u.text].length,
    0,
  );
  assert.equal(actual, expected);

  const approved = collectUtterances();
  assert.ok(approved.length > 0);
  assert.equal(new Set(approved.map((u) => u.id)).size, approved.length);
  assert.ok(approved.every((u) => u.text.length > 0));
});

// ---------------------------------------------------------------------------
// Content-hash keying
// ---------------------------------------------------------------------------

test("the hash covers everything that changes the produced bytes", () => {
  const base = {
    text: "До 0,5 промила",
    provider: "azure",
    voice: DEFAULT_VOICE,
    format: "opus",
    pipeline: TEXT_PIPELINE_VERSION,
  };
  const baseline = contentHash(utteranceKey(base));
  for (const [field, value] of [
    ["text", "До 0,8 промила"],
    ["provider", "elevenlabs"],
    ["voice", "bg-BG-BorislavNeural"],
    ["format", "mp3"],
    ["pipeline", TEXT_PIPELINE_VERSION + 1],
  ]) {
    assert.notEqual(
      contentHash(utteranceKey({ ...base, [field]: value })),
      baseline,
      `changing ${field} must invalidate the cache`,
    );
  }
  assert.equal(contentHash(utteranceKey({ ...base })), baseline);
});

test("identical strings across questions are synthesised — and billed — once", () => {
  const utterances = utterancesFromQuestions([
    makeQuestion({ id: "q-a-001", options: [{ id: "a", textBg: "Да" }, { id: "b", textBg: "Не" }] }),
    makeQuestion({ id: "q-b-001", options: [{ id: "a", textBg: "Да" }, { id: "b", textBg: "Не" }] }),
  ]);
  const plan = planRender({ utterances, provider: DRY });
  const optionIds = utterances.filter((u) => u.kind === "option");
  assert.equal(optionIds.length, 4);
  // "Да"/"Не" collapse to two files; the two questions' own texts and
  // explanations are identical too, so 8 utterances become 4 jobs.
  assert.equal(plan.jobs.length, 4);
  assert.equal(plan.totalIds, 8);
});

// ---------------------------------------------------------------------------
// Cost accounting
// ---------------------------------------------------------------------------

test("cost is quoted per character actually sent, at the verified Azure meter", () => {
  assert.equal(USD_PER_MILLION_CHARS, 15.0);
  assert.ok(Math.abs(usdForChars(713_505) - 10.7) < 0.01); // doc 81 §3.2: $10.70
  const plan = planRender({ utterances: utterancesFromQuestions([makeQuestion()]), provider: DRY });
  assert.equal(plan.chars, plan.jobs.reduce((n, j) => n + j.chars, 0));
  assert.equal(plan.estUsd, usdForChars(plan.chars));
});

test("an incremental run only bills what changed", () => {
  const utterances = utterancesFromQuestions([makeQuestion()]);
  const existing = new Set(utterances.slice(0, 3).map((u) => hashUtterance(u, DRY)));
  const plan = planRender({ utterances, provider: DRY, existingHashes: existing });
  assert.equal(plan.reusedIds, 3);
  assert.equal(plan.jobs.length, utterances.length - 3);
});

// ---------------------------------------------------------------------------
// The spend guard — the reason this file exists
// ---------------------------------------------------------------------------

test("no credentials => the dry-run transport, which cannot cost money", () => {
  const provider = selectProvider({}, { allowSpend: true });
  assert.equal(provider.id, "dryrun");
  assert.equal(provider.costsMoney, false);
  assert.match(provider.reason, /AZURE_SPEECH_KEY/);
});

test("credentials WITHOUT --allow-spend still gives the dry-run transport", () => {
  const provider = selectProvider({ AZURE_SPEECH_KEY: "secret" }, { allowSpend: false });
  assert.equal(provider.id, "dryrun");
  assert.equal(provider.costsMoney, false);
  assert.match(provider.reason, /--allow-spend/);
});

test("both brakes released selects Azure — and nothing is called until asked", async () => {
  let calls = 0;
  const provider = selectProvider(
    { AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "westeurope" },
    {
      allowSpend: true,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
      },
    },
  );
  assert.equal(provider.id, "azure");
  assert.equal(provider.costsMoney, true);
  assert.equal(provider.format.ext, "opus");
  assert.equal(calls, 0, "selecting a provider must not call the vendor");
});

test("credentials are picked up from platform/.env — the one place secrets live", () => {
  const root = tmpOut();
  fs.mkdirSync(path.join(root, "platform"));
  fs.writeFileSync(
    path.join(root, "platform", ".env"),
    'DATABASE_URL="postgresql://secret"\nAZURE_SPEECH_KEY="from-file"\nTUTOR_TTS_VOICE="bg-BG-BorislavNeural"\n',
    "utf8",
  );

  const env = loadEnv({}, root);
  assert.equal(env.AZURE_SPEECH_KEY, "from-file");
  assert.equal(env.TUTOR_TTS_VOICE, "bg-BG-BorislavNeural");
  assert.equal(
    env.DATABASE_URL,
    undefined,
    "a build script must not inherit unrelated secrets from a file it shares",
  );
});

test("a real environment variable always beats the file", () => {
  const root = tmpOut();
  fs.mkdirSync(path.join(root, "platform"));
  fs.writeFileSync(path.join(root, "platform", ".env"), 'AZURE_SPEECH_KEY="from-file"\n', "utf8");
  assert.equal(loadEnv({ AZURE_SPEECH_KEY: "from-shell" }, root).AZURE_SPEECH_KEY, "from-shell");
});

test("a missing or quote-free .env is not an error", () => {
  assert.deepEqual(loadEnv({ A: "1" }, tmpOut()), { A: "1" });
  assert.deepEqual(parseEnvFile("AZURE_SPEECH_KEY=bare\n# comment\nnot a var\n"), {
    AZURE_SPEECH_KEY: "bare",
  });
});

test("an empty key in the file or the shell still means dry-run", () => {
  // platform/.env ships ANTHROPIC_API_KEY="" and has for the tutor's whole
  // life; an empty AZURE_SPEECH_KEY must read as absent, not as a credential.
  assert.equal(selectProvider({ AZURE_SPEECH_KEY: "  " }, { allowSpend: true }).id, "dryrun");
});

test("an unknown vendor name falls back to dry-run instead of guessing", () => {
  const provider = selectProvider({ TUTOR_TTS_PROVIDER: "elevenlabs" }, { allowSpend: true });
  assert.equal(provider.id, "dryrun");
  assert.match(provider.reason, /unknown TUTOR_TTS_PROVIDER/);
});

test("the voice is env-selectable on every transport", () => {
  assert.equal(selectProvider({}).voice, DEFAULT_VOICE);
  assert.equal(
    selectProvider({ TUTOR_TTS_VOICE: "bg-BG-BorislavNeural" }).voice,
    "bg-BG-BorislavNeural",
  );
});

test("Azure refuses to construct without a key rather than sending an unauthenticated request", () => {
  assert.throws(() => createAzureProvider({ key: "" }), /AZURE_SPEECH_KEY/);
});

test("SSML escapes the payload — an ampersand in authored copy must not break the request", () => {
  assert.equal(escapeSsml('А & Б < В > "Г"'), "А &amp; Б &lt; В &gt; &quot;Г&quot;");
  const ssml = buildSsml("До 0,5 промила", DEFAULT_VOICE);
  assert.match(ssml, /xml:lang="bg-BG"/);
  assert.match(ssml, new RegExp(`<voice name="${DEFAULT_VOICE}">До 0,5 промила</voice>`));
});

// ---------------------------------------------------------------------------
// End-to-end against the dry-run transport
// ---------------------------------------------------------------------------

test("a full render writes one file per distinct string plus a manifest", async () => {
  const outDir = tmpOut();
  const utterances = utterancesFromQuestions([makeQuestion()]);
  const result = await renderCorpus({ utterances, provider: DRY, outDir });

  assert.equal(result.synthesised, utterances.length);
  // A dry run spends nothing, but still quotes what it would have cost — that
  // quote is the input to the founder's decision to arm a paying vendor.
  assert.equal(result.usd, 0);
  assert.ok(result.estUsd > 0);
  for (const utterance of utterances) {
    const hash = result.manifest.utterances[utterance.id];
    assert.ok(hash, `${utterance.id} missing from the manifest`);
    assert.ok(fs.existsSync(path.join(outDir, `${hash}.dry`)));
  }
  assert.equal(result.manifest.provider, "dryrun");
  assert.equal(result.manifest.visemes, false);
  assert.equal(result.manifest.textPipeline, TEXT_PIPELINE_VERSION);
});

test("re-running renders nothing and produces a byte-identical manifest", async () => {
  const outDir = tmpOut();
  const utterances = utterancesFromQuestions([makeQuestion()]);
  await renderCorpus({ utterances, provider: DRY, outDir });
  const first = fs.readFileSync(path.join(outDir, "manifest.json"));

  const again = await renderCorpus({ utterances, provider: DRY, outDir });
  assert.equal(again.synthesised, 0);
  assert.equal(again.reusedIds, utterances.length);
  assert.deepEqual(fs.readFileSync(path.join(outDir, "manifest.json")), first);
});

test("editing one explanation re-synthesises exactly one file", async () => {
  const outDir = tmpOut();
  await renderCorpus({
    utterances: utterancesFromQuestions([makeQuestion()]),
    provider: DRY,
    outDir,
  });
  const edited = await renderCorpus({
    utterances: utterancesFromQuestions([
      makeQuestion({ explanationBg: "Над 1,2 промила вече е престъпление (ЗДвП чл. 343б)." }),
    ]),
    provider: DRY,
    outDir,
  });
  assert.equal(edited.synthesised, 1);
  assert.equal(edited.orphans.length, 1, "the superseded file is reported, not silently kept");
  assert.equal(edited.pruned, 0, "and it is NOT deleted without --prune");
});

test("--prune deletes superseded files and leaves the live ones alone", async () => {
  const outDir = tmpOut();
  await renderCorpus({
    utterances: utterancesFromQuestions([makeQuestion()]),
    provider: DRY,
    outDir,
  });
  const utterances = utterancesFromQuestions([makeQuestion({ explanationBg: "Друго обяснение." })]);
  const pruned = await renderCorpus({ utterances, provider: DRY, outDir, prune: true });
  assert.equal(pruned.pruned, 1);

  const onDisk = fs.readdirSync(outDir).filter((f) => f.endsWith(".dry")).sort();
  const live = [...new Set(utterances.map((u) => `${hashUtterance(u, DRY)}.dry`))].sort();
  assert.deepEqual(onDisk, live);
});

test("switching voice invalidates every file rather than serving the old voice", async () => {
  const outDir = tmpOut();
  const utterances = utterancesFromQuestions([makeQuestion()]);
  await renderCorpus({ utterances, provider: DRY, outDir });
  const borislav = createDryRunProvider({ voice: "bg-BG-BorislavNeural" });
  const second = await renderCorpus({ utterances, provider: borislav, outDir });
  assert.equal(second.synthesised, utterances.length);
});

test("the manifest describes the bytes actually on disk, including reused files", async () => {
  const outDir = tmpOut();
  const utterances = utterancesFromQuestions([makeQuestion()]);
  await renderCorpus({ utterances, provider: DRY, outDir });
  const { manifest } = await renderCorpus({ utterances, provider: DRY, outDir });
  for (const [hash, entry] of Object.entries(manifest.files)) {
    const stat = fs.statSync(path.join(outDir, entry.file));
    assert.equal(entry.bytes, stat.size);
    assert.equal(entry.file, `${hash}.dry`);
    assert.ok(entry.chars > 0);
  }
});

test("buildManifest sorts its keys so a render is reviewable as a diff", () => {
  const utterances = utterancesFromQuestions([makeQuestion()]);
  const hashes = new Map(utterances.map((u) => [u.id, hashUtterance(u, DRY)]));
  const manifest = buildManifest({ utterances, provider: DRY, hashes, sizes: new Map() });
  const keys = Object.keys(manifest.utterances);
  assert.deepEqual(keys, [...keys].sort());
});

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

test("--match and --limit reach the audition strings without editing the script", () => {
  const utterances = utterancesFromQuestions([makeQuestion()]);
  assert.equal(selectSubset(utterances, { match: "промила" }).length, 3);
  assert.equal(selectSubset(utterances, { limit: 2 }).length, 2);
  assert.equal(selectSubset(utterances, { match: "промила", limit: 1 }).length, 1);
});

test("parseArgs rejects what it does not understand instead of ignoring it", () => {
  const args = parseArgs(["--plan", "--allow-spend", "--prune", "--limit", "9"]);
  assert.equal(args.plan, true);
  assert.equal(args.allowSpend, true);
  assert.equal(args.prune, true);
  assert.equal(args.limit, 9);
  assert.throws(() => parseArgs(["--alow-spend"]), /unknown argument/);
  assert.throws(() => parseArgs(["--limit", "0"]), /positive integer/);
});
