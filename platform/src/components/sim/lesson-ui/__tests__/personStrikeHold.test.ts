/**
 * AFTER A PERSON STRIKE THE PRODUCT DOES NOT INVITE THE STUDENT TO DRIVE ON —
 * lane endings2, item C (doc 88 en landing, «Recorded, not filed» candidate 1;
 * integrator rulings N5–N7, N10).
 *
 * THE DEFECT, at 230c7b8. After a scored COLLISION with a pedestrian or a
 * cyclist, the banner and the follow pill kept the route task for ROUTE_HOLD_S
 * (5 s); the crash pin's hold then ended «Ако не опира, огледай се и тогава
 * потегли»; and once the car was more than CRASH_PIN_RADIUS_M (6 m) from the
 * strike the task came back on every surface.
 *
 * THE RULE AS BUILT. From the bill frame, for the rest of the drive, the route
 * hold is "personStruck" (`advisor.ts routeHoldForSession`): the banner and the
 * phone task row print the person lead ALONE (no «: <task>»), the coach card
 * and its peek carry the person copy (`personHoldCopy`), the follow pill stands
 * down. While the pin is armed: do not drive on, stay. Once it is not: the copy
 * names the one exit that exists, by the control's own label
 * (`sessionEndControlLabelBg` — «Прекрати урока», or «Завърши сесията» on a free
 * drive). The duty is named only by its citation, PERSON_STRIKE_DUTY.lawRef.
 * Nothing graded moves; the StatusDashboard off-carriageway mark reads its own
 * predicate (`offCarriagewayHoldForSession`) and is what base showed.
 *
 * Every frame is read through the shell's own functions — `snapshotOf`, the
 * banner mount's expression (`objectiveTitleUnderHold(bannerObjectiveLineBg(
 * snap), …)`), `lessonQueueBinding` (the phone task row), the coach
 * (`advisorPromptForSession`) and the pill gate (`followHintStandsDown`) — on
 * real compiled lessons driven through `applyTick`: committed demo tapes
 * through the live chain where the catalogue has the drive, tick streams on the
 * lesson's own geometry where it does not.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveLawRef } from "@/lib/content/law";
import type { SimTick } from "@/modules/sim/rules";
import {
  LESSONS,
  PERSON_STRIKE_DUTY,
  SCENARIO_TEMPLATES,
  advisorPromptForSession,
  applyTick,
  compileScenario,
  createLessonSession,
  personHoldControlHint,
  routeGuidanceStandsDown,
  routeHoldForSession,
  type LessonSessionState,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";
import { parseScenarioTrace } from "@/modules/sim/traces/parse";
import { liveChainReplay } from "@/modules/sim/lessons/scenario/__tests__/liveChainReplay";
import { loadDistrict } from "@/modules/sim/lessons/scenario/__tests__/witnessLiveRung";
import { followHintStandsDown } from "../../LessonScene";
import { routeGuidanceStandsDown as routeGuidanceStandsDownRG } from "../../RouteGuidance";
import type { DrivelineRejection, DrivelineSnapshot } from "@/modules/sim/vehicle";
import {
  bannerObjectiveLineBg,
  lessonQueueBinding,
  objectiveTitleUnderHold,
  rejectionCauseBg,
  rejectionHint,
  reverseStuckCauseBg,
  reverseStuckHint,
  snapshotOf,
  stuckStartCauseBg,
  stuckStartHint,
  transmissionSwitchCauseBg,
  transmissionSwitchHint,
  worldEdgeDetailBg,
  type HudSnapshot,
} from "../LessonPlayShell";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "../../../../..");
const REPO_ROOT = path.resolve(PLATFORM, "..");

const DUTY = "ЗДвП чл. 123, ал. 1";
/** Round 2 (N12): the armed phase names the exit too — card, peek and lead. */
const armed = (end: string) => ({
  card: `Удари човек — не продължавай с колата. Остани тук и спри урока с „${end}“. Какво е длъжен водачът след удара, казва ${DUTY}.`,
  peek: `Остани тук и избери „${end}“.`,
  lead: `След удара в човек — не продължавай, избери „${end}“`,
});
const ARMED = armed("Прекрати урока");
const free = (end: string) => ({
  card: `Удари човек — не продължавай с колата. Спри урока с „${end}“. Какво е длъжен водачът след удара, казва ${DUTY}.`,
  peek: `Избери „${end}“ — урокът оттук спира.`,
  lead: `След удара в човек — спри и избери „${end}“`,
});
/** Brief, C-TRUTH: no stem that invites driving on (the negated «не продълж…» excepted). */
const DRIVE_ON = /потегл|отдръпни|назад|напред|(?<!не )тръгва|тръгни|(?<!не )продълж|следвай|карай/iu;

interface Frame {
  t: number;
  phase: string;
  hold: string | null;
  pin: boolean;
  banner: string | null;
  taskRow: string | null;
  taskDetail: string | null;
  card: string | null;
  peek: string | null;
  pillDown: boolean;
  offMark: boolean;
  taskTitle: string | null;
}

function frameOf(s: LessonSessionState, k: SimTick, prev: HudSnapshot | null): { f: Frame; snap: HudSnapshot } {
  const snap = snapshotOf(s, k, null, prev);
  const pr = advisorPromptForSession(s);
  const q = lessonQueueBinding({
    snap,
    advisorOn: true,
    examMode: false,
    mistakeMode: false,
    ended: false,
    compact: true,
    taskPing: 0,
    lessonDescriptionBg: s.lesson.descriptionBg ?? "",
    governorCapKmh: null,
  });
  return {
    snap,
    f: {
      t: k.t,
      phase: s.phase,
      hold: snap.objectiveHold,
      pin: s.crashPin !== undefined,
      // The banner mount's expression, verbatim (LessonPlayShell `titleBg=`).
      banner: objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold, snap.objectiveHoldWayOut, snap.objectiveHoldPersonLeadBg),
      taskRow: q.taskLineBg,
      taskDetail: q.fold.taskDetailBg,
      card: pr?.textBg ?? null,
      peek: pr?.peekBg ?? null,
      pillDown: followHintStandsDown(snap.objectiveHold),
      offMark: snap.offCarriagewayHold === true,
      taskTitle: snap.objectiveTitle,
    },
  };
}

