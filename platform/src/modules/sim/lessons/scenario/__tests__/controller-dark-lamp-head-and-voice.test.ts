/**
 * sc-sig-controller-postures:784b2ca7 [major] — THE LESSON SAYS THE LAMP IS OUT; THE HEAD, ITS CAPTION AND THE VOICE
 * MUST SAY SO TOO.
 *
 * WHAT THE RIG SAW (rig-w3a frames pc-L1-C-11 / -19, re-read in triage-1010 at 59be0de): the lesson's sheet reads
 * «светофарът на кръстовището е ЗАГАСНАЛ … Тук важи само неговата поза» (instruction 1), «Няма лампа за четене — четеш
 * човека» (instruction 3), and the teach card «Тогава лампите и знаците мълчат» — while the junction's head was drawn
 * lit RED (frame 11, the car halted by the officer) and lit RED again as the car crossed (frame 19), and the НАУЧИ card
 * on frame 11 read «Защо чакаш: червен сигнал · Спрял си пред стоп-линията и на червено това е правилното».
 *
 * THE CAUSES, three, and they have to move together or the lesson lies a different way:
 *   (1) runtime/signals.ts `lampState` let a "controlled" cluster fall through to the live 50 s cycle even when the
 *       lesson authors its lamps OUT (`TrafficControllerSpec.lamps: "dark"`, praiselamp) — the head cycled.
 *   (2) a plain "dark" head is captioned by the world with the UNCONTROLLED junction's card («ЗАГАСНАЛ СВЕТОФАР ·
 *       Кръстовището е равнозначно · Пропусни идващия ОТДЯСНО · ЗДвП чл. 48») — false where an officer governs.
 *   (3) every officer HALT reaches the session as nextStopLineState "red" (worldRuntime.ts, the effective signal —
 *       kept, it is what grades), so finish.ts `yieldReasonAt` calls the wait "redLight", and `stepYieldVoice`, which
 *       was never told the lesson, spoke the lamp's reason over a lamp the lesson says is dark.
 *
 * WHAT THIS FILE HOLDS:
 *   §1 THE HEAD, every controller lesson at every rung, through the world LessonScene builds (`buildLiveWorld`, the
 *      director staging the officer exactly as live play does): the dark-lamp officer junction renders a DARK head on
 *      every approach at every second of a full lamp cycle, its vehicle and pedestrian lenses are all unlit, and it
 *      is captioned with the officer's card — the live-lamp lessons' heads are byte-for-byte the cycle they were.
 *   §2 THE CAPTION'S WORDS: retrieved from the lesson's own instruction 1 and the corpus (ADR-002), and never the
 *      uncontrolled-junction card.
 *   §3 THE VOICE through the live chain on the rig's own five careful drives: the halted wait is narrated with the
 *      officer's reason and never «червен сигнал»; and the lesson-level switch is true on exactly one lesson.
 *   §3b THE OTHER SIDE OF THE SWITCH, through the same live chain (the landing; verifier condition F6, mutant V10):
 *      §3's census proves the PREDICATE is true on one lesson; nothing proved the ENGINE hands the voice that
 *      predicate and not something wider. With `officerLampsDark` true for any lesson that posts an officer, the two
 *      live-lamp drills said «Светофарът на кръстовището е ЗАГАСНАЛ» over a lit, cycling head for the whole of an
 *      860–2,237-tick red wait and 212 tests stayed green. So every committed drive of both drills, at every rung,
 *      is replayed here: the wait at a red lamp is narrated as the lamp's, and no line says the lamp is out.
 *   §4 THE VOICE as a pure fold: every stage of the officer copy, the generic red copy untouched for every other
 *      caller, and no other reason re-routed.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HudEvent, SignalLampState, TrafficControllerSpec } from "../../../contracts";
import { getArticle } from "@/lib/content/law";
import {
  SIGNAL_HEAD_LABELS,
  signalLabelKindFor,
} from "../../../world/components/signalHeadLabels";
import { PED_LENSES_LIT, VEHICLE_LENSES_LIT } from "../../../world/components/signalHeadLenses";
import { createYieldVoice, lessonOfficerLampsDark, stepYieldVoice } from "../../advisor";
import { createYieldWait } from "../../finish";
import type { YieldReason, YieldWaitState } from "../../types";
import type { TraceIndicator, ScenarioTrace, TraceSample } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_SIG_CONTROLLER_POSTURES } from "../templates-signals2";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { buildLiveWorld, liveChainReplay } from "./liveChainReplay";

const REPO_ROOT = path.join(process.cwd(), "..");
const districtOf = (spec: ScenarioSpec): unknown =>
  JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${spec.map.districtId}.json`), "utf-8"),
  ) as unknown;
const RIG = JSON.parse(
  readFileSync(path.join(__dirname, "controller-dark-lamp-rig-w3a.fixture.json"), "utf-8"),
) as {
  drives: Record<
    string,
    { level: number; rows: Array<[number, number, number, number, number, number, TraceIndicator]> }
  >;
};

/** Every compiled rung of every template that posts a регулировчик — derived, never listed. */
function controllerRungs() {
  const out: Array<{ spec: ScenarioSpec; level: ScenarioLevel; officer: TrafficControllerSpec }> = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level);
      const officer = (lesson.stagedEvents ?? []).find(
        (e): e is TrafficControllerSpec => e.kind === "trafficController",
      );
      if (officer) out.push({ spec, level: rung.level, officer });
    }
  }
  return out;
}
const RUNGS = controllerRungs();
/** One full 50 s lamp cycle (SIGNAL_TIMING.cycleSec) and a margin, sampled at 0.5 s. */
const SPAN_SEC = 60;
const DT = 0.5;
const BEARINGS = [0, 90, 180, 270] as const;
const UNCONTROLLED_CARD = SIGNAL_HEAD_LABELS.dark;

