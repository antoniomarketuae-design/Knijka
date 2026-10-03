/**
 * THE DOMAINS THE PAYLOAD PARITY IS DRIVEN OVER — READ FROM THE SOURCE (round 9,
 * the integrator's parity stop rule). Shared by `finish-payload-census.test.ts`
 * (every committed drive) and `finish-payload.test.ts` (the named cases). Not a
 * test file: it only reads.
 *
 * Rounds 6, 7 and 8 each ended with builder or call-site mutants surviving
 * because the parity tests drove only the value SHAPES the committed drives
 * happen to carry. So every field is driven over its full declared domain, and
 * the domain is DERIVED here, never hand-listed:
 *  · the save result — the union `simulator/actions.ts` declares its action to
 *    return (`Promise<FinishLessonActionResult>`), followed through the action
 *    file's own import to where the union is written, and the refusals the
 *    action's body returns; its `ok` variant's field list too. Anything written
 *    in a shape these readers do not know is reported UNRESOLVED (and the tests
 *    fail on it), never skipped;
 *  · the micro-quiz — every (correct, total) with 0 ≤ correct ≤ total ≤ the
 *    largest `maxPerSession` of `QUIZ_TUNING` (the shell counts one per answered
 *    quiz and the trigger stops at that cap; the census pins both from source);
 *  · near-misses — every kind `wire.ts parseNearMisses` accepts, and the list
 *    length up to the wire's own `MAX_NEAR_MISSES`;
 *  · (round 10, the round-9 verifier's R3 and C1) the near-miss's relative
 *    speed, a real number, over the readings the scene's own detector
 *    (`stepNearMiss`) reports and the range the wire declares; and the stored
 *    session's list and number at every end they reach (several concepts, 0 XP).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUIZ_TUNING } from "@/modules/sim/lessons";
import { DEFAULT_NEAR_MISS_CONFIG, createNearMissTracker, stepNearMiss } from "@/modules/sim/traffic";
import type { FinishLessonActionResult } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLATFORM_ROOT = path.resolve(HERE, "../../../../..");
export const ACTIONS_PATH = path.join(PLATFORM_ROOT, "src", "app", "(dashboard)", "simulator", "actions.ts");
const WIRE_PATH = path.join(PLATFORM_ROOT, "src", "modules", "sim", "lessons", "wire.ts");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** Read the `return { ok: false, code: "…" };` refusals of one function body; `unresolved` counts every other `ok: false`. */
export function refusalsInBody(body: string): { codes: string[]; unresolved: number } {
  const okFalse = body.split("ok: false").length - 1;
  const codes = [...body.matchAll(/return \{ ok: false, code: "([A-Z_]+)" \};/g)].map((m) => m[1]);
  return { codes: [...new Set(codes)].sort(), unresolved: okFalse - codes.length };
}

/** The refusal codes `finishLessonAction` RETURNS, read from its own body. */
export function refusalCodesFromAction(src = readFileSync(ACTIONS_PATH, "utf-8")): { codes: string[]; unresolved: number } {
  const text = lf(src);
  const start = text.indexOf("export async function finishLessonAction(");
  if (start < 0) return { codes: [], unresolved: 1 };
  const end = text.indexOf("\n}\n", start);
  if (end < 0) return { codes: [], unresolved: 1 };
  return refusalsInBody(text.slice(start, end));
}

/**
 * WHERE the union the action returns is written, read from `actions.ts` itself:
 * its declared return type must be `Promise<FinishLessonActionResult>`, and that
 * name is either declared in the file or imported from an `@/…` module.
 * `unresolved` whenever either step cannot be read.
 */
export function unionSourceOfAction(src = readFileSync(ACTIONS_PATH, "utf-8")): { file: string | null; unresolved: number } {
  const text = lf(src);
  const start = text.indexOf("export async function finishLessonAction(");
  if (start < 0) return { file: null, unresolved: 1 };
  const sig = text.slice(start, text.indexOf("{\n", start));
  if (!/\):\s*Promise<FinishLessonActionResult>\s*$/.test(sig)) return { file: null, unresolved: 1 };
  if (text.includes("export type FinishLessonActionResult =")) return { file: ACTIONS_PATH, unresolved: 0 };
  const imp = text.match(/import type \{ FinishLessonActionResult \} from "@\/([^"]+)";/);
  if (imp === null) return { file: null, unresolved: 1 };
  return { file: path.join(PLATFORM_ROOT, "src", ...imp[1].split("/")) + ".ts", unresolved: 0 };
}

