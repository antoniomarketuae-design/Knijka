/**
 * THE REVIEWED-TEXT MANIFEST — load, compare, explain, record (test-only helper;
 * `reviewed-text-manifest.test.ts` is the gate and its header states the threat
 * model). What is enumerated, and what is not, is documented in `studentText.ts`.
 *
 * ON DISK (`reviewed-text-manifest/`, LF only):
 *   manifest.json            one fingerprint per surface + its unit and string
 *                            counts — the recorded state, small enough to read.
 *   units.<surface>.txt      one line per unit: «unit ⇥ shape id id id …» —
 *                            `shape` is the digest of the unit's paths, each
 *                            `id` the 12-hex digest of one string, in order. The
 *                            surface's fingerprint is the sha256 of these lines.
 *   strings.<0-f>.txt        «id ⇥ JSON string», sorted, sharded by the id's
 *                            first digit: the REVIEWED TEXT itself, held once
 *                            however many places show it. It exists so a red
 *                            can print the OLD sentence beside the new one, and
 *                            so the commit that re-records the manifest shows,
 *                            as its own diff, every sentence that was signed.
 *                            (The `law` surface is the exception — UNSTORED.)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES, enumerateStudentText, hashOf, type StudentText, type SurfaceId, type TextEntry, type TextUnit } from "./studentText";
import { sentencesOf } from "./keepRightCensus";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST_DIR = path.join(HERE, "reviewed-text-manifest");
const MANIFEST_FILE = path.join(MANIFEST_DIR, "manifest.json");
const unitsFile = (s: SurfaceId) => path.join(MANIFEST_DIR, `units.${s}.txt`);
const SHARDS = "0123456789abcdef".split("");
const stringsFile = (shard: string) => path.join(MANIFEST_DIR, `strings.${shard}.txt`);

/**
 * Surfaces whose strings are FINGERPRINTED but not copied into strings.*.txt.
 * The law bank is the reference every other text is checked against; a second
 * 1.5 MB copy of it in a fixture would be a second bank to keep honest. A red
 * on such a surface still names the unit (the provision) and prints the new
 * text; the old text is the bank's own history.
 */
export const UNSTORED: ReadonlySet<SurfaceId> = new Set<SurfaceId>(["law"]);

export const RECORD_COMMAND =
  "RECORD_REVIEWED_TEXT_MANIFEST=1 npx vitest run --maxWorkers=1 src/modules/sim/lessons/scenario/__tests__/reviewed-text-manifest.test.ts";

export interface SurfaceRecord {
  fingerprint: string;
  units: number;
  strings: number;
}
export interface Manifest {
  note: string;
  command: string;
  surfaces: Record<SurfaceId, SurfaceRecord>;
}
/** unit → [shape, id, id, …] */
export type UnitLedger = Map<string, string[]>;

const lines = (file: string): string[] =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf-8")
        .split(/\r?\n/u)
        .filter((l) => l.length > 0)
    : [];

// ─────────────────────────────── the current tree ───────────────────────────

export function unitTokens(u: TextUnit): string[] {
  return [hashOf(u.entries.map((e) => e.path).join("\n")), ...u.entries.map((e) => hashOf(e.text))];
}
export function ledgerOf(units: TextUnit[]): UnitLedger {
  const out: UnitLedger = new Map();
  for (const u of units) {
    if (out.has(u.unit)) throw new Error(`reviewed-text manifest: duplicate unit «${u.unit}»`);
    out.set(u.unit, unitTokens(u));
  }
  return out;
}
/** The fingerprint of a surface: sha256 over its unit lines, units in code-point order. */
export function fingerprintOf(ledger: UnitLedger): string {
  const h = crypto.createHash("sha256");
  for (const unit of [...ledger.keys()].sort()) h.update(`${unit}\t${ledger.get(unit)!.join(" ")}\n`, "utf8");
  return h.digest("hex");
}
export function recordOf(ledger: UnitLedger): SurfaceRecord {
  let strings = 0;
  for (const t of ledger.values()) strings += t.length - 1;
  return { fingerprint: fingerprintOf(ledger), units: ledger.size, strings };
}

// ─────────────────────────────── the recorded state ─────────────────────────

export function loadManifest(): Manifest | null {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")) as Manifest;
}
export function loadLedger(surface: SurfaceId): UnitLedger {
  const out: UnitLedger = new Map();
  for (const l of lines(unitsFile(surface))) {
    const tab = l.indexOf("\t");
    if (tab < 0) throw new Error(`reviewed-text manifest: units.${surface}.txt holds a line with no tab`);
    const unit = l.slice(0, tab);
    if (out.has(unit)) throw new Error(`reviewed-text manifest: units.${surface}.txt lists «${unit}» twice`);
    out.set(unit, l.slice(tab + 1).split(" "));
  }
  return out;
}
/** id → the reviewed text. Also returns the ids whose stored text does not hash to its id. */
export function loadStrings(): { byId: Map<string, string>; corrupt: string[]; misfiled: string[]; duplicate: string[] } {
  const byId = new Map<string, string>();
  const corrupt: string[] = [];
  const misfiled: string[] = [];
  const duplicate: string[] = [];
  for (const shard of SHARDS) {
    for (const l of lines(stringsFile(shard))) {
      const tab = l.indexOf("\t");
      const id = l.slice(0, tab);
      let text: string;
      try {
        text = JSON.parse(l.slice(tab + 1)) as string;
      } catch {
        corrupt.push(id);
        continue;
      }
      if (typeof text !== "string" || hashOf(text) !== id) corrupt.push(id);
      if (!id.startsWith(shard)) misfiled.push(id);
      if (byId.has(id)) duplicate.push(id);
      byId.set(id, text);
    }
  }
  return { byId, corrupt, misfiled, duplicate };
}