// ---------------------------------------------------------------------------
// §1 the head
// ---------------------------------------------------------------------------

describe("§1 the head at every officer junction, every rung, a full lamp cycle", () => {
  it("the census: three lessons post an officer at every rung, and only sc-sig-controller-postures authors the lamps dark", () => {
    const byLesson = new Map<string, Set<string>>();
    for (const r of RUNGS) {
      const s = byLesson.get(r.spec.id) ?? new Set<string>();
      s.add(r.officer.lamps ?? "live");
      byLesson.set(r.spec.id, s);
    }
    expect([...byLesson.keys()].sort()).toEqual([
      "sc-sig-controller-live",
      "sc-sig-controller-postures",
      "sc-signal-controller",
    ]);
    expect([...byLesson.get("sc-sig-controller-postures")!]).toEqual(["dark"]);
    expect([...byLesson.get("sc-sig-controller-live")!]).toEqual(["live"]);
    expect([...byLesson.get("sc-signal-controller")!]).toEqual(["live"]);
    // Every rung of each — the census is over compiled rungs, not templates.
    for (const id of byLesson.keys()) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      expect(RUNGS.filter((r) => r.spec.id === id).length, id).toBe(spec.levels.length);
    }
  });

  it("a `lamps: \"dark\"` officer junction renders DARK on every approach at every second, with every lens unlit and the officer's caption", () => {
    const rows: string[] = [];
    let checked = 0;
    for (const r of RUNGS.filter((x) => x.officer.lamps === "dark")) {
      const { runtime } = buildLiveWorld(compileScenario(r.spec, r.level), districtOf(r.spec));
      for (let t = 0; t <= SPAN_SEC + 1e-9; t += DT) {
        for (const b of BEARINGS) {
          const lamp = runtime.signalLampState(r.officer.signalNodeId, b);
          checked++;
          const lit =
            VEHICLE_LENSES_LIT[lamp].some(Boolean) || PED_LENSES_LIT[lamp].some(Boolean);
          const kind = signalLabelKindFor(lamp);
          if (lamp !== "darkControlled" || lit || kind !== "officer") {
            rows.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)} b=${b}: ${lamp} lit=${lit} caption=${kind}`);
          }
        }
        runtime.update(DT);
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(rows.slice(0, 6), `${rows.length} head samples at a dark-lamp officer junction are not dark`).toEqual([]);
  });

  it("the two live-lamp officer drills: the head is the live cycle it always was, lit and uncaptioned", () => {
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const r of RUNGS.filter((x) => x.officer.lamps !== "dark")) {
      const { runtime } = buildLiveWorld(compileScenario(r.spec, r.level), districtOf(r.spec));
      for (let t = 0; t <= SPAN_SEC + 1e-9; t += DT) {
        for (const b of BEARINGS) {
          const lamp: SignalLampState = runtime.signalLampState(r.officer.signalNodeId, b);
          const phase = runtime.signalPhaseForApproach(r.officer.signalNodeId, b);
          seen.add(lamp);
          if (lamp !== phase || signalLabelKindFor(lamp) !== null) {
            rows.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)} b=${b}: lamp ${lamp} vs phase ${phase}`);
          }
        }
        runtime.update(DT);
      }
    }
    expect(rows.slice(0, 6)).toEqual([]);
    // A full cycle really was sampled: every lit phase appears.
    expect([...seen].sort()).toEqual(["green", "red", "redYellow", "yellow"]);
  });

  it("the officer's district has no other signal head the lesson-level switch could speak over", () => {
    // `lessonOfficerLampsDark` is a property of the LESSON; the voice it switches may only ever be asked about the
    // officer's own junction. sx-v1 carries exactly one signalized node, and it is his.
    const raw = districtOf(SC_SIG_CONTROLLER_POSTURES) as {
      intersections: Array<{ id: string; signalized?: boolean }>;
      crossings?: Array<{ signalized?: boolean }>;
    };
    expect(raw.intersections.filter((i) => i.signalized === true).map((i) => i.id)).toEqual(["sx-n-c"]);
    expect((raw.crossings ?? []).filter((c) => c.signalized === true)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §2 the caption's words
// ---------------------------------------------------------------------------

describe("§2 the officer's caption — retrieved, and never the uncontrolled junction's", () => {
  const officer = SIGNAL_HEAD_LABELS.officer;
  const instruction1 = SC_SIG_CONTROLLER_POSTURES.instructionsBg[0].textBg;

  it("is not the uncontrolled-junction card: no равнозначно, no right-hand rule, no чл. 48", () => {
    expect(officer).toBeDefined();
    expect(officer.headlineBg).not.toBe(UNCONTROLLED_CARD.headlineBg);
    for (const line of [officer.headlineBg, officer.line1Bg, officer.line2Bg, officer.lawRef]) {
      expect(line).not.toMatch(/равнозначно|ОТДЯСНО|дясното|чл\.\s*48/i);
    }
  });

  it("says only what the lesson's own instruction 1 says: the lamp is out, the officer directs, only his posture counts", () => {
    const lower = instruction1.toLowerCase();
    expect(lower).toContain(officer.line2Bg.toLowerCase());
    expect(officer.headlineBg).toBe("РЕГУЛИРОВЧИК");
    expect(instruction1).toContain(officer.headlineBg);
    // «Светофарът е ЗАГАСНАЛ» — the instruction's «светофарът на кръстовището е ЗАГАСНАЛ», minus the place the
    // caption already stands on.
    expect(officer.line1Bg).toBe("Светофарът е ЗАГАСНАЛ");
    expect(instruction1).toContain("светофарът на кръстовището е ЗАГАСНАЛ");
  });

  it("cites the article the corpus holds for it (ADR-002): ЗДвП чл. 6, т. 2 — his orders bind regardless of lamps AND of the rules", () => {
    const m = /чл\.\s*(\d+)/.exec(officer.lawRef);
    expect(m?.[0]).toBe("чл. 6");
    const found = getArticle("zdvp", "чл. 6");
    expect(found.found).toBe(true);
    if (!found.found) return;
    expect(found.unit.textBg).toContain("независимо от светлинните сигнали");
    expect(found.unit.textBg).toContain("правилата за движение");
    expect(officer.lawRef).toMatch(/т\.\s*2/);
  });
});

// ---------------------------------------------------------------------------
// §3 the voice through the live chain
// ---------------------------------------------------------------------------

function rigTape(cell: string): ScenarioTrace {
  const rows = RIG.drives[cell].rows;
  const at = (t: number, r: (typeof rows)[number], v: number): TraceSample => ({
    tSec: t,
    x: r[1],
    y: r[2],
    headingDeg: r[3],
    steerRad: 0,
    speedKmh: v,
    gear: r[5],
    indicator: r[6],
    brakeOn: v < 0.5,
    throttleOn: v >= 0.5,
  });
  const samples: TraceSample[] = [at(0, rows[0], 0)];
  for (const r of rows) {
    if (r[0] <= samples[samples.length - 1].tSec + 1e-9) continue;
    samples.push(at(r[0], r, r[4]));
  }
  return {
    meta: {
      scenarioId: SC_SIG_CONTROLLER_POSTURES.id,
      kind: "attempt",
      version: 1,
      durationSec: samples[samples.length - 1].tSec,
    },
    samples,
    events: [],
  };
}

type LessonNotice = Extract<HudEvent, { kind: "lesson" }> & { peekBg?: string };

describe("§3 the yield voice at the dark-lamp officer junction, the rig's five careful drives through the live chain", () => {
  it("the lesson-level switch is true on exactly the dark-lamp officer lesson, at every rung", () => {
    const on = new Set<string>();
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (lessonOfficerLampsDark(compileScenario(spec, rung.level))) on.add(spec.id);
      }
    }
    expect([...on]).toEqual(["sc-sig-controller-postures"]);
    for (const rung of SC_SIG_CONTROLLER_POSTURES.levels) {
      expect(lessonOfficerLampsDark(compileScenario(SC_SIG_CONTROLLER_POSTURES, rung.level)), `L${rung.level}`).toBe(
        true,
      );
    }
  });

  it(
    "the halted wait is narrated with the officer's reason; no line the voice speaks says «червен» or «на червено»",
    () => {
      for (const cell of Object.keys(RIG.drives)) {
        const level = RIG.drives[cell].level as ScenarioLevel;
        const said: LessonNotice[] = [];
        let heldRed = 0;
        liveChainReplay({
          lesson: compileScenario(SC_SIG_CONTROLLER_POSTURES, level),
          districtRaw: districtOf(SC_SIG_CONTROLLER_POSTURES),
          trace: rigTape(cell),
          holdAfterSec: 6,
          afterApply: ({ step }) => {
            if (step.state.yieldWait?.holding === true && step.state.yieldWait.reason === "redLight") heldRed++;
            for (const e of step.hudEvents) if (e.kind === "lesson") said.push(e as LessonNotice);
          },
        });
        // The wait is real (the rig rests at the line through chest-on and the raised arm) — V9's held wait.
        expect(heldRed, `${cell}: held officer-halt ticks`).toBeGreaterThan(60);
        const lamp = said.filter((n) =>
          /червен|на червено|светофара за ТВОЯТА/i.test(`${n.titleBg} ${n.explanationBg} ${n.peekBg ?? ""}`),
        );
        expect(
          lamp.map((n) => `«${n.titleBg}» / «${n.peekBg ?? ""}»`),
          `${cell}: voice lines that name a red lamp at a junction whose lamp is out`,
        ).toEqual([]);
        const titles = said.map((n) => n.titleBg);
        expect(titles, cell).toContain("Защо чакаш: регулировчикът");
      }
    },
    600_000,
  );
});

// ---------------------------------------------------------------------------
// §3b the live-lamp officer drills keep the lamp's voice — through the live chain
// ---------------------------------------------------------------------------

/** Every committed drive of a template (content/traces/<id>/*.trace.json), read, never listed. */
function committedDrives(id: string): Array<[string, ScenarioTrace]> {
  const dir = path.join(REPO_ROOT, "content", "traces", id);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".trace.json"))
    .sort()
    .map((f) => [f, JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as ScenarioTrace]);
}

