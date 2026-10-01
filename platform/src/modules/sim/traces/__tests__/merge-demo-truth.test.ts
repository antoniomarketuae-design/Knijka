/**
 * THE LANE-DROP DEMOS, REPLAYED — every caption true on every frame it shows
 * on, and every demo showing exactly its own act (sc-merge-lane-end:0487bcec
 * round 3, parts B and C).
 *
 * WHY. Round 2's verifier (F6) replayed the committed shadow-correct drives
 * through the production stack and found the ghost the L1 aid tells a student
 * to copy merging IN FRONT of the through car before it had passed: the car was
 * forced from 50 to 19 км/ч (roadworks 45 → 20) under a caption reading
 * «никой в лявата лента не спря … заради нас», and «кола в лявата лента, почти
 * наравно с нас» was painted while that car was 40 m behind. Under founder ruling
 * 2026-09-30 («bill the forced braking») that demo would commit the lesson's own
 * mistake. And the push-out demo, recorded against a car that now keeps station,
 * cut in at matched speed 15 m ahead of it — which forces nobody to do anything.
 *
 * HOW. Each committed trace is replayed the way the product's own ghost feed
 * plays one (clips/capture/captureGhostFeed.ts — `sampleAt` every 1/60 s, the
 * recorder's frame order: runtime → traffic → sample → director), with the
 * lesson's staged through car armed, and the through car's pose and speed are
 * read off the traffic system on every frame. The captions' own words are the
 * claims; each window runs from its annotation to the next one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../../orchestrator/director";
import { parseScenarioTrace } from "../parse";
import { sampleAt } from "../sample";
import { createTracePoint, type ScenarioTrace } from "../types";
import { SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT } from "../../lessons/scenario/templates-merging";
import type { StagedEventSpec } from "../../contracts";
import { actorObb, isContact, obbSeparationM, playerObb, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../collision";
import { LANE_WIDTH_M } from "../../world";
import type { ScenarioSpec } from "../../lessons/scenario/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const X_THROUGH = -LANE_WIDTH_M / 2;
/** Body over the through lane (his centre within half the lane + his half-width of it). */
const overThrough = (x: number) => Math.abs(x - X_THROUGH) < LANE_WIDTH_M / 2 + PLAYER_HALF_WIDTH_M;
/** A car's half-length (the through cars are the default "car" profile, 4.1 m). */
const CAR_HALF = 2.05;
const T_R = 1.0;
const HARD = 7;

interface Frame {
  t: number;
  gx: number;
  gy: number;
  gv: number; // km/h
  cx: number;
  cy: number;
  cv: number; // km/h
  contact: boolean;
}
interface Replay {
  trace: ScenarioTrace;
  frames: Frame[];
  annotations: { t: number; text: string; until: number }[];
  /** the first frame the ghost's body is over the through lane, moving forward */
  entry: Frame | null;
}

