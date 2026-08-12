/**
 * THE SCRUB BAR'S ANNOTATION TICKS CANNOT OVERLAP — 2026-08-10.
 *
 * WHY THIS TEST EXISTS AND WHY IT SWEEPS THE CONTENT. The defect it pins was
 * found by measuring ONE screen: two 20 × 28 px tick buttons at the identical
 * rect [1116, 388] on the desktop deck, 560 px² of exact overlap, because
 * `sc-zebra-approach/shadow-correct` carries two annotations at the same
 * timestamp. A test written from that screen would have asserted about one
 * trace. The sweep below is the reason the fix is not one trace wide: across
 * all shipped trace files there are 43 exactly-coincident pairs AND ~82 further
 * pairs closer together than one tick width, and the second family was invisible
 * to the eye that found the first.
 *
 * The geometric claim is width-independent — slots are laid out in percent of
 * the bar and meet at the midpoint — so the assertion is made in percent and
 * then also converted at three real bar widths, which is what a reader wants to
 * see: "and at 300 px that is zero px² of overlap".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { annotationTicks } from "./TraceTimeline";

const TRACES_DIR = join(process.cwd(), "public", "traces");

/** The two shipped tick widths: `w-5` on the compact mouse deck, `w-6` roomy. */
const TICK_WIDTHS_PX = [20, 24];
/** Bar widths the deck really lays out at (measured: 298 px at 1264 × 619). */
const BAR_WIDTHS_PX = [298, 420, 560];

interface TraceFile {
  id: string;
  durationSec: number;
  annotations: Array<{ tSec: number }>;
}

function loadTraces(): TraceFile[] {
  const out: TraceFile[] = [];
  for (const dir of readdirSync(TRACES_DIR)) {
    const full = join(TRACES_DIR, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const file of readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(full, file), "utf8")) as {
        meta: { durationSec: number };
        events: Array<{ kind: string; tSec: number }>;
      };
      out.push({
        id: `${dir}/${file}`,
        durationSec: raw.meta.durationSec,
        annotations: raw.events.filter((e) => e.kind === "annotation").map((e) => ({ tSec: e.tSec })),
      });
    }
  }
  return out;
}

/** Left/right edge of a tick's hit slot, in percent — the shipped CSS's
 *  `calc(pct% − min(halfPx, halfGap%))`, resolved at a given bar width. */
function slotPct(
  tick: ReturnType<typeof annotationTicks>[number],
  halfWidthPx: number,
  barWidthPx: number,
): { left: number; right: number } {
  const halfPct = (halfWidthPx / barWidthPx) * 100;
  const spread = (halfGap: number | null) => (halfGap === null ? halfPct : Math.min(halfPct, halfGap));
  return {
    left: tick.pct - spread(tick.halfGapLeftPct),
    right: tick.pct + spread(tick.halfGapRightPct),
  };
}

describe("annotationTicks — the defect, on the trace it was measured on", () => {
  const zebra = join(TRACES_DIR, "sc-zebra-approach", "shadow-correct.trace.json");
  const raw = JSON.parse(readFileSync(zebra, "utf8")) as {
    meta: { durationSec: number };
    events: Array<{ kind: string; tSec: number; textBg?: string }>;
  };
  const annotations = raw.events.filter((e) => e.kind === "annotation");

  it("still carries the two annotations at the same timestamp (this is content, not a bug in the deck)", () => {
    const stamps = annotations.map((a) => a.tSec);
    expect(stamps.length).toBe(5);
    expect(stamps[2]).toBe(stamps[3]);
  });

  it("draws FOUR ticks for those five annotations, and the merged one names what the student will see", () => {
    const ticks = annotationTicks(annotations, raw.meta.durationSec);
    expect(ticks.length).toBe(4);
    const merged = ticks[2];
    expect(merged.firstIndex).toBe(2);
    expect(merged.lastIndex).toBe(3);
    // `activeAnnotationIndex` answers with the LAST annotation at a timestamp,
    // so the label must be the fourth sentence, not the third.
    expect(annotations[merged.lastIndex].textBg).toContain("свободна");
  });
});

describe("annotationTicks — no two hit slots overlap, on any shipped trace", () => {
  const traces = loadTraces();

  it("has content to sweep (a green run over an empty list proves nothing)", () => {
    expect(traces.length).toBeGreaterThan(400);
    expect(traces.reduce((n, t) => n + t.annotations.length, 0)).toBeGreaterThan(1500);
  });

  it("merges every coincident pair the transport already treats as one stop", () => {
    let merged = 0;
    for (const trace of traces) {
      const ticks = annotationTicks(trace.annotations, trace.durationSec);
      merged += trace.annotations.length - ticks.length;
      // Every annotation is still accounted for by exactly one tick.
      const covered = ticks.reduce((n, t) => n + (t.lastIndex - t.firstIndex + 1), 0);
      expect(covered, trace.id).toBe(trace.annotations.length);
    }
    expect(merged).toBeGreaterThan(0);
  });

  it("leaves zero overlap at every tick width and every bar width", () => {
    const worst: Array<{ trace: string; overlapPx: number }> = [];
    let narrowestSlotPx = Number.POSITIVE_INFINITY;
    for (const trace of traces) {
      const ticks = annotationTicks(trace.annotations, trace.durationSec);
      for (const tickWidth of TICK_WIDTHS_PX) {
        for (const barWidth of BAR_WIDTHS_PX) {
          for (let i = 0; i < ticks.length; i += 1) {
            const slot = slotPct(ticks[i], tickWidth / 2, barWidth);
            narrowestSlotPx = Math.min(
              narrowestSlotPx,
              ((slot.right - slot.left) / 100) * barWidth,
            );
            if (i === 0) continue;
            const prev = slotPct(ticks[i - 1], tickWidth / 2, barWidth);
            const overlapPx = ((prev.right - slot.left) / 100) * barWidth;
            if (overlapPx > 1e-9) worst.push({ trace: trace.id, overlapPx });
          }
        }
      }
    }
    expect(worst).toEqual([]);
    // …and the price, stated rather than hidden: a tick with a close neighbour
    // gives up half the gap. Nothing collapses to nothing.
    expect(narrowestSlotPx).toBeGreaterThan(1);
  });

  it("would CATCH the defect — the un-clamped, un-merged layout is not clean", () => {
    // The negative control for this test: lay the ticks out the way the mouse
    // deck did before this row (one 20 px button per annotation, centred), and
    // assert the same sweep finds overlaps. A zero from a probe that cannot
    // produce a non-zero is worth nothing.
    let overlaps = 0;
    let worstPx2 = 0;
    for (const trace of traces) {
      const duration = Math.max(trace.durationSec, 0.001);
      const stamps = trace.annotations.map((a) => (a.tSec / duration) * 298);
      for (let i = 1; i < stamps.length; i += 1) {
        const overlapPx = 20 - (stamps[i] - stamps[i - 1]);
        if (overlapPx > 0) {
          overlaps += 1;
          worstPx2 = Math.max(worstPx2, overlapPx * 28);
        }
      }
    }
    expect(overlaps).toBeGreaterThan(100);
    expect(Math.round(worstPx2)).toBe(560); // the exact rect the desktop shipped
  });
});