function shownStrings(f: Frame): string[] {
  return [f.banner, f.taskRow, f.taskDetail, f.card, f.peek].filter((x): x is string => typeof x === "string");
}

/** Run ticks through applyTick, reading every frame. */
function drive(lesson: LessonSpec, ticks: SimTick[]) {
  let s = createLessonSession(lesson);
  let prev: HudSnapshot | null = null;
  const frames: Frame[] = [];
  const endings: Array<{ t: number; titleBg: string; explanationBg: string; lawRef?: string }> = [];
  for (const k of ticks) {
    const step = applyTick(s, k);
    s = step.state;
    for (const e of step.hudEvents) if (e.kind === "lesson" && /^Край/u.test(e.titleBg)) endings.push({ t: k.t, titleBg: e.titleBg, explanationBg: e.explanationBg, ...(e.lawRef !== undefined ? { lawRef: e.lawRef } : {}) });
    const r = frameOf(s, k, prev);
    prev = r.snap;
    frames.push(r.f);
  }
  return { s, frames, endings };
}

/** A committed tape through the live chain, every frame read. */
function replay(id: string, file: string, L: 1 | 2 | 3 | 4 | 5) {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const lesson = compileScenario(spec, L);
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")))!;
  let prev: HudSnapshot | null = null;
  const frames: Frame[] = [];
  const o = liveChainReplay({
    lesson,
    districtRaw: loadDistrict(spec.map.districtId),
    trace,
    holdAfterSec: 30,
    afterApply: ({ tick, step }) => {
      if (step.state.phase !== "driving") return;
      const r = frameOf(step.state, tick, prev);
      prev = r.snap;
      frames.push(r.f);
    },
  });
  return { s: o.session, frames, lesson };
}

const DT = 0.05;
/**
 * North along x = 4.06 at `kmh`, a person bill on the tick at `strikeY`, then
 * braking to rest `restAfterM` beyond it and standing `standSec`. Optional
 * extra contacts: `[y, withWhat]` on the tick the car reaches y. `offRoadFromY`
 * sends ticks with `edgeId: null` (off the network) from that y on.
 */
function northDrive(o: {
  fromY: number;
  strikeY: number;
  kmh: number;
  restAfterM: number;
  standSec: number;
  body?: "pedestrian" | "cyclist";
  extra?: Array<[number, "staticObject" | "vehicle"]>;
  offRoadStandSec?: number;
}): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  let y = o.fromY;
  const extra = [...(o.extra ?? [])];
  let struck = false;
  const restY = o.strikeY + o.restAfterM;
  while (y < restY) {
    const events: SimTick["events"] = [];
    if (!struck && y >= o.strikeY) { events.push({ kind: "collision", withWhat: o.body ?? "pedestrian" }); struck = true; }
    while (extra.length > 0 && y >= extra[0][0]) events.push({ kind: "collision", withWhat: extra.shift()![1] });
    // full speed up to the strike, then a linear slow-down to rest
    const v = !struck ? o.kmh : Math.max(2, o.kmh * Math.sqrt(Math.max(0, (restY - y) / Math.max(o.restAfterM, 0.01))));
    ticks.push(makeTick({ t, speedKmh: v, headingDeg: 0, position: { x: 4.06, y }, events }));
    t = +(t + DT).toFixed(6);
    y += (v / 3.6) * DT;
  }
  for (let i = 0; i < o.standSec / DT; i++) {
    ticks.push(makeTick({ t, speedKmh: 0, headingDeg: 0, position: { x: 4.06, y }, ...(o.offRoadStandSec !== undefined && i * DT < o.offRoadStandSec ? { edgeId: null } : {}) }));
    t = +(t + DT).toFixed(6);
  }
  return ticks;
}

function scenario(id: string, L: 1 | 2 | 3 | 4 | 5) {
  return compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === id)!, L);
}

describe("(1) the bill frame and the first five seconds — the armed hold, no task, the pill down", () => {
  for (const [id, file, L] of [
    ["sc-pe-jaywalker", "mistake-collision.trace.json", 2],
    ["sc-crossing-child-ball", "mistake-collision.trace.json", 2],
  ] as const) {
    it(`${id}/${file}@L${L} (committed tape): at the bill and +0.05 / +1 / +4.9 s every surface carries the armed person copy`, () => {
      const d = replay(id, file, L);
      const struck = d.s.personStruckAtSec;
      expect(struck).toBeDefined();
      const at = (dt: number) => d.frames.find((f) => f.t >= struck! + dt - 1e-9)!;
      for (const dt of [0, 0.05, 1, 4.9]) {
        const f = at(dt);
        expect(f, `frame at bill +${dt}`).toBeDefined();
        expect(f.hold).toBe("personStruck");
        expect(f.banner).toBe(ARMED.lead);
        expect(f.taskRow).toBe(ARMED.lead);
        expect(f.card).toBe(ARMED.card);
        expect(f.peek).toBe(ARMED.peek);
        expect(f.pillDown).toBe(true);
        // the lead stands ALONE — the task's own title is nowhere on it
        if (f.taskTitle !== null) expect(f.banner!.includes(f.taskTitle)).toBe(false);
      }
      // no frame before the bill carries the person hold
      expect(d.frames.filter((f) => f.t < struck! - 1e-9 && f.hold === "personStruck")).toEqual([]);
      console.log(`[${id}@L${L}] shown after the bill:`, JSON.stringify([...new Set(d.frames.filter((f) => f.t >= struck!).flatMap(shownStrings))]));
    });
  }

  it("a CYCLIST bill raises the same hold (sc-crossing-child-ball@L2, a cyclist struck at 30 km/h)", () => {
    const d = drive(scenario("sc-crossing-child-ball", 2), northDrive({ fromY: 70, strikeY: 90, kmh: 30, restAfterM: 2, standSec: 3, body: "cyclist" }));
    expect(d.s.personStruckAtSec).toBeDefined();
    const after = d.frames.filter((f) => f.t >= d.s.personStruckAtSec!);
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((f) => f.hold !== "personStruck" || f.card !== ARMED.card)).toEqual([]);
  });
});

