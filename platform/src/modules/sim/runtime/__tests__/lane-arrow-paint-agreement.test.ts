/**
 * THE GRADED ARROW AND THE PAINTED ARROW MUST BE THE SAME ARROW.
 *
 * Sweep 161 routed a CRITICAL at `runtime/laneArrows.ts` reading „the student is
 * told to read markings that are not there", citing
 * `sc-ln-turn-lane-arrows/mobile-right/04-t096s.png`.
 *
 * WHAT THE FRAMES ACTUALLY SHOW, because that finding is half wrong and the half
 * that is right is not the half it names. Opened by eye:
 *   pc-right/04-t001s.png      a white М10 glyph, stem + 45° head, painted in
 *                              the curb lane ~17 m ahead of the spawn.
 *   mobile-right/04-t011s.png  the same glyph on WebKit — so it is not a
 *                              platform LOD that drops the markings mesh.
 *   mobile-right/04-t096s.png  the cited frame: the car is AT the junction
 *                              mouth, where there is indeed nothing.
 * `world/__tests__/lane-arrows-markings.test.ts` says why, in numbers this file
 * does not have to re-derive: the authored span is [30, 150] on ln-e-s, the
 * pitch is 30 m and the junction trim ends the drawn line at s 105.8, so the
 * three stations land at district y −116.25 / −86.25 / −56.25. The last glyph is
 * 12 m BEFORE the stop line (y −43.98) and 56 m before the mouth. The world does
 * match the briefing on the approach; the cited frame is simply past every
 * arrow. Whether the last station should be nearer the line is a question about
 * `LANE_ARROW_PITCH_M` in `world/builders/markings.ts`, which this lane does not
 * own, and it is filed as such rather than answered here.
 *
 * WHAT IS REAL, AND WHAT THIS BATTERY IS FOR. Looking for the falsehood the
 * finding named turned up a different one, of exactly its class: the resolver's
 * vocabulary and the painter's are two independent tables over the same authored
 * field, and two names — `leftThrough`, `throughRight` — were in the GRADED one
 * and in neither of the painter's. `rules/engine.ts:865-867` grades both. So one
 * line of map data would have produced a conviction for disobeying an arrow that
 * was never on the road: the founder's own roundabout complaint, manufacturable
 * on demand.
 *
 * The narrowing that closed it is in `laneArrows.ts`. This file is what stops it
 * coming back, in BOTH directions — a graded name nothing paints, and an
 * authored name nobody grades — because a table kept true by care has already
 * been shown to drift.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARROW_BY_NAME,
  PAINTED_BUT_UNGRADED_ARROW_NAMES,
  buildLaneArrowSpans,
} from "../laneArrows";
import { DistrictIndex } from "../spatial";
import { parseDistrict, type District } from "../district";
import { analyzeNetwork } from "../../world/builders/network";
import { buildMarkings } from "../../world/builders/markings";
import { assertDistrict, type District as WorldDistrict } from "../../world/types";

const EMPTY: ReadonlySet<string> = new Set();

/** Districts live outside the app dir; the shipped copy under public/ is the
 *  same bytes and is the fallback the world batteries already use. */
function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
    path.join(process.cwd(), "public", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  throw new Error(`${id}.json not found in ${candidates.join(", ")}`);
}

/** Every shipped district that authors `meta.scenario.laneArrows`, by id. */
function districtsWithArrows(): Array<{ id: string; raw: Record<string, unknown> }> {
  const dirs = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
    path.join(process.cwd(), "public", "world"),
  ];
  const dir = dirs.find((d) => fs.existsSync(d));
  if (dir === undefined) throw new Error(`no content/world dir among ${dirs.join(", ")}`);
  const out: Array<{ id: string; raw: Record<string, unknown> }> = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const meta = raw.meta as { scenario?: { laneArrows?: unknown } } | undefined;
    if (meta?.scenario?.laneArrows === undefined) continue;
    out.push({ id: f.replace(/\.json$/, ""), raw });
  }
  return out;
}

/** Authored arrow names in one district's block. */
function authoredNames(raw: Record<string, unknown>): string[] {
  const la = (raw.meta as { scenario: { laneArrows: { lanes?: unknown } } }).scenario.laneArrows;
  const lanes = Array.isArray(la.lanes) ? (la.lanes as Array<Record<string, unknown>>) : [];
  return lanes.map((l) => String(l?.arrow ?? "")).filter((n) => n.length > 0);
}

/** Quads the arrow pass laid for this district, through the SHIPPING painter. */
function paintedArrowQuads(raw: unknown): number {
  const d: WorldDistrict = assertDistrict(raw);
  return buildMarkings(d, analyzeNetwork(d), EMPTY, EMPTY).laneArrowQuads;
}