describe("§3b the switch reaches the engine for the dark-lamp lesson ONLY — the two live-lamp drills, every rung, every committed drive, through the live chain", () => {
  it(
    "a wait at the officer's junction while its lamp is LIT is narrated as the lamp's («Защо чакаш: червен сигнал»); no line says the lamp is out or speaks the dark-lamp officer copy",
    () => {
      // The dark-lamp officer copy, taken from the fold itself (§4 pins its words): its three titles.
      const officerDarkTitles = new Set(episode("redLight", true).map((n) => n.titleBg));
      expect(officerDarkTitles.size).toBe(3);
      const live = RUNGS.filter((x) => x.officer.lamps !== "dark");
      expect([...new Set(live.map((r) => r.spec.id))].sort()).toEqual(["sc-sig-controller-live", "sc-signal-controller"]);

      const wrong: string[] = [];
      /** Per lesson: drives on which the red wait was really held AND the lamp's line was really spoken. */
      const lampLineHeard = new Map<string, number>();
      let replays = 0;
      for (const r of live) {
        const lesson = compileScenario(r.spec, r.level);
        for (const [file, trace] of committedDrives(r.spec.id)) {
          const said: LessonNotice[] = [];
          let heldRed = 0;
          liveChainReplay({
            lesson,
            districtRaw: districtOf(r.spec),
            trace,
            holdAfterSec: 6,
            afterApply: ({ step }) => {
              if (step.state.yieldWait?.holding === true && step.state.yieldWait.reason === "redLight") heldRed++;
              for (const e of step.hudEvents) if (e.kind === "lesson") said.push(e as LessonNotice);
            },
          });
          replays++;
          const cell = `${r.spec.id} L${r.level} ${file}`;
          for (const n of said) {
            const text = `${n.titleBg} ${n.explanationBg} ${n.peekBg ?? ""}`;
            if (officerDarkTitles.has(n.titleBg) || /ЗАГАСНАЛ|загаснал/.test(text)) {
              wrong.push(`${cell}: «${n.titleBg}» / «${(n.peekBg ?? "").slice(0, 60)}» over a LIT head (held red ticks ${heldRed})`);
            }
          }
          if (heldRed > 60 && said.some((n) => n.titleBg === "Защо чакаш: червен сигнал")) {
            lampLineHeard.set(r.spec.id, (lampLineHeard.get(r.spec.id) ?? 0) + 1);
          }
        }
      }
      expect(replays, "every rung of both drills × its committed drives").toBe(live.length * 3);
      expect(wrong.slice(0, 8), `${wrong.length} line(s) of the dark-lamp officer copy spoken at a junction whose lamp is lit`).toEqual([]);
      // Not vacuous: on BOTH drills a held red wait really was narrated, as the lamp's. (Measured at the landing:
      // sc-signal-controller 4 drives — shadow-correct at L1/L2/L3/L5; sc-sig-controller-live 6 — the two mistake
      // drives at L1–L3. The rungs that speak nothing are the ones whose coach is silent.)
      expect(lampLineHeard.get("sc-signal-controller") ?? 0, "sc-signal-controller: drives that heard the lamp's line").toBeGreaterThanOrEqual(3);
      expect(lampLineHeard.get("sc-sig-controller-live") ?? 0, "sc-sig-controller-live: drives that heard the lamp's line").toBeGreaterThanOrEqual(3);
    },
    1_800_000,
  );
});