describe("(2) the obedient student — strike at 40 km/h, rest 8 m on, stand 120 s", () => {
  it("sc-pe-jaywalker@L2: the drive stays open, the pin is gone, and every later frame names «Прекрати урока»; the task never returns", () => {
    const d = drive(scenario("sc-pe-jaywalker", 2), northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 120 }));
    expect(d.s.phase).toBe("driving");
    expect(d.endings).toEqual([]);
    expect(d.s.crashPin).toBeUndefined();
    const struck = d.s.personStruckAtSec!;
    const after = d.frames.filter((f) => f.t >= struck);
    const armed = after.filter((f) => f.pin);
    const freeFrames = after.filter((f) => !f.pin);
    expect(armed.length).toBeGreaterThan(0);
    expect(freeFrames.length).toBeGreaterThan(120 / DT - 10);
    const F = free("Прекрати урока");
    expect(armed.filter((f) => f.card !== ARMED.card || f.peek !== ARMED.peek || f.banner !== ARMED.lead)).toEqual([]);
    expect(freeFrames.filter((f) => f.hold !== "personStruck" || f.card !== F.card || f.peek !== F.peek || f.banner !== F.lead || f.taskRow !== F.lead || !f.pillDown)).toEqual([]);
    // no frame from the bill on re-issues the task
    expect(after.filter((f) => f.taskTitle !== null && shownStrings(f).some((x) => x.includes(f.taskTitle!)))).toEqual([]);
    console.log("[obedient jaywalker@L2] shown:", JSON.stringify([...new Set(after.flatMap(shownStrings))]));
  });

  it("the same on a FREE DRIVE (l0-free-drive) names «Завърши сесията», the control that drive shows; no banner task exists", () => {
    const lesson = LESSONS.find((l) => l.id === "l0-free-drive")!;
    expect(lesson.objectives.length).toBe(0);
    const d = drive(lesson, northDrive({ fromY: 10, strikeY: 30, kmh: 40, restAfterM: 8, standSec: 120 }));
    expect(d.s.phase).toBe("driving");
    const F = free("Завърши сесията");
    const after = d.frames.filter((f) => f.t >= d.s.personStruckAtSec!);
    const freeFrames = after.filter((f) => !f.pin);
    expect(freeFrames.length).toBeGreaterThan(0);
    expect(freeFrames.filter((f) => f.card !== F.card || f.peek !== F.peek)).toEqual([]);
    expect(after.filter((f) => f.banner !== null)).toEqual([]);
    expect(after.flatMap(shownStrings).filter((x) => x.includes("Прекрати урока"))).toEqual([]);
  });
});

describe("(3) a person bill, then a static bill 2 m on — the person hold and the citation survive; the corrective follows the last impact", () => {
  it("sc-pe-jaywalker@L2", () => {
    const d = drive(
      scenario("sc-pe-jaywalker", 2),
      northDrive({ fromY: 0, strikeY: 20, kmh: 30, restAfterM: 3, standSec: 15, extra: [[22, "staticObject"]] }),
    );
    expect(d.s.personStruckAtSec).toBeDefined();
    expect(d.s.events.filter((e) => e.kind === "violation" && e.code === "COLLISION").map((e) => (e as { detail?: string }).detail)).toEqual(["pedestrian", "staticObject"]);
    // the pin's last impact is the static body — E10 keys the corrective on it
    expect(d.s.crashPin?.impact?.body).toBe("staticObject");
    const after = d.frames.filter((f) => f.t >= d.s.personStruckAtSec! && f.phase === "driving");
    expect(after.filter((f) => f.hold !== "personStruck" || f.card !== ARMED.card)).toEqual([]);
    expect(d.endings.length).toBe(1);
    expect(d.endings[0].titleBg).toBe("Край на упражнението след удара");
    expect(d.endings[0].lawRef).toBe(PERSON_STRIKE_DUTY.lawRef);
    // the corrective is the static body's (no listed scenery → the general one), not «vulnerable»
    expect(d.endings[0].explanationBg.endsWith("по-ранно намаляване и достатъчно място около колата.")).toBe(true);
  });
});

describe("(4) N10 — an off-road rest after a person strike keeps the StatusDashboard mark base showed", () => {
  it("the snapshot's off-carriageway fact is true while the hold is personStruck, and both mounts read it", () => {
    const d = drive(
      scenario("sc-pe-jaywalker", 2),
      northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 12, offRoadStandSec: 12 }),
    );
    const offFrames = d.frames.filter((f) => f.hold === "personStruck" && f.offMark);
    // base's predicate: no pin and off the network for ROUTE_HOLD_S
    expect(offFrames.length).toBeGreaterThan(0);
    expect(d.frames.filter((f) => f.offMark && f.pin)).toEqual([]);
    const shell = readFileSync(path.join(HERE, "..", "LessonPlayShell.tsx"), "utf-8");
    expect(shell.split("offCarriageway={snap.offCarriagewayHold === true}").length - 1).toBe(2);
    expect(shell.includes('offCarriageway={snap.objectiveHold === "offRoad"}')).toBe(false);
  });
});

