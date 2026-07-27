/**
 * The hazard item bank — content/hazard/items.json, validated and derived.
 *
 * WHY THE ITEMS ARE CONTENT AND NOT CODE. An item is three human judgements
 * (where the cue becomes visible, where the clip must stop, what the hazard
 * actually was) attached to a machine-computed fault timestamp. Judgements get
 * reviewed, and review needs a diff a person can read — the same reason every
 * question, sign and concept in this product lives in versioned JSON rather
 * than in a TS literal. A reviewer changing `windowOpenSec` from 4.0 to 3.2
 * must show up in `git diff` as exactly that.
 *
 * WHAT THIS FILE GUARANTEES, so nothing downstream has to re-check it:
 *  - the geometry is sane (0 ≤ open < cut ≤ fault, a real window, a real
 *    run-up) — a degenerate window would make scoring.ts silently unscoreable;
 *  - `violationCode` resolves in the rule catalog and `lawRefEcho` still
 *    matches it, so the reveal always has a corrective and a citation to
 *    retrieve (ADR-002 — we never generate either);
 *  - ids are unique, and every derived field is computed once, here.
 *
 * PARSE/DERIVE IS PURE (`buildHazardBank`); only `loadHazardBankFromDisk` knows
 * about the filesystem. Tests build banks from literals and never touch
 * content/ — the same split lib/content/loader.ts uses for the theory graph.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VIOLATIONS, type ViolationCode } from "@/modules/sim/rules";
import {
  HAZARD_MIN_LEAD_IN_SEC,
  HAZARD_MIN_WINDOW_SEC,
  HAZARD_SERVABLE_STATUSES,
  HazardError,
  type HazardItem,
  type HazardItemSource,
} from "./types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const VIOLATION_CODES = Object.keys(VIOLATIONS) as ViolationCode[];

const ClipRefSchema = z.strictObject({
  id: z.string().regex(/^sc-[a-z0-9-]+__m\d+$/, 'clip id must be "<templateId>__m<index>"'),
  templateId: z.string().regex(/^sc-[a-z0-9-]+$/, "templateId must be a scenario id"),
  mistakeIndex: z.number().int().min(0),
  tracePath: z.string().regex(/^content\/traces\/.+\.trace\.json$/, "tracePath must be a committed trace"),
});

const ItemSchema = z.strictObject({
  id: z.string().regex(/^hz-[a-z0-9-]+$/, 'hazard item id must be kebab-case with "hz-" prefix'),
  status: z.enum(["draft", "needs-review", "approved"]),
  clip: ClipRefSchema,
  clipStartSec: z.number().min(0),
  faultSec: z.number().min(0),
  windowOpenSec: z.number().min(0),
  cutSec: z.number().min(0),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  titleBg: z.string().min(1),
  briefBg: z.string().min(1),
  hazardBg: z.string().min(1),
  developingBg: z.string().min(1),
  // Not z.enum(VIOLATION_CODES) — the catalog is the authority on which codes
  // exist, and mirroring it into a literal union here is how the two drift.
  violationCode: z.string().refine((c): c is ViolationCode => VIOLATION_CODES.includes(c as ViolationCode), {
    message: "violationCode must be a code in the sim rule catalog",
  }),
  lawRefEcho: z.string().min(1),
  notesBg: z.string(),
});

const BankFileSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(ItemSchema),
});

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

export interface HazardBank {
  /** Every authored item, in file order — including the unreviewed ones. */
  readonly items: readonly HazardItem[];
  /**
   * The items a student may actually be dealt (approved only).
   *
   * `items` still holds the rest on purpose: judge() must be able to grade an
   * item that was dealt before someone edited the bank, and the review board
   * needs to list what is waiting to be watched.
   */
  readonly servable: readonly HazardItem[];
  byId(id: string): HazardItem | undefined;
}