// ---------------------------------------------------------------------------
// §4 the voice as a pure fold
// ---------------------------------------------------------------------------

function episode(reason: YieldReason, officerLampsDark: boolean | undefined) {
  const held: YieldWaitState = { holding: true, sinceSec: 0, reason, pedestrianCrossingIds: [] };
  const free = createYieldWait();
  const said: LessonNotice[] = [];
  let v = createYieldVoice();
  for (const f of [
    { t: 2, speedKmh: 0, wait: held },
    { t: 11, speedKmh: 0, wait: held },
    { t: 12, speedKmh: 9, wait: free },
    { t: 16, speedKmh: 12, wait: free },
  ]) {
    const step = stepYieldVoice(v, {
      ...f,
      violations: [],
      ...(officerLampsDark === undefined ? {} : { officerLampsDark }),
    });
    said.push(...(step.notices as LessonNotice[]));
    v = step.state;
  }
  return said;
}

describe("§4 the officer copy, stage by stage — and nobody else's copy moved", () => {
  const officer = episode("redLight", true);
  const generic = episode("redLight", undefined);

  it("speaks all three stages, each with the officer's reason and his retrieved article", () => {
    expect(officer.map((n) => n.titleBg)).toEqual([
      "Защо чакаш: регулировчикът",
      "Чакането Е маневрата — четеш човека",
      "Изчака регулировчика",
    ]);
    for (const n of officer) {
      expect(`${n.titleBg} ${n.explanationBg} ${n.peekBg}`, n.titleBg).not.toMatch(/червен|зелен|на червено/i);
      expect(n.lawRef, n.titleBg).toBe("ЗДвП чл. 6, т. 2; чл. 7, ал. 1");
    }
    expect(officer[0].explanationBg).toContain("ЗАГАСНАЛ");
    expect(officer[0].explanationBg).toContain("Тук важи само неговата поза");
  });

  it("the generic red-light copy is untouched when the switch is absent or false", () => {
    expect(generic.map((n) => n.titleBg)).toEqual([
      "Защо чакаш: червен сигнал",
      "Чакането Е маневрата",
      "Изчака сигнала и тръгна чисто",
    ]);
    expect(episode("redLight", false).map((n) => n.explanationBg)).toEqual(generic.map((n) => n.explanationBg));
  });

  it("only the red-light wait is re-routed — a pedestrian at the same junction keeps its own card", () => {
    expect(episode("pedestrian", true).map((n) => n.titleBg)).toEqual(
      episode("pedestrian", undefined).map((n) => n.titleBg),
    );
  });
});