describe("(5) the copy — no invitation to drive on, the citation retrieved and typed once", () => {
  it("no person string matches the drive-on stems; the cards end with the citation", () => {
    for (const c of [ARMED, armed("Завърши сесията"), free("Прекрати урока"), free("Завърши сесията")]) {
      for (const x of [c.card, c.peek, c.lead]) expect(DRIVE_ON.test(x), x).toBe(false);
      expect(c.card.endsWith(`${PERSON_STRIKE_DUTY.lawRef}.`)).toBe(true);
      expect([...c.card].length).toBeLessThan(150);
      expect([...c.lead].length).toBeLessThanOrEqual(66);
      // the phone advisor row prints the peek: two 24-character lines
      expect([...c.peek].length).toBeLessThanOrEqual(48);
      // N12 — every phase names the exit on every surface
      for (const x of [c.card, c.peek, c.lead]) expect(/„(Прекрати урока|Завърши сесията)“/u.test(x), x).toBe(true);
    }
  });

  it("the shown strings of every driven case match no drive-on stem from the bill frame on", () => {
    const runs = [
      drive(scenario("sc-pe-jaywalker", 2), northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 30 })),
      drive(scenario("sc-crossing-child-ball", 2), northDrive({ fromY: 70, strikeY: 90, kmh: 30, restAfterM: 2, standSec: 15, body: "cyclist" })),
    ];
    for (const d of runs) {
      const bad = d.frames.filter((f) => f.t >= d.s.personStruckAtSec!).flatMap(shownStrings).filter((x) => DRIVE_ON.test(x));
      expect(bad).toEqual([]);
    }
  });

  it("PERSON_STRIKE_DUTY resolves to ЗДвП чл. 123 in the law bank", () => {
    expect(PERSON_STRIKE_DUTY.lawRef).toBe(DUTY);
    const hit = resolveLawRef({ act: "ЗДвП", ref: "чл. 123" });
    expect(hit.found).toBe(true);
  });

  it("«чл. 123» is typed in exactly ONE string literal across modules/sim and components/sim (comments excluded)", () => {
    const roots = [path.join(PLATFORM, "src", "modules", "sim"), path.join(PLATFORM, "src", "components", "sim")];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !p.includes(`${path.sep}__tests__${path.sep}`)) {
          const src = readFileSync(p, "utf-8");
          if (!src.includes("чл. 123")) continue;
          const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
          const visit = (n: ts.Node) => {
            if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) && n.text.includes("чл. 123")) {
              hits.push(`${path.relative(PLATFORM, p)}: ${n.text}`);
            }
            ts.forEachChild(n, visit);
          };
          visit(sf);
        }
      }
    };
    for (const r of roots) walk(r);
    // THE ONE NEW SITE: the coach, the ending, the shell and the end card type
    // the article nowhere — they interpolate PERSON_STRIKE_DUTY.lawRef.
    const isTemplate = (h: string) => h.replace(/\\/g, "/").includes("/scenario/templates-");
    const coach = hits.filter((h) => !isTemplate(h));
    expect(coach).toEqual([`${path.join("src", "modules", "sim", "lessons", "finish.ts")}: ${DUTY}`]);
    // …and the three that were already there at 230c7b8 (the brief's F12 said
    // „none"; it was stale): two scenario rows' own lawRef fields and one
    // authored explanation of sc-hz-accident-scene, untouched by this lane.
    const authored = hits.filter(isTemplate).map((h) => h.slice(0, h.indexOf(":")).replace(/\\/g, "/") + ":" + (h.includes("ЗДвП чл. 123; чл. 20") ? "lawRef 123;20" : h.endsWith("ЗДвП чл. 123") ? "lawRef 123" : "explanation"));
    expect(authored.sort()).toEqual([
      "src/modules/sim/lessons/scenario/templates-hazards2.ts:explanation",
      "src/modules/sim/lessons/scenario/templates-hazards2.ts:lawRef 123;20",
      "src/modules/sim/lessons/scenario/templates-reels.ts:lawRef 123",
    ]);
  });
});

/**
 * ROUND 2 — N11 / N12 (verifier finding R1, condition C1). A committed tape
 * through the live chain, held `holdAfterSec` at rest after it ends, every HUD
 * event and every frame read from the bill on.
 */
function replayEvents(id: string, file: string, L: 1 | 2 | 3 | 4 | 5, holdAfterSec: number) {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const lesson = compileScenario(spec, L);
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")))!;
  let prev: HudSnapshot | null = null;
  let struck: number | undefined;
  const frames: Array<Frame & { yieldHolding: boolean }> = [];
  const events: Array<{ t: number; e: Record<string, unknown> }> = [];
  const teach: Array<{ t: number; m: Record<string, unknown> }> = [];
  const o = liveChainReplay({
    lesson,
    districtRaw: loadDistrict(spec.map.districtId),
    trace,
    holdAfterSec,
    afterApply: ({ t, tick, step }) => {
      if (struck === undefined) struck = step.state.personStruckAtSec;
      if (struck === undefined) return;
      for (const e of step.hudEvents) events.push({ t, e: e as unknown as Record<string, unknown> });
      for (const m of step.teachMoments ?? []) teach.push({ t, m: m as unknown as Record<string, unknown> });
      if (step.state.phase !== "driving") return;
      const r = frameOf(step.state, tick, prev);
      prev = r.snap;
      frames.push({ ...r.f, yieldHolding: step.state.yieldWait?.holding === true });
    },
  });
  return { s: o.session, struck: struck!, frames, events, teach, lesson };
}

