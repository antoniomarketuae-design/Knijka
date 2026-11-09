/**
 * BASE EVENTS NEVER MOVE — the census half of lane slowturn's proof (T5;
 * rulings R4 and R8'). Every committed demo of every lesson and every
 * committed rig tape is replayed on the runtime's own 60 Hz grid through two
 * TurnDetectors fed identical inputs: one given no road sample (the base 3 s
 * window alone — what the product did before the lane) and the product one
 * (runtime/turns.ts, base window + the added, road-referenced path).
 *
 * Poses are level-independent, so one replay per tape answers for L1–L5. The
 * live-chain census of the 14 tapes that gain an added event (every sheet,
 * L1–L5) is in the lane's PROGRESS.md; this file pins the detector facts:
 *
 *  1. the base (step, node, direction) list equals the tree's base-tagged list
 *     at identical steps — no base event moved, none suppressed;
 *  2. NO added event in any junction visit that has a base event — the
 *     assertion that kills «the added path fires on a visit where the base
 *     fired»;
 *  3. at most one added event per visit, none on a ring;
 *  4. the added events themselves, pinned: 14 visits, all at the two single-node
 *     catalogue junctions tj-n-c and sx-n-c (8 correct demos, 6 mistakes).
 */
import { describe, expect, it } from "vitest";
import { scenarioById } from "../templates";
import { loadDistrict } from "./witnessLiveRung";
import { committedDemoTapes, committedRigTapes, gridTurnReplay, type GridTurnReplay } from "./slowturnTapes";

const cells = [...committedDemoTapes(), ...committedRigTapes()];
const replays: Array<{ key: string; r: GridTurnReplay }> = [];
for (const c of cells) {
  const spec = scenarioById(c.lessonId);
  if (!spec) throw new Error(`no template for ${c.lessonId}`);
  replays.push({ key: `${c.lessonId}/${c.name}`, r: gridTurnReplay(c.trace, loadDistrict(spec.map.districtId)) });
}

const fmt = (e: { k: number; node: string | null; dir: string }) => `k${e.k} ${e.node} ${e.dir}`;

/** The visit (index into r.visits) a grid step belongs to. */
function visitOf(r: GridTurnReplay, k: number): number {
  return r.visits.findIndex((v) => k >= v.k0 && k <= v.k1);
}

describe("T5 — every committed demo and rig tape: the base turn events are untouched", () => {
  it("the census covers every committed tape (503 demos + 28 rig tapes) and its 43 base events", () => {
    expect(cells.filter((c) => c.kind === "demo").length).toBe(503);
    expect(cells.filter((c) => c.kind === "rig").length).toBe(28);
    expect(replays.reduce((n, x) => n + x.r.base.length, 0)).toBe(43);
  });

  it("BASE-UNMOVED: the base list equals the tree's base-tagged list at identical grid steps, on every tape", () => {
    const moved: string[] = [];
    for (const { key, r } of replays) {
      const base = r.base.map(fmt).join(" | ");
      const tree = r.tree.filter((e) => e.tag === "base").map(fmt).join(" | ");
      if (base !== tree) moved.push(`${key}: base [${base}] tree [${tree}]`);
    }
    expect(moved).toEqual([]);
  });

  it("NO-ADDED-ON-A-BASE-VISIT: the added path never fires in a junction visit where the base fired", () => {
    const bad: string[] = [];
    for (const { key, r } of replays) {
      const baseVisits = new Set(r.base.map((e) => visitOf(r, e.k)));
      for (const e of r.tree) {
        if (e.tag === "added" && baseVisits.has(visitOf(r, e.k))) bad.push(`${key}: ${fmt(e)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("ONE-PER-VISIT: at most one added event per junction visit, and none on a ring node", () => {
    const bad: string[] = [];
    for (const { key, r } of replays) {
      const seen = new Map<number, number>();
      for (const e of r.tree) {
        if (e.tag !== "added") continue;
        const v = visitOf(r, e.k);
        seen.set(v, (seen.get(v) ?? 0) + 1);
        if (r.visits[v]?.ring) bad.push(`${key}: ring ${fmt(e)}`);
      }
      for (const [v, n] of seen) if (n > 1) bad.push(`${key}: ${n} added in visit ${r.visits[v]?.node}`);
    }
    expect(bad).toEqual([]);
  });

  it("the added events on committed tapes, pinned (the census's 14 visits)", () => {
    const added: string[] = [];
    for (const { key, r } of replays) {
      for (const e of r.tree) if (e.tag === "added") added.push(`${key}: ${fmt(e)}`);
    }
    expect(added).toEqual([
      "sc-junction-rhr/shadow-correct.trace.json: k1942 tj-n-c left",
      "sc-junction-stop/mistake-rolling-stop.trace.json: k1420 tj-n-c right",
      "sc-junction-stop/shadow-correct.trace.json: k1462 tj-n-c right",
      "sc-junction-scan/mistake-no-scan.trace.json: k1372 tj-n-c right",
      "sc-junction-scan/mistake-single-glance.trace.json: k1372 tj-n-c right",
      "sc-junction-scan/shadow-correct.trace.json: k1855 tj-n-c right",
      "sc-junction-gap/mistake-creep-out.trace.json: k1184 tj-n-c right",
      "sc-junction-gap/mistake-cut-gap.trace.json: k1073 tj-n-c right",
      "sc-junction-gap/shadow-correct.trace.json: k1525 tj-n-c right",
      "sc-junction-blind/shadow-correct.trace.json: k2797 tj-n-c left",
      "sc-junction-left/mistake-creep-out.trace.json: k1483 tj-n-c left",
      "sc-junction-left/shadow-correct.trace.json: k1645 tj-n-c left",
      "sc-signal-dead/shadow-correct.trace.json: k2140 sx-n-c left",
      "sc-vu-emergency-junction/shadow-correct.trace.json: k1942 tj-n-c left",
    ]);
  });
});