/** The lanes the GRADER would arm on, through the shipping resolver. */
function gradedArrows(raw: unknown): string[] {
  const d: District = parseDistrict(raw);
  const spans = buildLaneArrowSpans(d, new DistrictIndex(d));
  const out: string[] = [];
  for (const list of spans.values()) for (const s of list) out.push(...s.byLane.values());
  return out;
}

/** ln-arrows-v1 with every authored lane's `arrow` rewritten to `name` — the
 *  smallest possible "a map author wrote this" experiment, on the real map the
 *  SN-04 drill ships. */
function withArrowName(name: string): Record<string, unknown> {
  const raw = structuredClone(loadRaw("ln-arrows-v1")) as Record<string, unknown>;
  const la = (raw.meta as { scenario: { laneArrows: { lanes: Array<Record<string, unknown>> } } })
    .scenario.laneArrows;
  for (const lane of la.lanes) lane.arrow = name;
  return raw;
}

describe("lane-arrow paint/grade agreement", () => {
  it("the shipped map paints AND grades — the control this file would be worthless without", () => {
    // Named a control on purpose. Every "0 defects" report in this project was
    // an instrument bug, so before either refusal below is believed, the
    // instrument has to be shown reading a case verified by eye:
    // pc-right/04-t001s.png is the glyph, and these are its numbers.
    //
    // `> 0` rather than the exact 24, deliberately. The count is 24 today and
    // `world/__tests__/lane-arrows-markings.test.ts` pins it station by
    // station — that is its job. Copying the number here would make THIS file
    // go red for a legitimate change to `LANE_ARROW_PITCH_M`, which is exactly
    // the change the header above says the frames argue for.
    const raw = loadRaw("ln-arrows-v1");
    expect(paintedArrowQuads(raw)).toBeGreaterThan(0);
    expect(gradedArrows(raw).sort()).toEqual(["left", "right", "through"]);
  });

  it("every GRADED name is one the painter can actually lay", () => {
    // The direction that produces a FALSE CONVICTION: the engine bills a
    // student for an arrow that is not on the road.
    // MUTATION that proves this is real: put `throughRight: "throughRight"`
    // back into ARROW_BY_NAME and this goes red on paintedArrowQuads — the
    // painter's ARROW_GLYPHS has no key of that name (only `nearExits` reaches
    // that glyph), so it lays 0 quads while the resolver arms 3 lanes.
    for (const name of Object.keys(ARROW_BY_NAME)) {
      const raw = withArrowName(name);
      expect(gradedArrows(raw).length, `graded · ${name}`).toBeGreaterThan(0);
      expect(paintedArrowQuads(raw), `painted · ${name}`).toBeGreaterThan(0);
    }
  });

  it("every name the painter lays is either graded or a declared advice label", () => {
    // The opposite direction, and it is not symmetry for its own sake: quietly
    // declining to grade an authored marking is how a lesson about markings
    // hands out a pass it never measured. Only the roundabout's two advice
    // labels may be painted and ungraded, and they have to say so by name.
    for (const name of [...PAINTED_BUT_UNGRADED_ARROW_NAMES]) {
      const raw = withArrowName(name);
      expect(paintedArrowQuads(raw), `painted · ${name}`).toBeGreaterThan(0);
      expect(gradedArrows(raw), `ungraded advice · ${name}`).toEqual([]);
    }
  });

  it("a name in neither table is inert — it never paints and never grades", () => {
    // The tolerant-by-construction contract of both files, checked rather than
    // trusted: an author's typo must be "no marking here" on BOTH sides, never
    // graded-without-paint on one of them.
    for (const name of ["leftThrough", "throughRight", "uTurn", "", "LEFT"]) {
      const raw = withArrowName(name);
      expect(gradedArrows(raw), `graded · ${name}`).toEqual([]);
      expect(paintedArrowQuads(raw), `painted · ${name}`).toBe(0);
    }
  });

  it("no SHIPPED district authors a name outside the two declared tables", () => {
    // The build-time red that replaces the runtime trap. When a map gains
    // `throughRight` this fails here, in a file that names the fix (add the
    // glyph to world/builders/markings.ts ARROW_GLYPHS first, then the name to
    // laneArrows.ts) — instead of shipping a conviction with no paint.
    const known = new Set([...Object.keys(ARROW_BY_NAME), ...PAINTED_BUT_UNGRADED_ARROW_NAMES]);
    const districts = districtsWithArrows();
    // Guard the guard: a loader that silently found nothing would pass this
    // test forever. Four blocks ship today (ln-arrows-v1, ov-oneway-v1,
    // rb-2lane-v1 — the last authoring four arms under one block).
    expect(districts.map((d) => d.id).sort()).toEqual([
      "ln-arrows-v1",
      "ov-oneway-v1",
      "rb-2lane-v1",
    ]);
    for (const { id, raw } of districts) {
      for (const name of authoredNames(raw)) {
        expect(known.has(name), `${id} authors an arrow nobody handles: ${name}`).toBe(true);
      }
    }
  });
});