/** Every string field of a HUD event (titles, paragraphs, peeks, chips). */
const eventText = (e: Record<string, unknown>) =>
  Object.values(e).filter((v): v is string => typeof v === "string").join(" ");
/** The yield voice's two notice families (advisor.ts `yieldVoiceCopyFor`). */
const YIELD_VOICE_TITLE = /^(Защо чакаш|Чакането Е маневрата|Интервалът)/u;

describe("(6) N11 — after the strike no coach channel teaches the next move of the drive", () => {
  it("sc-merge-from-property/mistake-walk-through@L1, held 240 s: the Б2 yield voice is silent from the bill on, although the wait still holds", () => {
    const d = replayEvents("sc-merge-from-property", "mistake-walk-through.trace.json", 1, 240);
    expect(d.struck).toBeDefined();
    const after = d.events.filter((x) => x.t >= d.struck - 1e-9);
    // the voice had a lawful wait to speak about on the frames that matter
    expect(d.frames.filter((f) => f.yieldHolding).length).toBeGreaterThan(20);
    expect(after.filter((x) => x.e.kind === "lesson" && YIELD_VOICE_TITLE.test(String(x.e.titleBg)))).toEqual([]);
    expect(after.filter((x) => x.e.kind === "objectiveComplete")).toEqual([]);
    // no string of any HUD event after the bill invites driving on
    expect(after.map((x) => eventText(x.e)).filter((tx) => DRIVE_ON.test(tx))).toEqual([]);
    console.log("[N11 merge@L1] HUD events after the bill:", JSON.stringify(after.map((x) => `${x.t.toFixed(2)} ${x.e.kind}: ${String(x.e.titleBg ?? "")}`)));
    console.log("[N11 merge@L1] teach moments after the bill:", JSON.stringify(d.teach.map((x) => `${x.t.toFixed(2)} ${String(x.m.code)}: ${String(x.m.titleBg ?? "")}`)));
  });

  it("…and C1: through the ~190 s the Б2 freeze keeps the pin armed, every frame names «Прекрати урока» on the banner, the card and the peek", () => {
    const d = replayEvents("sc-merge-from-property", "mistake-walk-through.trace.json", 1, 240);
    const armedFrames = d.frames.filter((f) => f.pin);
    // the C1 case: the pin stays armed long after the 10 s dwell would have ended it
    expect(armedFrames.length * 0.05).toBeGreaterThan(60);
    expect(d.frames.filter((f) => f.hold !== "personStruck")).toEqual([]);
    expect(armedFrames.filter((f) => f.card !== ARMED.card || f.peek !== ARMED.peek || f.banner !== ARMED.lead || f.taskRow !== ARMED.lead)).toEqual([]);
    expect(d.frames.flatMap(shownStrings).filter((x) => DRIVE_ON.test(x))).toEqual([]);
    expect(d.frames.filter((f) => !f.pillDown)).toEqual([]);
  });

  it("sc-crossing-child-ball/mistake-collision@L2: no «Защо чакаш: пешеходец на пътеката…» over the child just struck", () => {
    const d = replayEvents("sc-crossing-child-ball", "mistake-collision.trace.json", 2, 30);
    const after = d.events.filter((x) => x.t >= d.struck - 1e-9);
    expect(d.frames.filter((f) => f.yieldHolding).length).toBeGreaterThan(0);
    expect(after.filter((x) => x.e.kind === "lesson" && YIELD_VOICE_TITLE.test(String(x.e.titleBg)))).toEqual([]);
    expect(after.map((x) => eventText(x.e)).filter((tx) => DRIVE_ON.test(tx))).toEqual([]);
  });

  it("an objective's own notice is not pushed after the strike (a capped mark passed at 40 km/h); the same drive without the strike pushes it (control)", () => {
    const lesson: LessonSpec = {
      id: "t-person-notice",
      order: 99,
      titleBg: "Тестов маршрут",
      descriptionBg: "тест",
      conceptIds: [],
      spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
      preDrive: false,
      postedLimitKmh: 50,
      objectives: [
        { id: "t-capped", titleBg: "Мини бавно през точката", kind: "reachZone", params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 } },
        { id: "t-finish", titleBg: "Спри в края на маршрута", kind: "reachZone", params: { x: 0, y: 300, radiusM: 15 } },
      ],
    };
    const run = (strikeAt: number | null) => {
      let s = createLessonSession(lesson);
      const out: Array<{ i: number; kind: string; titleBg: string }> = [];
      for (let i = 0; i <= 140 * 4; i++) {
        const y = i / 4;
        const t = +(y / (40 / 3.6)).toFixed(4);
        const events: SimTick["events"] = i === strikeAt ? [{ kind: "collision", withWhat: "pedestrian" }] : [];
        const r = applyTick(s, makeTick({ t, speedKmh: 40, headingDeg: 0, position: { x: 0, y }, maxSpeedKmh: 50, events }));
        s = r.state;
        for (const e of r.hudEvents) out.push({ i, kind: e.kind, titleBg: String((e as { titleBg?: string }).titleBg ?? "") });
      }
      return { s, out };
    };
    const NOTICE = "Стигна точката, но твърде бързо";
    const control = run(null);
    const fired = control.out.filter((e) => e.kind === "lesson" && e.titleBg === NOTICE);
    expect(fired.length).toBe(1);
    // struck 50 m before the mark, and struck ON the very frame the notice fires (the bill frame)
    for (const strikeAt of [50 * 4, fired[0].i]) {
      const struck = run(strikeAt);
      expect(struck.s.personStruckAtSec, `strike at tick ${strikeAt}`).toBeDefined();
      expect(struck.out.filter((e) => e.kind === "lesson" && e.titleBg === NOTICE), `strike at tick ${strikeAt}`).toEqual([]);
    }
  });

  it("sc-crossing-rain-sprint/mistake-not-yielded@L1: the task still completes after the strike (grading unchanged), but no ✓ «…и продължи по улицата» flash is pushed", () => {
    const d = replayEvents("sc-crossing-rain-sprint", "mistake-not-yielded.trace.json", 1, 30);
    const doneAfter = d.s.objectives.filter((o) => o.completedAtSec !== undefined && o.completedAtSec !== null && o.completedAtSec >= d.struck);
    expect(doneAfter.map((o) => o.spec.titleBg)).toContain("Подмини пътеката и продължи по улицата");
    expect(d.events.filter((x) => x.t >= d.struck - 1e-9 && x.e.kind === "objectiveComplete")).toEqual([]);
  });
});

