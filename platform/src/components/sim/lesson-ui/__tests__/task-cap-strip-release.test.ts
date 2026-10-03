/**
 * «WHEREVER THE GRADING STOPS, THE SCREEN MUST STOP TOO» — founder ruling
 * 2026-09-25 «Only the named stretch», round-3 verifier COND-C 1.
 *
 * A blown objective stays active (it never completes), so the strip's «задачата
 * иска ≤N» and the banner's «— дръж под N км/ч» kept printing the cap for the
 * rest of the drive — past the point where the sheet stopped grading it
 * (`lessons/engine.ts stepTaskCapLatch`: the latch is SPENT once the car leaves
 * the feature the task names). A number on the glass that nothing grades is the
 * O51 defect run backwards: the student slows for a ceiling that no longer
 * exists, or learns that the numbers on the glass are decoration.
 *
 * Driven, not grepped: a real compiled session through a real blown mark, every
 * frame through the shell's own `snapshotOf` (with its own hold), the banner
 * through `bannerObjectiveLineBg`, the strip through `GovernorCapMark` itself.
 * RED on round 3 (the hold kept the figure on every frame after the zone).
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  advisorPromptForSession,
  applyTick,
  compileScenario,
  createLessonSession,
  taskCapReleased,
  type LessonSessionState,
} from "@/modules/sim/lessons";
import { GovernorCapMark } from "@/modules/sim/hud/StatusDashboard";
import type { SimTick } from "@/modules/sim/rules";
import { bannerObjectiveLineBg, snapshotOf, type HudSnapshot } from "../LessonPlayShell";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function shadow(id: string): Array<[number, number]> {
  const s = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "traces", id, "shadow-correct.trace.json"), "utf-8"),
  ).samples as Array<{ x: number; y: number }>;
  const out: Array<[number, number]> = [];
  for (const p of s) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l[0], p.y - l[1]) > 0.3) out.push([p.x, p.y]);
  }
  return out;
}
function tickAt(t: number, x: number, y: number, h: number, speedKmh: number, posted: number): SimTick {
  return {
    t,
    speedKmh,
    maxSpeedKmh: posted,
    position: { x, y },
    headingDeg: h,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
  };
}
interface Beat {
  t: number;
  x: number;
  y: number;
  stamped: boolean;
  released: boolean;
  snap: HudSnapshot;
}
/** Drive `pts` at `kmh` on a road posted `posted`, returning every frame's snapshot. */
function driveSnaps(lessonId: string, level: ScenarioLevelish, kmh: number, posted: number, maxT = 60): Beat[] {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === lessonId)!;
  const pts = shadow(lessonId);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, level));
  let prev: HudSnapshot | null = null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let d = 0;
  let v = 0;
  let t = 0;
  const out: Beat[] = [];
  while (d < cum[cum.length - 1] && t < maxT && s.phase === "driving") {
    t = Math.round((t + 0.1) * 10) / 10;
    v = Math.min(kmh / 3.6, v + 0.3);
    d += v * 0.1;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const x = pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]);
    const y = pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]);
    const h = (Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 180) / Math.PI;
    const tk = tickAt(t, x, y, h, v * 3.6, posted);
    s = applyTick(s, tk).state;
    const snap = snapshotOf(s, tk, null, prev);
    prev = snap;
    const lt = s.lastTick as { taskSpeedCap?: unknown } | undefined;
    out.push({ t, x, y, stamped: lt?.taskSpeedCap !== undefined, released: taskCapReleased(s), snap });
  }
  return out;
}
type ScenarioLevelish = 1 | 2 | 3 | 4 | 5;
const strip = (taskCapKmh: number | undefined) =>
  renderToStaticMarkup(
    createElement(GovernorCapMark, {
      capKmh: 60,
      limitKmh: 50,
      taskCapKmh,
      speedKmh: 45,
      tierBg: "Нормален",
      size: "compact" as const,
    }),
  );

