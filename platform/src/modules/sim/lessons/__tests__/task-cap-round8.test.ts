/**
 * THE TASK CEILING, ROUND 8 — the lesson engine, on the committed recorders.
 *
 * The round-7 verifier drove the 521 capped reachZone rows of every practice
 * rung along the committed shadow under thirteen speed profiles
 * (`scratchpad/cap/verify7/probes/zz-v7-arrival.test.ts`, analysed by
 * `verify7/arrival7.cjs`). This file ports the rows it refuted, with its own
 * profiles, byte-for-byte:
 *
 * B · ONE ACT DEFINITION (R5). A sign-bound arrival's act is the M-16 act —
 * it ends only on a correction HELD `speedingRearmSec` (4 s) at or under the
 * sign (`rules/engine.ts` `speedReset`, `speedCorrectionHeld`). Round 7 ended it
 * on ONE frame at the sign, so in the dip profiles (blow, one frame at
 * min(cap, sign) − 1, then max(cap, sign) + 20) every sign-bound row whose
 * arrival billed itself got a TASK bill AND a SPEEDING bill for one continuing
 * overspeed (dip 69, dip2 69), while the
 * mirror order gave one. Each act now has exactly one bill: the arrival's, or
 * the speeding's with the arrival absorbed.
 *
 * B · PRAISE (R6). 77 sign-bound rows (grace 30, graceend 31, hover 16) minted
 * CLEAN_DRIVING while the car was still in that act, after the arrival was
 * absorbed into SPEEDING_DANGEROUS. No CLEAN_DRIVING is minted inside the act
 * now, from the blow to the frame the M-16 correction has been held.
 *
 * C · ABSORPTION FOR THE WHOLE ACT (R7). 31 rows (sc-crossing-rain-sprint,
 * sc-follow-rain-gap, sc-ac-night-overdrive on the resume, twice, hover, dip
 * and dip2 profiles): a weather act named before the blow absorbed the
 * arrival, and a TASK card then surfaced later in that act when the kept act
 * resumed on its feature. None does now.
 *
 * Every row here was RED on round 7 (`scratchpad/cap/r8/red-on-r7*.txt`)
 * except the ones marked GUARD.
 *
 * ROUND 14 — RETIRED HERE: 3 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { shownObjectiveCapKmh } from "../advisor";
import { applyTick, createLessonSession, finishSession } from "../engine";
import { REACH_ZONE_CAP_SLACK_KMH, REACH_ZONE_GRACE_M } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";

// `import.meta.glob` is Vite's compile-time transform (vitest runs it); the app's
// tsconfig carries no `vite/client` types, so the one signature used is declared here.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
}

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const SPEEDING = ["SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS"];
const REARM_SEC = 4; // `speedingRearmSec`

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id}`);
  return s;
};
const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) {
    districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districts.get(id);
}

type Rec = (...a: unknown[]) => unknown;
const mods = import.meta.glob("../../traces/sc*.ts", { eager: true }) as Record<string, Record<string, unknown>>;
const three = new Map<string, Rec>();
const four: Rec[] = [];
for (const m of Object.values(mods)) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn !== "function" || !/^record\w*Drive$/.test(name)) continue;
    const id = name
      .replace(/^record/, "")
      .replace(/Drive$/, "")
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "");
    if ((fn as Rec).length >= 4) four.push(fn as Rec);
    else {
      three.set(id, fn as Rec);
      three.set(id.replace(/-/g, ""), fn as Rec);
    }
  }
}
const ALIAS: Record<string, string> = {
  "sc-vu-cyclist-hook": "sc-vu-cyclist",
  "sc-vu-pass-clearance": "sc-vu-pass",
  "sc-vu-door-zone": "sc-vu-door",
  "sc-rx-tram-stop-doors": "sc-rx-tram-stop",
};

/** The verifier's profiles (verify7/probes/zz-v7-arrival.test.ts), plus `ctrl` (its zz-v7-repeat control: the dip HELD 4.5 s). */
type Profile = "resume" | "hover" | "twice" | "grace" | "graceend" | "dip" | "dip2" | "ctrl";
const graceBand = (posted: number) => posted + Math.min(posted * 0.1, 5) - 0.5;