function replay(spec: ScenarioSpec, name: string): Replay {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${spec.map.districtId}.json`), "utf-8"));
  const trace = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, `${name}.trace.json`), "utf-8")),
  )!;
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw as TrafficDistrict, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const staged = [...(spec.staged ?? [])] as StagedEventSpec[];
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  const pt = createTracePoint();
  const frames: Frame[] = [];
  let entry: Frame | null = null;
  let wasOver = false;
  let touching = false;
  const dt = 1 / 60;
  for (let t = dt; t <= trace.meta.durationSec + 1e-9; t += dt) {
    sampleAt(trace, t, pt);
    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: pt.x, y: pt.y },
      playerSpeedKmh: Math.abs(pt.speedKmh),
      playerHeadingDeg: pt.headingDeg,
    });
    const tick = runtime.sample(
      { position: { x: pt.x, y: pt.y }, headingDeg: pt.headingDeg, speedKmh: pt.speedKmh, indicator: pt.indicator, headlights: "off", seatbeltOn: true, handbrakeOn: false, gear: pt.gear, mirrorGlance: null },
      t,
      false,
    );
    director.step({ tSec: t, dtSec: dt, x: pt.x, y: pt.y, speedKmh: Math.abs(pt.speedKmh), headingDeg: pt.headingDeg, brakePedal: 0, tickEvents: tick.events });
    const a = traffic.staged(staged[0].id)!;
    const now = isContact(obbSeparationM(playerObb(pt.x, pt.y, pt.headingDeg), actorObb(a)));
    const f: Frame = { t, gx: pt.x, gy: pt.y, gv: pt.speedKmh, cx: a.x, cy: a.y, cv: a.speedMps * 3.6, contact: now && !touching };
    touching = now;
    frames.push(f);
    const over = overThrough(pt.x);
    if (over && !wasOver && entry === null && pt.speedKmh > 0) entry = f;
    wasOver = over;
  }
  const annos = trace.events.filter((e) => e.kind === "annotation");
  const annotations = annos.map((e, i) => ({
    t: e.tSec,
    text: e.textBg ?? "",
    until: i + 1 < annos.length ? annos[i + 1].tSec : trace.meta.durationSec,
  }));
  return { trace, frames, annotations, entry };
}

/** The car's first run up the road: every frame until the traffic system
 *  retires it past the end of the road or re-stages it at its hold (a return
 *  lap is a new car coming, not this one slowing down). */
const firstRun = (r: Replay): Frame[] => {
  const out: Frame[] = [];
  for (let i = 0; i < r.frames.length; i++) {
    // re-staged (it jumps back) or retired past the end of the road (its speed
    // drops to 0 in one frame — no brake can shed 5 км/ч in 1/60 s)
    if (i > 0 && (r.frames[i].cy < r.frames[i - 1].cy - 5 || r.frames[i - 1].cv - r.frames[i].cv > 5)) break;
    out.push(r.frames[i]);
  }
  return out;
};
const inWindow = (r: Replay, match: RegExp) => {
  const a = r.annotations.find((x) => match.test(x.text));
  expect(a, `no caption matching ${match}`).toBeDefined();
  return r.frames.filter((f) => f.t >= a!.t && f.t < a!.until);
};
/** What the ghost's entry demands of the car behind in the lane (∞ = no brake can). */
function demandAt(f: Frame): number {
  const along = f.gy - f.cy;
  if (along <= 0) return 0; // the car is ahead — nobody behind him to force
  const gap = along - PLAYER_HALF_LENGTH_M - CAR_HALF;
  const c = (f.cv - Math.max(0, f.gv)) / 3.6;
  if (gap <= 0) return Infinity;
  if (c <= 0) return 0;
  const rem = gap - c * T_R;
  return rem <= 0 ? Infinity : (c * c) / (2 * rem);
}

for (const spec of [SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT]) {
  describe(`${spec.id} — the shadow the L1 aid tells him to copy`, () => {
    const r = replay(spec, "shadow-correct");

    it("merges into the gap BEHIND the through car: at its entry the car is wholly ahead of it", () => {
      expect(r.entry).not.toBeNull();
      const e = r.entry!;
      // the car's tail is ahead of the ghost's nose
      expect(e.cy - CAR_HALF, `car at y ${e.cy.toFixed(1)}, ghost at ${e.gy.toFixed(1)}`).toBeGreaterThan(e.gy + PLAYER_HALF_LENGTH_M);
      expect(demandAt(e)).toBe(0);
    });

    it("the through car never brakes for it: no speed lost from the ghost's entry to the end of its run", () => {
      const e = r.entry!;
      let prev = e.cv;
      for (const f of firstRun(r).filter((x) => x.t >= e.t)) {
        expect(f.cv, `t ${f.t.toFixed(2)}: car ${prev.toFixed(1)} → ${f.cv.toFixed(1)} км/ч`).toBeGreaterThanOrEqual(prev - 0.05);
        prev = f.cv;
      }
      expect(r.frames.some((f) => f.contact)).toBe(false);
    });

    it("«В лявото огледало: зад нас в лявата лента има кола» — on every frame of that caption the car IS in the left lane and behind the ghost, within mirror range", () => {
      // (The old caption said «почти наравно с нас» while the car was 40 m back.)
      expect(r.annotations.some((a) => /почти наравно/.test(a.text))).toBe(false);
      const w = inWindow(r, /В лявото огледало: зад нас в лявата лента има кола/);
      expect(w.length).toBeGreaterThan(0);
      for (const f of w) {
        expect(Math.abs(f.cx - X_THROUGH), `t ${f.t.toFixed(2)}`).toBeLessThan(0.5);
        expect(f.gy - f.cy, `t ${f.t.toFixed(2)}: car ${(f.gy - f.cy).toFixed(1)} m behind`).toBeGreaterThan(0);
        expect(f.gy - f.cy, `t ${f.t.toFixed(2)}: car ${(f.gy - f.cy).toFixed(1)} m behind`).toBeLessThan(60);
      }
    });

    it("«Отпускаме газта и я пускаме да мине» — the ghost eases, and the car DOES pass it before the wheel turns", () => {
      const w = inWindow(r, /Отпускаме газта и я пускаме да мине/);
      const start = w[0];
      expect(Math.max(...w.map((f) => f.gv))).toBeLessThanOrEqual(start.gv + 0.5);
      const passed = r.frames.find((f) => f.t >= start.t && f.cy - CAR_HALF > f.gy + PLAYER_HALF_LENGTH_M);
      expect(passed, "the car never got past the ghost").toBeDefined();
      expect(passed!.t).toBeLessThan(r.entry!.t);
    });

    it("«Ляв мигач, още веднъж огледало…» — shown only once the car is past: the gap it looks at is the one behind it", () => {
      for (const f of inWindow(r, /Ляв мигач/)) expect(f.cy, `t ${f.t.toFixed(2)}`).toBeGreaterThan(f.gy);
    });

    it("«…никой в лявата лента не спря…» / «…с едно движение…» — true on every frame: the car is ahead and never slows while it shows", () => {
      const run = new Set(firstRun(r));
      const w = inWindow(r, /Вписахме се/).filter((f) => run.has(f));
      expect(w.length).toBeGreaterThan(10);
      for (let i = 1; i < w.length; i++) {
        expect(w[i].cy).toBeGreaterThan(w[i].gy);
        expect(w[i].cv).toBeGreaterThanOrEqual(w[i - 1].cv - 0.05);
      }
    });
  });
}

describe("sc-merge-lane-end — the push-out demo still pushes out (founder ruling 2026-09-30)", () => {
  const r = replay(SC_MERGE_LANE_END, "mistake-push-out");

  it("the ghost cuts in AHEAD of the through car, inside the distance it needs: the entry demands more than a hard stop of it", () => {
    expect(r.entry).not.toBeNull();
    const e = r.entry!;
    expect(e.gy - e.cy, "the car is behind the ghost at its entry").toBeGreaterThan(0);
    expect(demandAt(r.entry!)).toBeGreaterThan(HARD * 1.1);
  });

  it("…the car brakes HARD and avoids the crash — no contact (the ruling: billed even with none)", () => {
    const e = r.entry!;
    const after = r.frames.filter((f) => f.t >= e.t && f.t <= e.t + 3);
    const drop = e.cv - Math.min(...after.map((f) => f.cv));
    expect(drop, "the car barely slowed").toBeGreaterThan(15);
    expect(r.frames.some((f) => f.contact)).toBe(false);
  });

  it("«В лявата лента вече има кола» — true on every frame of that caption: a car in the left lane, beside or just behind the ghost", () => {
    for (const f of inWindow(r, /В лявата лента вече има кола/)) {
      expect(Math.abs(f.cx - X_THROUGH)).toBeLessThan(0.5);
      expect(f.gy - f.cy, `t ${f.t.toFixed(2)}`).toBeGreaterThan(-3);
      expect(f.gy - f.cy, `t ${f.t.toFixed(2)}`).toBeLessThan(20);
    }
  });
});

describe("the other demos keep to their own act", () => {
  it("sc-merge-lane-end «без мигач»: its merge forces nobody to brake hard", () => {
    const r = replay(SC_MERGE_LANE_END, "mistake-no-indicator");
    expect(r.entry).not.toBeNull();
    expect(demandAt(r.entry!)).toBeLessThan(HARD * 0.9);
    expect(r.frames.some((f) => f.contact)).toBe(false);
  });
  it("sc-merge-roadworks-shift «без мигач» and «провиране през конусите»: neither forces the car in the open lane to brake hard", () => {
    for (const name of ["mistake-no-indicator", "mistake-squeeze-cones"]) {
      const r = replay(SC_MERGE_ROADWORKS_SHIFT, name);
      if (r.entry !== null) expect(demandAt(r.entry), name).toBeLessThan(HARD * 0.9);
      expect(r.frames.some((f) => f.contact), name).toBe(false);
    }
  });
});