describe("the strip and the banner stop printing a task cap the sheet no longer grades", () => {
  // sc-junction-gap «Приближи знака Б2 бавно — интервалът се чете отдалеч»: a
  // ≤30 zone of radius 12 at (4.06, −45) on the stem posted 40 (tj-e-s). Its title states no
  // number, so the banner carries the cap itself. 45 through the mark blows it;
  // the ceiling binds across the zone and not past it (ruling 2 — the zone).
  const beats = driveSnaps("sc-junction-gap", 3, 45, 40);
  const firstStamp = beats.findIndex((b) => b.stamped);
  const firstRelease = beats.findIndex((b) => b.released);

  it("the mark is blown and the ceiling binds for a while (non-vacuous)", () => {
    expect(firstStamp).toBeGreaterThan(0);
    expect(firstRelease).toBeGreaterThan(firstStamp);
  });
  it("before the blow and while it binds, the strip and the banner name the 30", () => {
    for (const b of beats.slice(0, firstRelease).filter((x) => x.snap.objectiveId === "sc-jgap-approach")) {
      expect(b.snap.taskCapKmh).toBe(30);
    }
    const binding = beats[firstStamp];
    expect(bannerObjectiveLineBg(binding.snap)).toContain("дръж под 30 км/ч");
    expect(strip(binding.snap.taskCapKmh)).toContain("задачата иска ≤30");
  });
  it("from the frame the stretch is spent, with the same objective still active: no cap on the strip, the banner or the advisor", () => {
    const after = beats.slice(firstRelease).filter((b) => b.snap.objectiveId === "sc-jgap-approach");
    expect(after.length).toBeGreaterThan(5);
    for (const b of after) {
      expect(b.stamped).toBe(false);
      expect(b.snap.taskCapKmh).toBeUndefined();
      expect(bannerObjectiveLineBg(b.snap) ?? "").not.toContain("дръж под");
      expect(strip(b.snap.taskCapKmh)).not.toContain("задачата иска");
      expect(b.snap.advisorPrompt?.textBg ?? "").not.toContain("дръж под");
    }
  });
  it("…and no frame ever stamps a cap the strip is not showing", () => {
    for (const b of beats.filter((x) => x.stamped)) expect(b.snap.taskCapKmh).toBe(30);
  });
});

describe("taskCapReleased — exactly a spent latch on the ACTIVE objective that has not been re-armed", () => {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-junction-gap")!;
  const base = createLessonSession(compileScenario(spec, 3));
  const latch = (over: Record<string, unknown>) =>
    ({
      ...base,
      phase: "driving",
      taskCapLatch: {
        objectiveIndex: 0,
        blownAtSec: 10,
        stretch: null,
        progress: { reached: false, spent: true },
        stamped: true,
        rearmed: false,
        ...over,
      },
    }) as unknown as LessonSessionState;
  it("spent, not re-armed, on the active objective → released", () => {
    expect(taskCapReleased(latch({}))).toBe(true);
  });
  it("still inside its stretch → not released", () => {
    expect(taskCapReleased(latch({ progress: { reached: false, spent: false } }))).toBe(false);
  });
  it("re-armed (a fresh approach cleared the verdict) → the arrival demand is live again, shown", () => {
    expect(taskCapReleased(latch({ rearmed: true }))).toBe(false);
  });
  it("a latch of another objective → not this objective's business", () => {
    expect(taskCapReleased(latch({ objectiveIndex: 1 }))).toBe(false);
  });
  it("no latch → not released", () => {
    expect(taskCapReleased({ ...base, phase: "driving" } as LessonSessionState)).toBe(false);
  });
  it("the advisor's own sentence drops the tail when released, and keeps it otherwise", () => {
    expect(advisorPromptForSession(latch({}))?.textBg ?? "").not.toContain("дръж под");
    expect(advisorPromptForSession(latch({ rearmed: true }))?.textBg ?? "").toContain("дръж под 30 км/ч");
  });
});