/**
 * Validate + derive. Throws HazardError("BANK_INVALID") with every problem it
 * found, not just the first — a content author fixing one line at a time is how
 * a review cycle turns into an afternoon.
 */
export function buildHazardBank(raw: unknown): HazardBank {
  const parsed = BankFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HazardError(
      "BANK_INVALID",
      `content/hazard/items.json failed validation:\n${z.prettifyError(parsed.error)}`,
    );
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const items: HazardItem[] = [];

  for (const source of parsed.data.items as HazardItemSource[]) {
    if (seen.has(source.id)) problems.push(`${source.id}: duplicate item id`);
    seen.add(source.id);

    const hazardAtSec = round3(source.faultSec - source.clipStartSec);

    // Geometry. Each of these is a way to ship an item that cannot be scored
    // fairly, so each one is fatal rather than a warning.
    if (hazardAtSec <= 0) {
      problems.push(
        `${source.id}: the fault (trace ${source.faultSec}s) is not inside the clip (starts at ${source.clipStartSec}s)`,
      );
    }
    if (source.windowOpenSec < HAZARD_MIN_LEAD_IN_SEC) {
      problems.push(
        `${source.id}: windowOpenSec ${source.windowOpenSec}s leaves under ${HAZARD_MIN_LEAD_IN_SEC}s of run-up — the student would be reacting to the first frame`,
      );
    }
    if (source.cutSec - source.windowOpenSec < HAZARD_MIN_WINDOW_SEC) {
      problems.push(
        `${source.id}: window is ${round3(source.cutSec - source.windowOpenSec)}s, under the ${HAZARD_MIN_WINDOW_SEC}s minimum`,
      );
    }
    if (source.cutSec > hazardAtSec) {
      problems.push(
        `${source.id}: cutSec ${source.cutSec}s runs past the fault at clip ${hazardAtSec}s — the clip must stop before the hazard is unmissable`,
      );
    }

    // Retrieval integrity (ADR-002): the corrective and the citation are read
    // from the catalog at reveal time, so the link must hold at load time.
    const spec = VIOLATIONS[source.violationCode];
    if (spec === undefined) {
      problems.push(`${source.id}: unknown violationCode ${source.violationCode}`);
    } else if (spec.lawRef !== source.lawRefEcho) {
      problems.push(
        `${source.id}: lawRefEcho "${source.lawRefEcho}" no longer matches the catalog ("${spec.lawRef}") — re-read the item before shipping it`,
      );
    }

    items.push({
      ...source,
      window: { openSec: source.windowOpenSec, closeSec: source.cutSec },
      hazardAtSec,
      playableSec: source.cutSec,
      // Convention, not a manifest lookup. The capture rig writes exactly these
      // paths (clips/view/clipManifest: src = "/clips/<id>.webm", keyframes =
      // "/clips/<id>.k<n>.webp"), and depending on the file itself would couple
      // the engine to an artefact the render batch rewrites underneath it. A
      // missing file is the player's problem to degrade, not the bank's.
      clipSrc: `/clips/${source.clip.id}.webm`,
      posterSrc: `/clips/${source.clip.id}.k0.webp`,
    });
  }

  if (problems.length > 0) {
    throw new HazardError(
      "BANK_INVALID",
      `content/hazard/items.json has ${problems.length} problem(s):\n - ${problems.join("\n - ")}`,
    );
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const servable = items.filter((i) => HAZARD_SERVABLE_STATUSES.includes(i.status));

  return {
    items: Object.freeze(items),
    servable: Object.freeze(servable),
    byId: (id) => byId.get(id),
  };
}

// ---------------------------------------------------------------------------
// Disk
// ---------------------------------------------------------------------------

/**
 * content/ lives at the repo root, one level above platform/. Next and vitest
 * run with cwd = platform/, repo-level tooling with cwd = the repo root — probe
 * both, exactly like lib/content/loader.resolveContentDir().
 *
 * Deliberately NOT importing that helper: it lives in a module whose import
 * synchronously loads and validates the entire theory content graph, and a
 * hazard-only code path has no business paying for that.
 */
function resolveHazardFile(): string {
  const candidates = [
    path.join(process.cwd(), "content", "hazard", "items.json"),
    path.resolve(process.cwd(), "..", "content", "hazard", "items.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  throw new HazardError(
    "BANK_INVALID",
    `Hazard item bank not found (cwd: ${process.cwd()}). Looked in: ${candidates.join(", ")}`,
  );
}

/** Read + validate the shipped bank. Server/node only. */
export function loadHazardBankFromDisk(): HazardBank {
  if (typeof window !== "undefined") {
    throw new HazardError(
      "BANK_INVALID",
      "hazard/bank is server-only — the browser must never hold items (they carry the scoring windows)",
    );
  }
  const file = resolveHazardFile();
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new HazardError("BANK_INVALID", `Cannot read ${file}: ${(err as Error).message}`);
  }
  return buildHazardBank(raw);
}

let bank: HazardBank | null = null;

/** Inject a bank (tests, and any tooling that builds one from a literal). */
export function setHazardBank(next: HazardBank | null): void {
  bank = next;
}

/** The bank, loaded from disk on first use and cached for the process. */
export function getHazardBank(): HazardBank {
  if (bank === null) bank = loadHazardBankFromDisk();
  return bank;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Deterministic PRNG (mulberry32), seeded per run.
 *
 * A local copy rather than an import from exam/rng.ts: that is another module's
 * internal (docs/architecture/05 — modules talk only through index.ts), and
 * fifteen lines of arithmetic is a cheaper price than a boundary hole. Not
 * cryptographic, and it does not need to be: run integrity comes from never
 * sending the window to the client, not from seed secrecy.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick the items for one run: shuffled WITHIN each difficulty tier, then served
 * easiest tier first.
 *
 * The ramp is pedagogy, not decoration. A student who opens with a hazard they
 * cannot see learns that the surface is unfair and stops attending, and
 * attention is the entire skill being trained. Shuffling inside the tier keeps
 * two runs from being the same run.
 *
 * Returns fewer than `length` when the pool is smaller — the delivery layer
 * treats an empty deal as "готви се", which is the honest state while the clip
 * batch is still being produced.
 */
export function selectHazardItems(
  pool: readonly HazardItem[],
  length: number,
  seed: number,
): HazardItem[] {
  const rng = createRng(seed);
  const wanted = Math.max(0, Math.floor(length));
  const out: HazardItem[] = [];
  for (const tier of [1, 2, 3] as const) {
    if (out.length >= wanted) break;
    const bucket = shuffle(
      pool.filter((i) => i.difficulty === tier),
      rng,
    );
    out.push(...bucket.slice(0, wanted - out.length));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Review support
// ---------------------------------------------------------------------------

export interface HazardBankAuditRow {
  itemId: string;
  clipId: string;
  status: HazardItem["status"];
  /** CLIP seconds — what a reviewer scrubs to. */
  windowOpenSec: number;
  cutSec: number;
  hazardAtSec: number;
  notesBg: string;
}

/**
 * Everything a human needs to sit down and approve items, without loading a
 * page: which clip, which seconds to scrub to, and what the author flagged.
 *
 * Exists because `HAZARD_SERVABLE_STATUSES` is deliberately strict — an
 * unwatched item is an unverified measurement — so there has to be a cheap path
 * from "authored" to "approved" or the gate just means "nothing ships".
 */
export function hazardBankAudit(bank: HazardBank): HazardBankAuditRow[] {
  return bank.items.map((i) => ({
    itemId: i.id,
    clipId: i.clip.id,
    status: i.status,
    windowOpenSec: i.window.openSec,
    cutSec: i.window.closeSec,
    hazardAtSec: i.hazardAtSec,
    notesBg: i.notesBg,
  }));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