describe("the hold is display only — routeHoldForSession never returns personStruck before the bill", () => {
  it("a drive with no person strike never raises it", () => {
    const ticks: SimTick[] = [];
    for (let i = 0; i < 400; i++) ticks.push(makeTick({ t: i * DT, speedKmh: 30, headingDeg: 0, position: { x: 4.06, y: (30 / 3.6) * DT * i } }));
    const d = drive(scenario("sc-pe-jaywalker", 2), ticks);
    expect(d.frames.filter((f) => f.hold === "personStruck")).toEqual([]);
    expect(routeHoldForSession(d.s)).not.toBe("personStruck");
  });
});

/**
 * ROUND 3 — N15 (verifier condition C1, its mutant W2). Every yield-voice
 * notice on a committed tape after a strike fires while the pin is still
 * armed, so a guard that silenced the voice only while the pin is armed passed
 * every test above. This drive takes the pin away first: a pedestrian struck at
 * 30 km/h, the car driven on ~180 m (the pin drops past CRASH_PIN_RADIUS_M, and
 * the COLLISION's own conviction window, YIELD_VOICE_EPISODE_GAP_S, is spent),
 * then a lawful wait at a Б2 stop line. The same drive without the strike is
 * the control: there the voice speaks.
 */
describe("(7) N15 — the yield voice stays silent after the pin has dropped", () => {
  const lesson: LessonSpec = {
    id: "t-person-yield",
    order: 99,
    titleBg: "Тестов маршрут",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: 50,
    objectives: [{ id: "t-far", titleBg: "Спри в края на маршрута", kind: "reachZone", params: { x: 0, y: 600, radiusM: 15 } }],
  };
  const run = (strike: boolean) => {
    let s = createLessonSession(lesson);
    const events: Array<{ t: number; e: Record<string, unknown> }> = [];
    const pinAtWait: boolean[] = [];
    const holdAtWait: Array<string | null> = [];
    let t = 0;
    let y = 0;
    let struckFrame = false;
    let pinSeen = false;
    const tickAt = (k: SimTick) => {
      const r = applyTick(s, k);
      s = r.state;
      if (s.crashPin !== undefined) pinSeen = true;
      for (const e of r.hudEvents) events.push({ t: k.t, e: e as unknown as Record<string, unknown> });
    };
    // 30 km/h north to y = 200, the strike on the tick that reaches y = 20
    while (y < 200) {
      const evs: SimTick["events"] = [];
      if (strike && !struckFrame && y >= 20) {
        evs.push({ kind: "collision", withWhat: "pedestrian" });
        struckFrame = true;
      }
      tickAt(makeTick({ t, speedKmh: 30, headingDeg: 0, position: { x: 0, y }, events: evs }));
      t = +(t + DT).toFixed(6);
      y += (30 / 3.6) * DT;
    }
    // at rest 3 m short of a Б2 stop line, 40 s
    for (let i = 0; i < 40 / DT; i++) {
      tickAt(makeTick({ t, speedKmh: 0, headingDeg: 0, position: { x: 0, y }, nextStopLineM: 3, nextStopLineControl: "stopSign" }));
      pinAtWait.push(s.crashPin !== undefined);
      holdAtWait.push(routeHoldForSession(s));
      t = +(t + DT).toFixed(6);
    }
    return { s, events, pinAtWait, holdAtWait, pinSeen };
  };

  it("control: with no strike the Б2 wait is narrated", () => {
    const c = run(false);
    expect(c.s.yieldWait?.holding).toBe(true);
    expect(c.events.filter((x) => x.e.kind === "lesson" && YIELD_VOICE_TITLE.test(String(x.e.titleBg))).length).toBeGreaterThan(0);
  });

  it("after a pedestrian strike, the pin armed and then dropped, the same wait gets no yield-voice notice and the hold names the exit", () => {
    const d = run(true);
    expect(d.s.personStruckAtSec).toBeDefined();
    expect(d.pinSeen).toBe(true); // the pin did arm at the strike…
    expect(d.pinAtWait.every((p) => !p)).toBe(true); // …and is gone at the wait
    expect(d.s.yieldWait?.holding).toBe(true); // the wait is lawful and holding
    expect(d.holdAtWait.every((h) => h === "personStruck")).toBe(true);
    const after = d.events.filter((x) => x.t >= d.s.personStruckAtSec! - 1e-9);
    expect(after.filter((x) => x.e.kind === "lesson" && YIELD_VOICE_TITLE.test(String(x.e.titleBg)))).toEqual([]);
    expect(after.map((x) => eventText(x.e)).filter((tx) => DRIVE_ON.test(tx))).toEqual([]);
    expect(advisorPromptForSession(d.s)?.peekBg).toBe(free("Прекрати урока").peek);
  });
});