interface Drive {
  blown: { t: number; v: number; posted: number } | null;
  /** The figure the glass read on the last frame before the blow (the strip's own derivation). */
  shownBeforeBlow: number | null;
  /** The reducer's weather act as the BLOW frame left it (the verifier's `blowKin`). */
  kinAtBlow: { namedBy: string | null; owner: string | null; ownerLapsed: boolean } | null;
  ended: LessonSessionState;
  frames: Array<{ t: number; v: number; posted: number }>;
}
function recorderDrive(id: string, lv: ScenarioLevel, objectiveId: string, prof: Profile): Drive {
  const sp = spec(id);
  const lesson = compileScenario(sp, lv);
  const k = lesson.objectives.findIndex((o) => o.id === objectiveId);
  if (k < 0) throw new Error(`no objective ${objectiveId} on ${id}@L${lv}`);
  const p = lesson.objectives[k].params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  const cap = p.maxSpeedKmh;
  let s = createLessonSession(lesson);
  let blown: Drive["blown"] = null;
  let shownBeforeBlow: number | null = null;
  let kinAtBlow: Drive["kinAtBlow"] = null;
  let dipDone = false;
  let lastT = 0;
  const frames: Drive["frames"] = [];
  const onTick = (tick: SimTick) => {
    if (s.phase !== "driving" && s.phase !== "preDrive") return;
    let tk = tick;
    const cur = s.currentObjectiveIndex;
    const st = s.evalStates[k] as { approachCap?: string } | undefined;
    const d = Math.hypot(tick.position.x - p.x, tick.position.y - p.y);
    const win = d <= p.radiusM + REACH_ZONE_GRACE_M + 30;
    const near = d <= p.radiusM + REACH_ZONE_GRACE_M + 3;
    const up = (v: number) => ({ ...tick, speedKmh: Math.max(tick.speedKmh, v) });
    const set = (v: number) => ({ ...tick, speedKmh: v });
    if (prof === "resume" || prof === "hover" || prof === "twice") {
      if (blown === null) {
        if (cur === k && win && st?.approachCap !== "blown") tk = up(cap + 20);
      } else {
        const dt = tick.t - blown.t;
        if (prof === "resume") {
          if (dt < 6) tk = set(Math.max(3, cap - 10));
          else if (dt < 18) tk = set(cap + 20);
        } else if (prof === "hover") {
          if (dt < 10) tk = set(cap + REACH_ZONE_CAP_SLACK_KMH - 0.5);
          else if (dt < 22) tk = set(cap + 20);
        } else if (dt >= 3 && dt < 15) tk = up(cap + 20);
      }
    } else if (blown === null) {
      if (cur === k && near && st?.approachCap !== "blown") tk = set(cap + REACH_ZONE_CAP_SLACK_KMH + 0.2);
    } else {
      const dt = tick.t - blown.t;
      if (prof === "grace" && dt < 30) tk = set(graceBand(tick.maxSpeedKmh));
      else if (prof === "graceend") tk = set(graceBand(tick.maxSpeedKmh));
      else if (prof === "dip2") {
        if (dt < 1.5) tk = set(graceBand(tick.maxSpeedKmh));
        else if (!dipDone) {
          tk = set(Math.max(1, Math.min(cap, tick.maxSpeedKmh) - 1));
          dipDone = true;
        } else if (dt < 13.5) tk = set(Math.max(cap, tick.maxSpeedKmh) + 20);
      } else if (prof === "dip") {
        if (dt >= 0.3 && !dipDone) {
          tk = set(Math.max(1, Math.min(cap, tick.maxSpeedKmh) - 1));
          dipDone = true;
        } else if (dipDone && dt < 12.3) tk = set(Math.max(cap, tick.maxSpeedKmh) + 20);
      } else if (prof === "ctrl") {
        if (dt < 1.5) tk = set(graceBand(tick.maxSpeedKmh));
        else if (dt < 6) tk = set(Math.max(1, Math.min(cap, tick.maxSpeedKmh) - 1));
        else if (dt < 11) tk = set(Math.max(cap, tick.maxSpeedKmh) + 8);
      }
    }
    const r = applyTick(s, tk);
    s = r.state;
    lastT = tick.t;
    frames.push({ t: tick.t, v: Math.abs(tk.speedKmh), posted: tk.maxSpeedKmh });
    const st2 = s.evalStates[k] as { approachCap?: string } | undefined;
    if (blown === null && st2?.approachCap === "blown") {
      blown = { t: tick.t, v: Math.abs(tk.speedKmh), posted: tk.maxSpeedKmh };
      // Round 14: the kin ledger (its namer, owner and lapse) is gone with founder ruling 2026-10-03; nothing to record.
      kinAtBlow = null;
    }
    if (blown === null && s.currentObjectiveIndex === k) {
      shownBeforeBlow = shownObjectiveCapKmh(s.objectives[k].spec, cap, lesson.postedLimitKmh) ?? null;
    }
  };
  const f = three.get(id) ?? three.get(id.replace(/-/g, "")) ?? three.get(ALIAS[id] ?? "");
  if (f) f(district(sp.map.districtId), "shadow-correct", { onTick });
  else {
    let ok = false;
    for (const g of four) {
      try {
        s = createLessonSession(lesson);
        blown = null;
        shownBeforeBlow = null;
        kinAtBlow = null;
        dipDone = false;
        frames.length = 0;
        g(district(sp.map.districtId), id, "shadow-correct", { onTick });
        ok = true;
        break;
      } catch {
        /* the next generic recorder */
      }
    }
    if (!ok) throw new Error(`no recorder for ${id}`);
  }
  const ended = s.phase === "driving" ? finishSession(s, lastT) : s;
  return { blown, shownBeforeBlow, kinAtBlow, ended, frames };
}

