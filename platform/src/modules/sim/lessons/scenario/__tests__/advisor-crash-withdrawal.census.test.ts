/**
 * CENSUS — sc-roundabout-entry:4ab693eb clause 2 (the coach line after a crash).
 *
 * WHAT IT RECORDS. Every committed demo × every rung, replayed through the
 * LIVE chain (`liveChainReplay`, 60 Hz, the lesson's own ambient traffic), and
 * at every graded grid point the advisor's line as `advisorPromptForSession`
 * returns it (text + chips), run-length encoded, beside every scored COLLISION
 * (its session time and the tick's speed) and the crash pin's arm times.
 *
 * WHY IT EXISTS. The repair withdraws the objective line while a car stands
 * at what it has just hit. The claim the census defends is the narrow one:
 * the advisor stream of a drive CHANGES ONLY AT AND AFTER A COLLISION, and on
 * every drive with no collision it is byte for byte what it was. The base side
 * of that comparison cannot be computed in the tree, so the full run writes the
 * stream to `ADVISOR_CENSUS_OUT` and the lane diffs the base run against the
 * tree run (the lane's PROGRESS.md records both). What CAN be checked in the
 * tree is checked by default, on the committed demos that carry a collision:
 * from each collision's grid point the objective line is not on the card
 * until the car has come to rest AND is driving again, the pin is dropped, or
 * the route hold takes over.
 *
 * `ADVISOR_CENSUS_FULL=1` runs every demo (with `ADVISOR_CENSUS_SHARD=i/n`);
 * without it, the default cells only.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../../contracts";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { advisorPromptForSession } from "../../advisor";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const FULL = process.env.ADVISOR_CENSUS_FULL === "1";
const OUT = process.env.ADVISOR_CENSUS_OUT;

export interface AdvisorStreamCell {
  key: string;
  /** Run-length: [grid-point session time, the line ("" = no card)]. */
  stream: Array<[number, string]>;
  /** Scored collisions: session time and the tick's speed, km/h. */
  collisions: Array<[number, number]>;
  /** Grid points at which the crash pin was (re-)armed. */
  pinArms: number[];
  points: number;
}

function lineOf(p: ReturnType<typeof advisorPromptForSession>): string {
  return p === null ? "" : `${p.textBg}${p.keys.length > 0 ? ` [${p.keys.join(",")}]` : ""}`;
}

function streamOf(key: string, lesson: LessonSpec, raw: unknown, trace: ScenarioTrace): AdvisorStreamCell {
  const stream: Array<[number, string]> = [];
  const collisions: Array<[number, number]> = [];
  const pinArms: number[] = [];
  let points = 0;
  let prevPinAt: number | undefined;
  let seenEvents = 0;
  liveChainReplay({
    lesson,
    districtRaw: raw,
    trace,
    holdAfterSec: 3,
    afterApply: ({ t, tick, step }) => {
      points++;
      const s = step.state;
      const line = lineOf(advisorPromptForSession(s));
      if (stream.length === 0 || stream[stream.length - 1][1] !== line) stream.push([Number(t.toFixed(4)), line]);
      for (let i = seenEvents; i < s.events.length; i++) {
        const e = s.events[i];
        if (e.kind === "violation" && e.code === "COLLISION") collisions.push([Number(e.t.toFixed(4)), Number(tick.speedKmh.toFixed(3))]);
      }
      seenEvents = s.events.length;
      const pinAt = s.crashPin?.atSec;
      if (pinAt !== undefined && pinAt !== prevPinAt) pinArms.push(Number(pinAt.toFixed(4)));
      prevPinAt = pinAt;
    },
  });
  return { key, stream, collisions, pinArms, points };
}

/** Committed demos known to carry a scored collision (measured on the base run). */
const DEFAULT_CELLS: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[]]> = [
  ["sc-park-gap-short", "mistake-forward-hit.trace.json", [1, 3]],
];

function cellsOf(): Array<{ key: string; lesson: LessonSpec; raw: unknown; trace: ScenarioTrace }> {
  const cells: Array<{ key: string; lesson: LessonSpec; raw: unknown; trace: ScenarioTrace }> = [];
  const shard = (process.env.ADVISOR_CENSUS_SHARD ?? "0/1").split("/").map(Number);
  let n = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    const dir = path.join(REPO_ROOT, "content", "traces", spec.id);
    if (!existsSync(dir)) continue;
    const wanted = FULL ? null : DEFAULT_CELLS.filter((c) => c[0] === spec.id);
    if (wanted !== null && wanted.length === 0) continue;
    if (FULL && n++ % shard[1] !== shard[0]) continue;
    const rungs: Array<[ScenarioLevel, LessonSpec]> = [];
    for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      try {
        rungs.push([L, compileScenario(spec, L)]);
      } catch {
        /* no such rung */
      }
    }
    const raw = loadDistrict(spec.map.districtId);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".trace.json")).sort()) {
      const levels = wanted === null ? null : wanted.filter((c) => c[1] === f).flatMap((c) => c[2]);
      if (levels !== null && levels.length === 0) continue;
      const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(dir, f), "utf-8")));
      if (!trace) continue;
      for (const [L, lesson] of rungs) {
        if (levels !== null && !levels.includes(L)) continue;
        cells.push({ key: `${spec.id}/${f}/L${L}`, lesson, raw, trace });
      }
    }
  }
  return cells;
}

describe("the advisor line stream of the committed demos (sc-roundabout-entry:4ab693eb clause 2)", () => {
  it(
    FULL ? "every committed demo × rung: the stream is written for the base-vs-tree diff" : "the default collision cells",
    () => {
      const out: AdvisorStreamCell[] = [];
      for (const c of cellsOf()) out.push(streamOf(c.key, c.lesson, c.raw, c.trace));
      if (OUT) writeFileSync(OUT, JSON.stringify(out));
      expect(out.length).toBeGreaterThan(0);
    },
    FULL ? 24 * 3600_000 : 600_000,
  );
});