/** The text of `export type FinishLessonActionResult = …;` — up to the blank line that ends it (or the end of the text). */
function unionBlock(text: string): string | null {
  const start = text.indexOf("export type FinishLessonActionResult =");
  if (start < 0) return null;
  const end = text.indexOf("\n\n", start);
  return end < 0 ? text.slice(start) : text.slice(start, end);
}

/** The refusal codes the `FinishLessonActionResult` union declares (exactly ONE `ok: false` variant, its `code` a union of literals). */
export function refusalCodesFromUnion(src?: string): { codes: string[]; unresolved: number } {
  let text: string;
  if (src !== undefined) text = lf(src);
  else {
    const where = unionSourceOfAction();
    if (where.file === null) return { codes: [], unresolved: 1 };
    text = lf(readFileSync(where.file, "utf-8"));
  }
  const block = unionBlock(text);
  if (block === null) return { codes: [], unresolved: 1 };
  if (block.split("ok: false").length - 1 !== 1) return { codes: [], unresolved: 1 };
  const refused = block.indexOf("ok: false;");
  const codeAt = block.indexOf("\n      code:", refused);
  if (refused < 0 || codeAt < 0) return { codes: [], unresolved: 1 };
  const semi = block.indexOf(";", codeAt);
  if (semi < 0) return { codes: [], unresolved: 1 };
  const union = block.slice(codeAt + "\n      code:".length, semi);
  const codes = [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  // Nothing but `| "CODE"` alternatives may stand in the union's text…
  const rest = union.replace(/"[A-Z_]+"/g, "").replace(/[|\s]/g, "");
  // …and nothing but `code` in the refusal variant.
  const variantEnd = block.indexOf("}", semi);
  const tail = block.slice(semi + 1, variantEnd < 0 ? undefined : variantEnd).replace(/\s/g, "");
  return { codes: [...new Set(codes)].sort(), unresolved: rest.length > 0 || tail.length > 0 || codes.length === 0 ? 1 : 0 };
}

/** The field names of the union's ONE `ok: true` variant (comments skipped); `unresolved` when unreadable. */
export function okFieldsFromUnion(src?: string): { fields: string[]; unresolved: number } {
  let text: string;
  if (src !== undefined) text = lf(src);
  else {
    const where = unionSourceOfAction();
    if (where.file === null) return { fields: [], unresolved: 1 };
    text = lf(readFileSync(where.file, "utf-8"));
  }
  const block = unionBlock(text);
  if (block === null || block.split("ok: true").length - 1 !== 1) return { fields: [], unresolved: 1 };
  const at = block.indexOf("ok: true;");
  const end = block.indexOf("}", at);
  if (at < 0 || end < 0) return { fields: [], unresolved: 1 };
  const body = block
    .slice(at + "ok: true;".length, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const lines = body.split(";").map((x) => x.trim()).filter((x) => x.length > 0);
  const fields: string[] = [];
  let unresolved = 0;
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z]+)\??:/);
    if (m === null) unresolved++;
    else fields.push(m[1]);
  }
  return { fields: ["ok", ...fields].sort(), unresolved: fields.length === 0 ? 1 : unresolved };
}

/** The list the tests name — it must equal both readings above (a drift fails the census's first case). */
export const REFUSAL_CODES = ["INVALID_INPUT", "LEVEL_LOCKED", "NOT_SIGNED_IN", "RATE_LIMITED", "SAVE_FAILED", "UNKNOWN_LESSON"] as const;

/** The largest quiz tally a session can send. */
export const QUIZ_MAX_TOTAL = Math.max(...Object.values(QUIZ_TUNING).map((t) => t.maxPerSession));
/** Every (correct, total) the product can produce. */
export const QUIZ_DOMAIN: ReadonlyArray<{ total: number; correct: number }> = (() => {
  const out: Array<{ total: number; correct: number }> = [];
  for (let total = 0; total <= QUIZ_MAX_TOTAL; total++) {
    for (let correct = 0; correct <= total; correct++) out.push({ total, correct });
  }
  return out;
})();