/** Every first bill of a code the lesson kept — coached rows and charged, non-re-grade violations. */
const firstBills = (ended: LessonSessionState, codes: string[]) => [
  ...(ended.coachedMistakes ?? []).filter((c) => codes.includes(c.code)).map((c) => c.t),
  ...ended.events
    .filter((e) => e.kind === "violation" && codes.includes(e.code) && (e as { regrade?: boolean }).regrade !== true)
    .map((e) => e.t),
];
const cleanAt = (ended: LessonSessionState) =>
  ended.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);

/**
 * THE M-16 ACT the blow is in, measured on the frames the session was handed:
 * it opens on a frame over the sign and ends on the first frame on which the
 * car has been continuously at or under the sign for `speedingRearmSec` (or at
 * the drive's end). The same comparison the reducer makes (`speedCorrectionHeld`).
 */
function m16Act(frames: Drive["frames"], blowT: number): { start: number; end: number; endedInside: boolean } {
  let open: number | null = null;
  let since: number | null = null;
  for (const f of frames) {
    if (f.v > f.posted) {
      since = null;
      if (open === null) open = f.t;
      continue;
    }
    if (open === null) continue;
    if (since === null) since = f.t;
    if (f.t - since >= REARM_SEC) {
      if (f.t >= blowT) return { start: open, end: f.t, endedInside: false };
      open = null;
      since = null;
    }
  }
  return { start: open ?? blowT, end: frames[frames.length - 1].t, endedInside: true };
}

type Row = [string, ScenarioLevel, string, Profile];
const expand = (id: string, obj: string, lvs: ScenarioLevel[], profs: Profile[]): Row[] =>
  lvs.flatMap((lv) => profs.map((p): Row => [id, lv, obj, p]));

// ---------------------------------------------------------------------------
// B · R5 — «TASK ARRIVAL THEN SPEEDING IN THE SAME OVER-SIGN ACT» (verify7/arrival7-r7b-full.txt)
// ---------------------------------------------------------------------------

