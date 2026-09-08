/**
 * =============================================================================
 * THE REVERSE ODOMETER — «Заден ход · X м».
 *
 * THE ROW. `sc-ed-reverse-line:e05f2cee` — „There is no rear proximity
 * read-out on screen at any point of the reverse manoeuvre", filed on
 * `.audit-frames/w10-4/frames/sc-ed-reverse-line__pc-right/05r-reverse-R.png`,
 * the first frame in the whole corpus taken with the selector actually in R.
 *
 * HALF OF IT IS NOT A DEFECT AND THIS FILE PINS THAT TOO: the drill runs on an
 * empty полигон, so a proximity badge would have to invent the body it is
 * measuring. The half that IS a defect is that the manoeuvre the lesson grades
 * in METRES («Спри плавно след около 25 метра», and a reachZone 25 m back) was
 * driven with nothing on the glass counting them.
 *
 * The end-to-end assertion below is the one that matters: the SHIPPED
 * `shadow-correct` trace of that lesson, replayed through the SHIPPED fold at
 * the SHIPPED 5 Hz poll, reaches 24.9 m — the drill's own 25 — while reading
 * zero through the forward move-off that opens it.
 * =============================================================================
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReverseTravelBadge } from "../RearProximityCue";
import {
  REVERSE_RUN_FORWARD_KMH,
  REVERSE_RUN_MAX_STEP_M,
  REVERSE_RUN_MIN_M,
  rearChannelBadge,
  reverseRunLabelBg,
  reverseRunMeters,
  stepReverseRun,
  type ReverseRun,
} from "../reverseTravel";
import { REAR_CUE_REVERSING_KMH } from "../rearProximity";
import { PlayAreaStyles } from "../../../../components/sim/lesson-ui/PlayAreaStyles";
import { ROOMY_HUD_FLOOR_PX } from "../../../../components/sim/lesson-ui/immersive";

const REPO_ROOT = path.join(process.cwd(), "..");
/** The component's own poll period — the rate the fold actually runs at. */
const POLL_SEC = 0.2;

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  speedKmh: number;
}

function shadowSamples(lesson: string, name: string): TraceSample[] {
  const raw = readFileSync(
    path.join(REPO_ROOT, "content", "traces", lesson, `${name}.trace.json`),
    "utf-8",
  );
  return (JSON.parse(raw) as { samples: TraceSample[] }).samples;
}

/** Replay a trace through the fold at the component's poll rate. */
function replay(samples: TraceSample[]): { peakM: number; readings: (number | null)[] } {
  let run: ReverseRun | null = null;
  let peakM = 0;
  const readings: (number | null)[] = [];
  let nextPoll = -Infinity;
  for (const s of samples) {
    if (s.tSec < nextPoll) continue;
    nextPoll = s.tSec + POLL_SEC - 1e-9;
    run = stepReverseRun(run, s.x, s.y, s.speedKmh);
    const shown = reverseRunMeters(run);
    readings.push(shown);
    if (run !== null && run.meters > peakM) peakM = run.meters;
  }
  return { peakM, readings };
}

// ───────────────────────────────────────────────────────────────────────────

describe("the fold counts the manoeuvre and nothing else", () => {
  it("integrates the PATH while the car is reversing", () => {
    let run = stepReverseRun(null, 0, 0, -3);
    run = stepReverseRun(run, 0, -1, -3);
    run = stepReverseRun(run, 0, -2.5, -3);
    expect(run?.meters).toBeCloseTo(2.5, 6);
    expect(reverseRunMeters(run)).toBe(3);
  });

  it("a forward move ENDS the run — the next reverse starts from zero", () => {
    let run = stepReverseRun(null, 0, 0, -3);
    run = stepReverseRun(run, 0, -4, -3);
    expect(reverseRunMeters(run)).toBe(4);
    run = stepReverseRun(run, 0, -3, REVERSE_RUN_FORWARD_KMH + 0.1);
    expect(run).toBeNull();
    run = stepReverseRun(run, 0, -3, -3);
    run = stepReverseRun(run, 0, -4, -3);
    expect(reverseRunMeters(run)).toBe(1);
  });

  it("«спри и коригирай» does not zero the count — the standstill band HOLDS", () => {
    // Instruction 6 of the drill tells the student to stop and correct. A stop
    // that reset the odometer would punish the lesson's own advice.
    let run = stepReverseRun(null, 0, 0, -3);
    for (let m = 1; m <= 6; m += 1) run = stepReverseRun(run, 0, -m, -3);
    for (let i = 0; i < 40; i += 1) {
      // A car at rest dithers either side of zero — inside the band, both signs.
      run = stepReverseRun(run, 0.01 * (i % 2 ? 1 : -1), -6, i % 2 ? 0.3 : -0.3);
    }
    expect(reverseRunMeters(run)).toBe(6);
    run = stepReverseRun(run, 0, -8, -3);
    expect(reverseRunMeters(run)).toBe(8);
  });

  it("the standstill dither is re-anchored, so it is never counted as travel", () => {
    let run: ReverseRun | null = { meters: 5, lastX: 0, lastY: 0 };
    run = stepReverseRun(run, 0, -0.4, 0); // creep, inside the band
    expect(run?.meters).toBe(5);
    expect(run?.lastY).toBe(-0.4); // …and the anchor moved with the car
    run = stepReverseRun(run, 0, -0.9, -3);
    expect(run?.meters).toBeCloseTo(5.5, 6); // 0.5, not 0.9
  });

  it("a teleport between two polls adds nothing", () => {
    let run: ReverseRun | null = { meters: 3, lastX: 0, lastY: 0 };
    run = stepReverseRun(run, 0, -(REVERSE_RUN_MAX_STEP_M + 1), -3);
    expect(run?.meters).toBe(3);
    expect(run?.lastY).toBe(-(REVERSE_RUN_MAX_STEP_M + 1));
  });

  it("says nothing below the first whole metre, and nothing at all with no run", () => {
    expect(reverseRunMeters(null)).toBeNull();
    expect(reverseRunMeters({ meters: REVERSE_RUN_MIN_M - 0.01, lastX: 0, lastY: 0 })).toBeNull();
    expect(reverseRunMeters({ meters: REVERSE_RUN_MIN_M, lastX: 0, lastY: 0 })).toBe(1);
  });

  it("starts and ends in the SAME band the cockpit's own «R» readout uses", () => {
    // One definition of „the car is going backwards" across the rear channel:
    // `REAR_CUE_REVERSING_KMH` is the threshold `VehicleSim.gear` prints R at.
    expect(REVERSE_RUN_FORWARD_KMH).toBe(-REAR_CUE_REVERSING_KMH);
    expect(stepReverseRun(null, 0, 0, REAR_CUE_REVERSING_KMH)).toBeNull();
    expect(stepReverseRun(null, 0, 0, REAR_CUE_REVERSING_KMH - 0.01)).not.toBeNull();
  });

  it("a corrupt sample cannot poison the count", () => {
    const run: ReverseRun = { meters: 7, lastX: 0, lastY: 0 };
    expect(stepReverseRun(run, NaN, 0, -3)).toBe(run);
    expect(stepReverseRun(run, 0, 0, NaN)).toBe(run);
  });
});