/**
 * ROUND 3 — N16 (verifier condition C2). The shell's four car-control hints
 * under the person hold: the cause in one sentence, then the exit of the
 * current phase; outside the hold the very hint that shipped.
 */
describe("(8) N16 — the car-control hints say the cause and the exit under the person hold", () => {
  const lessonL2 = scenario("sc-pe-jaywalker", 2);
  // real sessions: no strike, struck with the pin armed, struck with it dropped, a free drive struck
  const noStrikeTicks: SimTick[] = [];
  for (let i = 0; i < 40; i++) noStrikeTicks.push(makeTick({ t: i * DT, speedKmh: 20, headingDeg: 0, position: { x: 4.06, y: (20 / 3.6) * DT * i } }));
  const noStrike = drive(lessonL2, noStrikeTicks).s;
  const armedS = drive(lessonL2, northDrive({ fromY: 0, strikeY: 20, kmh: 30, restAfterM: 2, standSec: 3 })).s;
  const freeS = drive(lessonL2, northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 5 })).s;
  const freeDrive = LESSONS.find((l) => l.objectives.length === 0)!;
  const freeDriveS = drive(freeDrive, northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 5 })).s;

  const snap = (selector: DrivelineSnapshot["selector"], transmission: DrivelineSnapshot["transmission"], manualGear = 5) =>
    ({ transmission, engineOn: true, stalled: false, selector, manualGear, clutchDown: false }) as unknown as DrivelineSnapshot;
  type Case = { name: string; hint: { titleBg: string; explanationBg: string; key?: string }; cause: string };
  const cases: Case[] = [];
  for (const input of ["keyboard", "touch"] as const) {
    for (const tr of ["automatic", "manual"] as const) {
      for (const reason of ["engineOff", "stalled", "parked", "neutral", "parkingBrake"] as const) {
        cases.push({ name: `stuckStart ${reason} ${tr} ${input}`, hint: stuckStartHint(reason, tr, input), cause: stuckStartCauseBg(reason) });
      }
      for (const to of ["P", "R", "N", "D", "M"] as const) {
        for (const box of ["automatic", "manual"] as const) {
          cases.push({ name: `transmissionSwitch ${tr}→${to} lesson ${box} ${input}`, hint: transmissionSwitchHint(tr, to, input, box), cause: transmissionSwitchCauseBg(to) });
        }
      }
      const rejections: DrivelineRejection[] = [
        { kind: "startRejected", reason: "clutch" },
        { kind: "startRejected", reason: "selector" },
        { kind: "shiftRejected", reason: "speed" },
        { kind: "shiftRejected", reason: "clutch" },
        { kind: "shiftRejected", reason: "endOfGate" },
      ];
      for (const rj of rejections) {
        for (const sel of ["P", "D", "M"] as const) {
          const sn = snap(sel, tr);
          cases.push({ name: `rejection ${rj.kind}/${rj.reason} at ${sel} ${tr} ${input}`, hint: rejectionHint(rj, sn, input), cause: rejectionCauseBg(rj, sn) });
        }
      }
    }
  }
  for (const dir of ["backward", "forward"] as const) {
    cases.push({ name: `reverseStuck ${dir}`, hint: reverseStuckHint(dir), cause: reverseStuckCauseBg(dir) });
  }

  it("the sessions are what they claim", () => {
    expect(routeHoldForSession(noStrike)).not.toBe("personStruck");
    expect(routeHoldForSession(armedS)).toBe("personStruck");
    expect(armedS.crashPin).toBeDefined();
    expect(routeHoldForSession(freeS)).toBe("personStruck");
    expect(freeS.crashPin).toBeUndefined();
    expect(routeHoldForSession(freeDriveS)).toBe("personStruck");
  });

  it("outside the hold every hint is the one that shipped — the same object", () => {
    for (const c of cases) expect(personHoldControlHint(noStrike, c.hint, c.cause), c.name).toBe(c.hint);
  });

  it("under the hold: title = the cause, paragraph = the phase's exit peek, the rate-limit key kept; no drive-on stem anywhere", () => {
    for (const [s, exit] of [
      [armedS, ARMED.peek],
      [freeS, free("Прекрати урока").peek],
      [freeDriveS, free("Завърши сесията").peek],
    ] as const) {
      for (const c of cases) {
        const h = personHoldControlHint(s, c.hint, c.cause);
        expect(h.titleBg, c.name).toBe(c.cause);
        expect(h.explanationBg, c.name).toBe(exit);
        if (c.hint.key !== undefined) expect((h as { key?: string }).key, c.name).toBe(c.hint.key);
        expect(DRIVE_ON.test(h.titleBg) || DRIVE_ON.test(h.explanationBg), `${c.name}: ${h.titleBg} / ${h.explanationBg}`).toBe(false);
      }
    }
  });

  it("the raw hints DID teach a move (the defect this answers), and every cause is one short sentence", () => {
    expect(cases.filter((c) => DRIVE_ON.test(c.hint.titleBg + " " + c.hint.explanationBg)).length).toBeGreaterThan(0);
    const causes = [...new Set(cases.map((c) => c.cause))];
    for (const c of causes) {
      expect(c.length, c).toBeLessThanOrEqual(48);
      expect(/[.!?]/u.test(c), c).toBe(false);
    }
  });

  it("each of the four shell handlers answers through personHoldControlHint with its own cause table, on the live session", () => {
    const src = readFileSync(path.join(HERE, "..", "LessonPlayShell.tsx"), "utf-8").replace(/\r\n/g, "\n");
    const body = (name: string) => {
      const at = src.indexOf(`const ${name} = useCallback(`);
      expect(at, name).toBeGreaterThan(0);
      return src.slice(at, src.indexOf("\n  );\n", at));
    };
    const wire: Array<[string, RegExp]> = [
      ["handleDrivelineRejection", /personHoldControlHint\(\s*sessionRef\.current,\s*rejectionHint\(rejection, snap, hintInput\),\s*rejectionCauseBg\(rejection, snap\),?\s*\)/],
      ["handleReversePedalStuck", /personHoldControlHint\(\s*sessionRef\.current,\s*reverseStuckHint\(direction\),\s*reverseStuckCauseBg\(direction\),?\s*\)/],
      ["handleStuckStart", /personHoldControlHint\(\s*sessionRef\.current,\s*stuckStartHint\(reason, drivelineRef\.current\?\.transmission \?\? "automatic", hintInput\),\s*stuckStartCauseBg\(reason\),?\s*\)/],
      ["handleTransmissionChanged", /personHoldControlHint\(\s*sessionRef\.current,\s*transmissionSwitchHint\(transmission, movedSelectorTo, hintInput, lessonBox\),\s*transmissionSwitchCauseBg\(movedSelectorTo\),?\s*\)/],
    ];
    for (const [name, re] of wire) {
      const b = body(name);
      expect(b, name).toMatch(re);
      // the push reads the wrapped hint: exactly one builder call in the handler
      expect(b.match(/(stuckStartHint|reverseStuckHint|transmissionSwitchHint|rejectionHint)\(/g)?.length, name).toBe(1);
    }
  });
});