const DIP_TRIPLES: Array<[string, string, ScenarioLevel[]]> = [
  ["sc-ac-night-lights", "sc-acn-lit", [1, 2, 3, 5]],
  ["sc-fo-motorway-gap", "sc-fmg-gap", [1, 2, 3, 5]],
  ["sc-hz-brake-dont-swerve", "sc-hzbds-approach", [1, 2, 3, 5]],
  ["sc-hz-emergency-stop", "sc-hzes-approach", [1, 2, 3, 5]],
  ["sc-jx-priority-confidence", "sc-jxpc-approach", [2, 3, 5]],
  ["sc-ln-turn-lane-arrows", "sc-lnta-lane", [3, 5]],
  ["sc-merge-roadworks-shift", "sc-mrs-works-pace", [3, 5]],
  ["sc-mw-discipline", "sc-mwd-lane", [1, 2, 3, 5]],
  ["sc-mw-min-speed", "sc-mwms-hold", [1, 2, 3, 5]],
  ["sc-mw-min-speed", "sc-mwms-join", [1, 2, 3, 5]],
  ["sc-ov-keep-right", "sc-ovkr-move-right", [3, 5]],
  ["sc-pk-move-off", "sc-pmo-moved", [1, 2, 3, 5]],
  ["sc-rb-lane-choice", "sc-rb2-inner-lane", [2, 3, 5]],
  ["sc-sig-green-wave", "sc-sgw-steady", [3, 5]],
  ["sc-sp-curve", "sc-spcv-approach", [1, 2, 3, 5]],
  ["sc-sp-limit-end", "sc-sple-hold-to-junction", [3]],
  ["sc-sp-limit-end", "sc-sple-hold-to-sign", [3]],
  ["sc-speed-creep", "sc-crp-approach", [2, 3, 5]],
  ["sc-speed-dangerous", "sc-dng-finish", [1, 2, 3, 5]],
  ["sc-speed-dangerous", "sc-dng-hold", [1, 2, 3, 5]],
  ["sc-speed-transition", "sc-trn-approach", [2, 3, 5]],
  ["sc-vu-door-zone", "sc-vud-finish", [2, 3, 5]],
];
const R5_ROWS: Row[] = DIP_TRIPLES.flatMap(([id, obj, lvs]) => expand(id, obj, lvs, ["dip", "dip2"]));

// ---------------------------------------------------------------------------
// B · R6 — «CLEAN_DRIVING MINTED INSIDE THE ACT»
// ---------------------------------------------------------------------------

const R6_ROWS: Row[] = [
  ...expand("sc-fo-motorway-gap", "sc-fmg-gap", [1, 2, 3, 5], ["hover"]),
  ...expand("sc-mw-discipline", "sc-mwd-lane", [1, 2, 3, 5], ["hover"]),
  ...expand("sc-mw-min-speed", "sc-mwms-hold", [1, 2, 3, 5], ["hover"]),
  ...expand("sc-mw-min-speed", "sc-mwms-join", [1, 2, 3, 5], ["hover"]),
  ...expand("sc-ov-bus-lane", "sc-ovbus-general", [1, 2, 3, 5], ["grace", "graceend"]),
  ...expand("sc-ov-lane-keeping", "sc-ovln-east-apex", [1, 2, 3, 5], ["grace", "graceend"]),
  ["sc-pe-zone-living", 1, "sc-pzl-zone", "graceend"],
  ...expand("sc-rb-lane-choice", "sc-rb2-inner-lane", [1], ["grace", "graceend"]),
  ...expand("sc-rb-ped-exit", "sc-rbp-past-east", [1], ["grace", "graceend"]),
  ...expand("sc-rx-tram-left", "sc-rxtl-approach", [1], ["grace", "graceend"]),
  ...expand("sc-sig-green-wave", "sc-sgw-steady", [1, 2], ["grace", "graceend"]),
  ...expand("sc-sp-limit-end", "sc-sple-hold-to-junction", [1, 2], ["grace", "graceend"]),
  ...expand("sc-speed-creep", "sc-crp-approach", [1], ["grace", "graceend"]),
  ...expand("sc-speed-transition", "sc-trn-approach", [1], ["grace", "graceend"]),
  ...expand("sc-turn-left-oncoming", "sc-ltap-approach", [1], ["grace", "graceend"]),
  ...expand("sc-vp-telltale-red", "sc-vptr-amber", [1, 2, 3, 5], ["grace", "graceend"]),
  ...expand("sc-vp-telltale", "sc-vptt-approach", [1, 2, 3, 5], ["grace", "graceend"]),
  ...expand("sc-vu-emergency", "sc-vue-made-way", [1, 2, 3, 5], ["grace", "graceend"]),
];