/** What the server can answer, and what the screen must then be handed. */
export interface SaveValue {
  key: string;
  /** undefined = the action REJECTS (a throw — the entitlement gate, a non-timeout error — or the network). */
  answer: FinishLessonActionResult | undefined;
  expect: FinishLessonActionResult;
}
/**
 * Every value the save can produce: a stored session — bare (no concept, XP null), with one concept and XP, and
 * (round 10, the round-9 verifier's C1) with SEVERAL concepts and ZERO XP, the two ends its own list and number
 * reach (`actions.ts` returns `enrichConcepts(debrief.conceptIds)`, which can hold several, and `recordActivity`'s
 * XP, which can be 0) — a rejection, and every refusal code.
 */
export function saveDomain(n: number): SaveValue[] {
  const okBare: FinishLessonActionResult = { ok: true, sessionId: `s-${n}`, debriefText: `srv-${n}`, concepts: [], xpEarned: null };
  const okFull: FinishLessonActionResult = {
    ok: true,
    sessionId: `s-${n}-x`,
    debriefText: `srv-${n}-x`,
    concepts: [{ id: "c-speed", titleBg: "Скорост", href: "/theory/practice?topic=speed" }],
    xpEarned: 40,
  };
  const okMany: FinishLessonActionResult = {
    ok: true,
    sessionId: `s-${n}-m`,
    debriefText: `srv-${n}-m`,
    concepts: [
      { id: "c-speed", titleBg: "Скорост", href: "/theory/practice?topic=speed" },
      { id: "c-weather", titleBg: "Скорост при дъжд", href: "/theory/practice?topic=weather" },
    ],
    xpEarned: 0,
  };
  return [
    { key: "ok", answer: okBare, expect: okBare },
    { key: "ok+xp", answer: okFull, expect: okFull },
    { key: "ok+2c0xp", answer: okMany, expect: okMany },
    { key: "reject", answer: undefined, expect: { ok: false, code: "SAVE_FAILED" } },
    ...REFUSAL_CODES.map((code): SaveValue => {
      const r = { ok: false, code } as FinishLessonActionResult;
      return { key: code, answer: r, expect: r };
    }),
  ];
}
export const SAVE_KEYS: readonly string[] = saveDomain(0).map((v) => v.key);

/** The near-miss kinds the wire accepts, read from `wire.ts parseNearMisses`; `unresolved` when unreadable. */
export function nearMissKindsFromWire(src = readFileSync(WIRE_PATH, "utf-8")): { kinds: string[]; unresolved: number } {
  const text = lf(src);
  const start = text.indexOf("function parseNearMisses(");
  if (start < 0) return { kinds: [], unresolved: 1 };
  const guard = text.indexOf("n.kind !== ", start);
  const end = text.indexOf(") {", guard);
  if (guard < 0 || end < 0) return { kinds: [], unresolved: 1 };
  const cond = text.slice(guard, end);
  const kinds = [...cond.matchAll(/n\.kind !== "([a-z]+)"/g)].map((m) => m[1]);
  // Nothing but `n.kind !== "…"` alternatives joined by && may stand in the guard.
  const rest = cond.replace(/n\.kind !== "[a-z]+"/g, "").replace(/[&\s]/g, "");
  return { kinds: kinds.sort(), unresolved: rest.length > 0 || kinds.length === 0 ? 1 : 0 };
}
/** The list the tests name — equal to the wire's reading (the census's first case). */
export const NEAR_MISS_KINDS = ["cyclist", "pedestrian", "vehicle"] as const;

/** The wire's own cap on the near-miss list (`MAX_NEAR_MISSES`), read from `wire.ts`; null when unreadable. */
export function nearMissCapFromWire(src = readFileSync(WIRE_PATH, "utf-8")): number | null {
  const m = lf(src).match(/\nconst MAX_NEAR_MISSES = (\d+);\n/);
  return m === null ? null : Number(m[1]);
}

/**
 * The range `wire.ts parseNearMisses` declares for `relSpeedMps` (`!isFiniteNum(n.relSpeedMps) || n.relSpeedMps < MIN
 * || n.relSpeedMps > MAX`); null when that guard is written any other way.
 */