describe("a real body behind always outranks the odometer", () => {
  it("the proximity sentence wins the box whenever there is one", () => {
    const cue = { level: "danger", meters: 2, kind: "vehicle" } as const;
    expect(rearChannelBadge(cue, 12)).toEqual({ kind: "proximity", cue });
    expect(rearChannelBadge(null, 12)).toEqual({ kind: "travel", meters: 12 });
    expect(rearChannelBadge(null, null)).toBeNull();
    expect(rearChannelBadge(cue, null)).toEqual({ kind: "proximity", cue });
  });
});

describe("the badge is the SAME named surface as the proximity chip", () => {
  const html = renderToStaticMarkup(<ReverseTravelBadge meters={12} />);

  it('carries data-hud="rear-proximity" — the name PlayAreaStyles arbitrates', () => {
    expect(html).toContain('data-hud="rear-proximity"');
  });

  it("does NOT drop «Дистанция» onto its own floor — the reason for that name", () => {
    // `PlayAreaStyles` gives the follow-gap chip the 6.75rem floor only when the
    // stage has NO rear chip. A second name here would put two centred chips in
    // one row; this asserts the selector and the badge still share a vocabulary.
    const css = renderToStaticMarkup(<PlayAreaStyles />).replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = ':not(:has([data-hud="rear-proximity"])) [data-hud="follow-gap"]';
    expect(css).toContain(rule);
    expect(html).toContain('data-hud="rear-proximity"');
  });

  it("stands on the published roomy floor, and puts it in a CLASS", () => {
    expect(html).toContain(`bottom-[${ROOMY_HUD_FLOOR_PX / 16}rem]`);
    expect(html).not.toMatch(/style="[^"]*bottom/);
  });

  it("prints the manoeuvre and the metres, and never the word «отзад»", () => {
    // «Кола отзад · 4 м» is a claim about a body. This chip must not be read as
    // one — different noun, different glyph, no severity colour.
    expect(html).toContain(reverseRunLabelBg(12));
    expect(html).toContain("Заден ход · 12 м");
    expect(html).not.toContain("отзад");
    expect(html).toContain("var(--border-strong)");
    expect(html).not.toContain("var(--danger)");
  });

  it("tells a screen reader the metres are ones already driven", () => {
    expect(html).toContain('aria-label="Изминал си 12 метра на заден ход"');
    expect(html).toContain('role="status"');
  });
});

describe("END TO END · the shipped drive of the lesson the row was filed on", () => {
  const samples = shadowSamples("sc-ed-reverse-line", "shadow-correct");

  it("SELF-CHECK: the trace really does reverse (or this proves nothing)", () => {
    expect(samples.length).toBeGreaterThan(400);
    expect(Math.min(...samples.map((s) => s.speedKmh))).toBeLessThan(REAR_CUE_REVERSING_KMH);
  });

  it("reads 25 m at the end of a 25 m manoeuvre, to within a tenth", () => {
    const { peakM } = replay(samples);
    // The drill: «Спри плавно след около 25 метра». The instrument agrees with
    // the objective instead of with itself.
    expect(peakM).toBeGreaterThan(24.5);
    expect(peakM).toBeLessThan(25.5);
  });

  it("is silent through the forward move-off that opens the drill", () => {
    // HONEST LIMIT 2 of the template: the drill pulls AWAY forward first. Not
    // one metre of that may be counted as reversing.
    const forwardOnly = samples.filter((s) => s.tSec < 7);
    expect(Math.max(...forwardOnly.map((s) => s.speedKmh))).toBeGreaterThan(5);
    expect(replay(forwardOnly).readings.every((r) => r === null)).toBe(true);
  });

  it("is on the glass for most of the reverse, not just at its end", () => {
    // The row says „at any point of the reverse manoeuvre". Once the first
    // metre is behind the car the chip is up and stays up.
    const { readings } = replay(samples);
    const lit = readings.filter((r) => r !== null);
    expect(lit.length).toBeGreaterThan(80);
    expect(readings[readings.length - 1]).toBeGreaterThanOrEqual(24);
  });
});