// ---------------------------------------------------------------------------
// C · R7 — «SURFACED TASK CARD IN A WEATHER ACT NAMED AT THE BLOW»
// ---------------------------------------------------------------------------

const R7_ROWS: Row[] = [
  ...expand("sc-ac-night-overdrive", "sc-acno-adapted", [1], ["resume", "twice"]),
  ...expand("sc-ac-night-overdrive", "sc-acno-adapted", [2, 3, 5], ["hover", "resume", "twice"]),
  ...expand("sc-crossing-rain-sprint", "sc-crs-approach", [1], ["dip", "dip2", "resume", "twice"]),
  ...expand("sc-crossing-rain-sprint", "sc-crs-approach", [2], ["resume", "twice"]),
  ...expand("sc-crossing-rain-sprint", "sc-crs-approach", [3, 5], ["twice"]),
  ...expand("sc-follow-rain-gap", "sc-fr-follow", [1, 2, 3, 5], ["hover", "resume", "twice"]),
];

const label = ([id, lv, obj, prof]: Row) => `${id}@L${lv} ${obj} ${prof}`;

describe("B · one act definition on the committed recorders — each over-sign act has ONE bill, whatever order the codes arrive in (R5)", () => {
  it("the verifier's rows are the rows it listed (dip 69, dip2 69)", () => {
    expect(R5_ROWS.filter((r) => r[3] === "dip")).toHaveLength(69);
    expect(R5_ROWS.filter((r) => r[3] === "dip2")).toHaveLength(69);
  });
  it("the verifier's control (the dip HELD 4.5 s, a correction that counts): two acts, two bills — the arrival's when the correction has been held 4 s, then the speeding's", () => {
    for (const row of expand("sc-speed-dangerous", "sc-dng-hold", [1, 3], ["ctrl"])) {
      const d = recorderDrive(...row);
      expect(d.blown, label(row)).not.toBeNull();
      const act = m16Act(d.frames, d.blown!.t);
      expect(act.endedInside, label(row)).toBe(false);
      const tb = firstBills(d.ended, [TASK]).filter((t) => t >= d.blown!.t - 0.06);
      expect(tb, label(row)).toEqual([act.end]);
      expect(firstBills(d.ended, SPEEDING).filter((t) => t > act.end).length, label(row)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("B · praise is withheld for the whole act (R6)", () => {
  it("the verifier's 77 rows (grace 30, graceend 31, hover 16)", () => {
    expect(R6_ROWS.filter((r) => r[3] === "grace")).toHaveLength(30);
    expect(R6_ROWS.filter((r) => r[3] === "graceend")).toHaveLength(31);
    expect(R6_ROWS.filter((r) => r[3] === "hover")).toHaveLength(16);
  });
  it("every row: no CLEAN_DRIVING from the blow to the frame the M-16 correction has been held", () => {
    const bad: string[] = [];
    let inside = 0;
    for (const row of R6_ROWS) {
      const d = recorderDrive(...row);
      if (d.blown === null) {
        bad.push(`${label(row)}: never blown`);
        continue;
      }
      const act = m16Act(d.frames, d.blown.t);
      // Metres driven inside the act — past a 250 m payout, base would have praised there.
      let m = 0;
      for (let i = 1; i < d.frames.length; i++) {
        const fr = d.frames[i];
        if (fr.t > d.blown.t && fr.t <= act.end) m += (fr.v / 3.6) * Math.min(fr.t - d.frames[i - 1].t, 2);
      }
      if (m >= 250) inside++;
      const c = cleanAt(d.ended).filter((t) => t >= d.blown!.t - 1e-6 && t <= act.end + 0.01);
      if (c.length > 0) bad.push(`${label(row)}: CLEAN_DRIVING@${c.join(",")} inside the act [${d.blown.t}, ${act.end}]`);
    }
    expect(bad).toEqual([]);
    // Not vacuous: every one of the 77 acts is long enough (≥ 250 m) to pay praise out on base.
    expect(inside).toBe(77);
  });
});

describe("C · an arrival absorbed into a weather act never surfaces a TASK card later in that act (R7)", () => {
  it("the verifier's 31 rows", () => {
    expect(R7_ROWS).toHaveLength(31);
  });
});