// ─────────────────────────────── explaining a difference ────────────────────

export interface Change {
  surface: SurfaceId;
  unit: string;
  /** The path of the string in the CURRENT tree («(removed)» when it is gone). */
  path: string;
  kind: "added" | "removed" | "changed" | "moved";
  /** Sentences only the reviewed copy has / only the tree has. */
  oldSentences: string[];
  newSentences: string[];
}

/** LCS alignment of two id sequences → runs of (removed ids, added ids with their index in `now`). */
function hunks(was: string[], now: string[]): { removed: string[]; added: number[] }[] {
  const n = was.length;
  const m = now.length;
  // Trim the common prefix and suffix first: units are mostly unchanged.
  let a = 0;
  while (a < n && a < m && was[a] === now[a]) a++;
  let b = 0;
  while (b < n - a && b < m - a && was[n - 1 - b] === now[m - 1 - b]) b++;
  const W = was.slice(a, n - b);
  const N = now.slice(a, m - b);
  const dp: Uint32Array[] = Array.from({ length: W.length + 1 }, () => new Uint32Array(N.length + 1));
  for (let i = W.length - 1; i >= 0; i--) {
    for (let j = N.length - 1; j >= 0; j--) dp[i][j] = W[i] === N[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: { removed: string[]; added: number[] }[] = [];
  let cur: { removed: string[]; added: number[] } | null = null;
  let i = 0;
  let j = 0;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  while (i < W.length || j < N.length) {
    if (i < W.length && j < N.length && W[i] === N[j]) {
      flush();
      i++;
      j++;
    } else if (j < N.length && (i === W.length || dp[i][j + 1] >= dp[i + 1][j])) {
      (cur ??= { removed: [], added: [] }).added.push(a + j);
      j++;
    } else {
      (cur ??= { removed: [], added: [] }).removed.push(W[i]);
      i++;
    }
  }
  flush();
  return out;
}

const UNKNOWN = (id: string) => `‹the reviewed text of ${id} is not held in strings.${id[0]}.txt — a surface that is fingerprinted only (the law bank), or a damaged store›`;

/** Every difference between the recorded ledger and the tree, as sentences. */
export function diffSurface(
  surface: SurfaceId,
  recorded: UnitLedger,
  current: TextUnit[],
  reviewedText: Map<string, string>,
): Change[] {
  const out: Change[] = [];
  const textOf = (id: string) => reviewedText.get(id) ?? UNKNOWN(id);
  const now = new Map(current.map((u) => [u.unit, u]));
  for (const [unit, tokens] of recorded) {
    if (now.has(unit)) continue;
    for (const id of tokens.slice(1)) {
      out.push({ surface, unit, path: "(unit removed)", kind: "removed", oldSentences: sentencesOf(textOf(id)), newSentences: [] });
    }
    if (tokens.length === 1) out.push({ surface, unit, path: "(unit removed)", kind: "removed", oldSentences: [], newSentences: [] });
  }
  for (const u of current) {
    const was = recorded.get(u.unit);
    const tokens = unitTokens(u);
    if (!was) {
      for (const e of u.entries) out.push({ surface, unit: u.unit, path: e.path, kind: "added", oldSentences: [], newSentences: sentencesOf(e.text) });
      continue;
    }
    if (was.join(" ") === tokens.join(" ")) continue;
    const hs = hunks(was.slice(1), tokens.slice(1));
    for (const h of hs) {
      const pairs = Math.min(h.removed.length, h.added.length);
      for (let k = 0; k < pairs; k++) {
        const e = u.entries[h.added[k]];
        const oldS = sentencesOf(textOf(h.removed[k]));
        const newS = sentencesOf(e.text);
        out.push({
          surface,
          unit: u.unit,
          path: e.path,
          kind: "changed",
          oldSentences: oldS.filter((s) => !newS.includes(s)),
          newSentences: newS.filter((s) => !oldS.includes(s)),
        });
      }
      for (let k = pairs; k < h.removed.length; k++) {
        out.push({ surface, unit: u.unit, path: "(removed)", kind: "removed", oldSentences: sentencesOf(textOf(h.removed[k])), newSentences: [] });
      }
      for (let k = pairs; k < h.added.length; k++) {
        const e = u.entries[h.added[k]];
        out.push({ surface, unit: u.unit, path: e.path, kind: "added", oldSentences: [], newSentences: sentencesOf(e.text) });
      }
    }
    if (hs.length === 0) {
      // Same strings in the same order under different paths: a text moved to another field.
      out.push({
        surface,
        unit: u.unit,
        path: u.entries.map((e) => e.path).join(", "),
        kind: "moved",
        oldSentences: [],
        newSentences: [],
      });
    }
  }
  return out;
}

export function formatChanges(changes: Change[], cap = 120): string {
  const out: string[] = [];
  for (const c of changes.slice(0, cap)) {
    out.push(`[${c.surface}] ${c.unit} · ${c.path} — ${c.kind.toUpperCase()}`);
    if (c.kind === "moved") out.push("    (the same strings now sit under different fields — the paths above are the current ones)");
    for (const s of c.oldSentences) out.push(`    − ${s}`);
    for (const s of c.newSentences) out.push(`    + ${s}`);
  }
  if (changes.length > cap) out.push(`… and ${changes.length - cap} more (the generator command prints all of them)`);
  return out.join("\n");
}

// ─────────────────────────────── the gate's decision ────────────────────────

export interface GateVerdict {
  ok: boolean;
  changes: Change[];
  /** What to print when not ok: every difference, both records, and the command. */
  message: string;
}
/**
 * THE GATE, for one surface — a pure function, so the test file can prove on
 * synthetic input that it says NO (a gate whose decision lives in an `if` of
 * the test itself is a gate nothing tests). Not ok when the reporter finds a
 * difference, OR when the tree's fingerprint / counts are not the recorded
 * ones (a manifest edited without the text, a surface never recorded).
 */
export function gateVerdict(
  surface: SurfaceId,
  recordedLedger: UnitLedger,
  recorded: SurfaceRecord | undefined,
  current: TextUnit[],
  reviewedText: Map<string, string>,
): GateVerdict {
  const changes = diffSurface(surface, recordedLedger, current, reviewedText);
  const now = recordOf(ledgerOf(current));
  const ok =
    changes.length === 0 &&
    recorded !== undefined &&
    now.fingerprint === recorded.fingerprint &&
    now.units === recorded.units &&
    now.strings === recorded.strings;
  const message = ok
    ? ""
    : `REVIEWED-TEXT MANIFEST: ${changes.length} student-facing string(s) on surface «${surface}» differ from the reviewed copy.\n` +
      `${formatChanges(changes)}\n` +
      `recorded ${JSON.stringify(recorded)}\n` +
      `tree     ${JSON.stringify(now)}\n` +
      `Read every sentence above against the law bank (content/law). If each is true where it is shown, record:\n  ${RECORD_COMMAND}`;
  return { ok, changes, message };
}

/** A reviewed file and the copy the player fetches: which copies are missing, which say something else. Pure. */
export function copyParity(pairs: { unit: string; reviewed: TextEntry[]; copy: TextEntry[] | null }[]): { missing: string[]; different: string[] } {
  const missing: string[] = [];
  const different: string[] = [];
  for (const p of pairs) {
    if (p.copy === null) missing.push(p.unit);
    else if (JSON.stringify(p.copy) !== JSON.stringify(p.reviewed)) different.push(p.unit);
  }
  return { missing, different };
}

// ─────────────────────────────── recording ──────────────────────────────────

/** Rewrite the whole manifest from the tree. Returns what changed against the
 *  previous recording — the list a reviewer signs by committing the result. */
export function record(all: StudentText = enumerateStudentText()): Change[] {
  const previous = loadStrings().byId;
  const changes: Change[] = [];
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const surfaces = {} as Record<SurfaceId, SurfaceRecord>;
  const texts = new Map<string, string>();
  for (const s of SURFACES) {
    changes.push(...diffSurface(s, loadLedger(s), all[s], previous));
    const ledger = ledgerOf(all[s]);
    surfaces[s] = recordOf(ledger);
    const body = [...ledger.keys()]
      .sort()
      .map((unit) => `${unit}\t${ledger.get(unit)!.join(" ")}\n`)
      .join("");
    fs.writeFileSync(unitsFile(s), body);
    if (UNSTORED.has(s)) continue;
    for (const u of all[s]) {
      for (const e of u.entries) {
        const id = hashOf(e.text);
        const held = texts.get(id);
        if (held !== undefined && held !== e.text) throw new Error(`reviewed-text manifest: two different strings share the id ${id}`);
        texts.set(id, e.text);
      }
    }
  }
  for (const shard of SHARDS) {
    const body = [...texts.keys()]
      .filter((id) => id.startsWith(shard))
      .sort()
      .map((id) => `${id}\t${JSON.stringify(texts.get(id))}\n`)
      .join("");
    fs.writeFileSync(stringsFile(shard), body);
  }
  const manifest: Manifest = {
    note:
      "One fingerprint per surface over EVERY student-facing string (see studentText.ts for what is read). Recording is a reviewer's signature: read every sentence the generator prints against the law bank first.",
    command: RECORD_COMMAND,
    surfaces,
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 1) + "\n");
  return changes;
}