export function nearMissRelSpeedRangeFromWire(src = readFileSync(WIRE_PATH, "utf-8")): { min: number; max: number } | null {
  const m = lf(src).match(/if \(!isFiniteNum\(n\.relSpeedMps\) \|\| n\.relSpeedMps < (\d+) \|\| n\.relSpeedMps > (\d+)\) \{/);
  return m === null ? null : { min: Number(m[1]), max: Number(m[2]) };
}

/**
 * THE RELATIVE SPEEDS A NEAR-MISS CARRIES (round 10, the round-9 verifier's R3: the census drove `relSpeedMps` with
 * integers only, so a builder rounding an ABORTED drive's value to whole m/s survived). A real number, so its domain
 * is taken from the product's own derivation, not listed: the values the scene's detector (`stepNearMiss`, with the
 * config the scene binds, `DEFAULT_NEAR_MISS_CONFIG`) reports for a fixed set of encounters — oncoming, overtaking a
 * slower agent and crossing at an angle, the player at town, boulevard and ring speeds — which are Float32 readings,
 * never whole numbers; and the two ends of the range the wire declares. (Round 11, the round-10 verifier's P12: the
 * sample stopped at 25 m/s, while two cars meeting head-on at 50 km/h already close at 27.8 m/s. So the player also
 * drives at open-road and motorway speeds, and an agent also comes the other way at town and open-road speeds: closing
 * speeds of tens of m/s are in the sample, still as the detector reads them.)
 */
export function relSpeedsFromDetector(): number[] {
  const out: number[] = [];
  const dt = 1 / 60;
  const halfW = 0.9;
  const halfL = 2.2;
  for (const playerMps of [4.2, 8.33, 13.9, 22.2, 33.3]) {
    for (const [dirX, dirY, agentMps] of [
      [0, -1, 5.5],
      [0, -1, 11.1],
      [0, 1, 1.3],
      [Math.sin(Math.PI / 6), Math.cos(Math.PI / 6), 3.7],
      [0, -1, 13.9],
      [0, -1, 22.2],
    ] as const) {
      const tracker = createNearMissTracker(1);
      const agent = { x: halfW + halfW + 0.5, y: dirY < 0 ? 30 : -6, dirX: dirY < 0 ? 0 : dirX, dirY, speedMps: agentMps };
      const player = { x: 0, y: 0, headingDeg: 0, speedMps: playerMps, halfWidthM: halfW, halfLengthM: halfL };
      for (let i = 0; i < 60 * 20; i++) {
        stepNearMiss(tracker, dt, player, [agent], halfW, halfL, DEFAULT_NEAR_MISS_CONFIG, (_i, _c, rel) => out.push(rel));
        player.y += playerMps * dt;
        agent.x += agent.dirX * agentMps * dt;
        agent.y += agent.dirY * agentMps * dt;
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
/** Every relative speed the census and the named cases send: the detector's readings and the wire's declared ends. */
export const REL_SPEED_DOMAIN: readonly number[] = (() => {
  const range = nearMissRelSpeedRangeFromWire();
  const ends = range === null ? [] : [range.min, range.max];
  return [...new Set([...ends, ...relSpeedsFromDetector()])].sort((a, b) => a - b);
})();

/**
 * The range `wire.ts parseNearMisses` declares for `clearanceM` (`!isFiniteNum(n.clearanceM) || n.clearanceM < MIN ||
 * n.clearanceM > MAX`); null when that guard is written any other way.
 */
export function nearMissClearanceRangeFromWire(src = readFileSync(WIRE_PATH, "utf-8")): { min: number; max: number } | null {
  const m = lf(src).match(/if \(!isFiniteNum\(n\.clearanceM\) \|\| n\.clearanceM < (\d+) \|\| n\.clearanceM > (\d+)\) return "invalid";/);
  return m === null ? null : { min: Number(m[1]), max: Number(m[2]) };
}

/**
 * THE CLEARANCES A NEAR-MISS CARRIES (round 11, the round-10 verifier's F5: the census drove `clearanceM` with the
 * hand-listed 0.35 + k·0.1, so builders rewriting an exact 0 or a clearance under 0.15 or 0.2 survived). A real
 * number, so its domain is taken from the product's own derivation: the scene's detector (`stepNearMiss` with the
 * config the scene binds, `DEFAULT_NEAR_MISS_CONFIG`) reports the tightest clearance of an encounter, clamped to
 * EXACTLY 0 when the bodies overlap laterally (traffic/proximity.ts) and otherwise a Float32 reading below the
 * config's `enterClearanceM` (the window never opens at or above it). So an agent is passed at lateral gaps that
 * overlap, touch, and then walk the open interval up to just under `enterClearanceM`, in steps read from that same
 * config — and the two ends of the range the wire declares are added.
 */
export function clearancesFromDetector(): number[] {
  const out: number[] = [];
  const dt = 1 / 60;
  const halfW = 0.9;
  const halfL = 2.2;
  const enter = DEFAULT_NEAR_MISS_CONFIG.enterClearanceM;
  const gaps = [-halfW / 2, -0.2, 0, ...Array.from({ length: 12 }, (_, k) => (enter * (k + 1)) / 13), enter - 0.01];
  for (const gap of gaps) {
    const tracker = createNearMissTracker(1);
    const player = { x: 0, y: 0, headingDeg: 0, speedMps: 8.33, halfWidthM: halfW, halfLengthM: halfL };
    const agent = { x: halfW + halfW + gap, y: 30, dirX: 0, dirY: -1, speedMps: 5.5 };
    for (let i = 0; i < 60 * 10; i++) {
      stepNearMiss(tracker, dt, player, [agent], halfW, halfL, DEFAULT_NEAR_MISS_CONFIG, (_i, clearance) => out.push(clearance));
      player.y += player.speedMps * dt;
      agent.y += agent.dirY * agent.speedMps * dt;
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
/** Every clearance the census and the named cases send: the detector's readings (exact 0 included) and the wire's declared ends. */
export const CLEARANCE_DOMAIN: readonly number[] = (() => {
  const range = nearMissClearanceRangeFromWire();
  const ends = range === null ? [] : [range.min, range.max];
  return [...new Set([...ends, ...clearancesFromDetector()])].sort((a, b) => a - b);
})();

const SHELL_PATH = path.join(PLATFORM_ROOT, "src", "components", "sim", "lesson-ui", "LessonPlayShell.tsx");
/**
 * WHERE THE PAYLOAD'S CLOCKS COME FROM, read from the shell (round 11, the round-10 verifier's F6: the tests drove
 * 1 000 / 71 000 and 5 000 + k·13 — values the product never sends). The drive's start is stamped
 * `startedAtMsRef.current ??= Date.now()` when the drive begins and `= Date.now()` on a retry, `finalize` hands the
 * builder `now: Date.now`, and `finalizeLessonSession` sends `startedAtMs: deps.startedAtMs ?? deps.now()` and
 * `finishedAtMs: deps.now()`. `clock` is "Date.now" only when every one of those is written exactly so.
 */
export function clockCallSitesFromShell(src = readFileSync(SHELL_PATH, "utf-8")): { clock: "Date.now" | null; starts: number; nows: number } {
  const text = lf(src);
  const starts = text.split("startedAtMsRef.current ??= Date.now();").length - 1 + (text.split("startedAtMsRef.current = Date.now();").length - 1);
  const nows = text.split("        now: Date.now,\n").length - 1;
  const assigns = text.split("startedAtMsRef.current =").length - 1 + (text.split("startedAtMsRef.current ??=").length - 1);
  const sends = text.includes("        startedAtMs: deps.startedAtMs ?? deps.now(),\n        finishedAtMs: deps.now(),\n");
  const ok = starts === 2 && assigns === starts && nows === 1 && sends;
  return { clock: ok ? "Date.now" : null, starts, nows };
}
/**
 * THE CLOCK VALUES THE PRODUCT SENDS — `Date.now()` readings: whole milliseconds since the epoch, at today's scale,
 * with any millisecond remainder. The origin IS a `Date.now()` reading (the call the shell makes). A whole number of
 * milliseconds has exactly 1 000 residues under the second — every one a builder could key on (a floor to the second,
 * a dropped or shifted millisecond) — so the census walks ALL of them, on starts and on finishes.
 */
export const EPOCH_ORIGIN_MS: number = Date.now();
export const EPOCH_REMAINDERS_MS: readonly number[] = Array.from({ length: 1000 }, (_, ms) => ms);