/**
 * ROUND 3 — the shell's own surfaces that name the route after N14 hid it: the
 * ribbon legend (phone line and PC panel) and the world-edge card.
 */
describe("(9) N14/N16 in the shell — the legend leaves with the lines, the world-edge card ends on the exit", () => {
  const lessonL2 = scenario("sc-pe-jaywalker", 2);
  const armedS = drive(lessonL2, northDrive({ fromY: 0, strikeY: 20, kmh: 30, restAfterM: 2, standSec: 3 })).s;
  const freeS = drive(lessonL2, northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 5 })).s;
  const noStrikeTicks: SimTick[] = [];
  for (let i = 0; i < 40; i++) noStrikeTicks.push(makeTick({ t: i * DT, speedKmh: 20, headingDeg: 0, position: { x: 4.06, y: (20 / 3.6) * DT * i } }));
  const noStrike = drive(lessonL2, noStrikeTicks).s;
  const lastTick = (s: LessonSessionState): SimTick => makeTick({ t: s.lastT });

  it("the predicate the shell reads is the one the layer reads", () => {
    expect(routeGuidanceStandsDownRG).toBe(routeGuidanceStandsDown);
    expect(routeGuidanceStandsDown(routeHoldForSession(armedS))).toBe(true);
    expect(routeGuidanceStandsDown(routeHoldForSession(noStrike))).toBe(false);
  });

  it("the snapshot carries the phase's exit sentence under the person hold, null without one", () => {
    expect(snapshotOf(armedS, lastTick(armedS), null, null).objectiveHoldPersonPeekBg).toBe(ARMED.peek);
    expect(snapshotOf(freeS, lastTick(freeS), null, null).objectiveHoldPersonPeekBg).toBe(free("Прекрати урока").peek);
    expect(snapshotOf(noStrike, lastTick(noStrike), null, null).objectiveHoldPersonPeekBg).toBeNull();
  });

  it("world-edge card: byte-identical without a strike; after one, its account of the edge and then the exit, no drive-on stem", () => {
    expect(worldEdgeDetailBg("walled", null)).toBe(
      "Учебната зона свършва тук: отпред е плътен ред сгради — това е ръбът на картата, а не улица, и не се минава. Нищо отвъд маршрута не се оценява, но удар в тези сгради се брои за пътнотранспортно произшествие като всеки друг сблъсък. Спри, върни се към синята линия и продължи по маршрута на урока.",
    );
    expect(worldEdgeDetailBg("open", null)).toBe(
      "Оттук нататък няма нито път, нито сграда — теренът просто свършва. Това не е част от упражнението и нищо отвъд ръба не се оценява. Върни се към синята линия и продължи по маршрута на урока.",
    );
    for (const exit of [ARMED.peek, free("Прекрати урока").peek, free("Завърши сесията").peek]) {
      for (const near of ["walled", "open"] as const) {
        const d = worldEdgeDetailBg(near, exit);
        expect(d.endsWith(` ${exit}`), d).toBe(true);
        expect(d.startsWith(worldEdgeDetailBg(near, null).slice(0, 40)), d).toBe(true);
        expect(DRIVE_ON.test(d), d).toBe(false);
        expect(d.includes("синята линия"), d).toBe(false);
      }
    }
  });

  it("the shell mounts read them: the card passes the person peek only under the hold, the legend gate reads the predicate", () => {
    const src = readFileSync(path.join(HERE, "..", "LessonPlayShell.tsx"), "utf-8").replace(/\r\n/g, "\n");
    expect(src).toMatch(
      /detailBg: worldEdgeDetailBg\(\s*worldEdgeNear,\s*snap\.objectiveHold === "personStruck" \? \(snap\.objectiveHoldPersonPeekBg \?\? null\) : null,?\s*\)/,
    );
    expect(src).toContain("const guidanceShown = lesson.objectives.length > 0 && !routeGuidanceStandsDown(snap.objectiveHold);");
    // both legend surfaces hang off that gate
    expect(src).toContain("const legendApplies = compact && !ended && guidanceShown;");
    expect(src).toContain("{!compact && !ended && guidanceShown ? (");
    // the shipped sentence is no longer typed inline anywhere else
    expect(src.split("Върни се към синята линия и продължи по маршрута на урока.").length - 1).toBe(1);
  });
});
