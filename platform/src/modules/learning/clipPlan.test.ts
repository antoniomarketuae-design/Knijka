/**
 * Clip-plan freshness gate + derivation pins (doc 66 — the requirements-card
 * law). The plan is recomputed HERE from the committed traces, templates and
 * districts (clipPlanBuilder replays every pilot demo through the production
 * grading stack) and must match clipPlan.generated.ts byte for byte — the
 * whyPanelMap freshness mold over the RECORD_TRACES execution precedent.
 *
 * REGENERATE (after template/trace/map changes):
 *   node tools/clips/gen_clip_plan.mjs
 * or directly:
 *   GEN_CLIP_PLAN=1 npx vitest run src/modules/learning/clipPlan.test.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clipPilotList } from "./clipPilot";
import { CLIP_PLAN, clipPlanForId, type ClipPlanEntry } from "./clipPlan.generated";
import { buildClipPlan, renderClipPlanModule } from "./clipPlanBuilder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const TARGET = path.join(HERE, "clipPlan.generated.ts");
const GEN = process.env.GEN_CLIP_PLAN === "1";

// ~20 headless replays through the production stack — built once per run.
const built = buildClipPlan();
const rendered = renderClipPlanModule(built);
if (GEN) writeFileSync(TARGET, rendered);

function builtById(id: string): ClipPlanEntry {
  const entry = built.find((e) => e.id === id);
  expect(entry, id).toBeDefined();
  return entry!;
}

describe("clipPlan.generated.ts — the freshness gate", () => {
  it("committed file is byte-identical to the recomputed plan", () => {
    expect(readFileSync(TARGET, "utf-8")).toBe(rendered);
  });

  // In GEN mode the in-process import predates the rewrite — the byte gate
  // above already covers the file; skip the stale-module comparison.
  (GEN ? it.skip : it)("imported CLIP_PLAN equals the recomputation", () => {
    expect([...CLIP_PLAN]).toEqual(built);
    for (const entry of built) expect(clipPlanForId(entry.id)).toEqual(entry);
    expect(clipPlanForId("no-such__m9")).toBeNull();
  });

  it("covers exactly the pilot list, in order, ids/paths verbatim", () => {
    const pilot = clipPilotList();
    expect(built.map((e) => e.id)).toEqual(pilot.map((p) => p.id));
    for (let i = 0; i < pilot.length; i++) {
      expect(built[i].templateId).toBe(pilot[i].templateId);
      expect(built[i].mistakeIndex).toBe(pilot[i].mistakeIndex);
      expect(built[i].tracePath).toBe(pilot[i].tracePath);
    }
  });

  it("every fault time is engine-computed and inside its trace (R3)", () => {
    for (const entry of built) {
      expect(entry.faultTimeSec, entry.id).toBeGreaterThan(0);
      const trace = JSON.parse(
        readFileSync(path.join(REPO_ROOT, entry.tracePath), "utf-8"),
      ) as { meta: { durationSec: number } };
      expect(entry.faultTimeSec, entry.id).toBeLessThanOrEqual(trace.meta.durationSec);
    }
  });

  it("every card is complete: view valid, control labeled, actors labeled", () => {
    for (const entry of built) {
      expect(["exterior", "cockpit", "exterior+dashboard"]).toContain(entry.view);
      expect(["sign", "signal", "marking", "none"]).toContain(entry.governingControl.kind);
      expect(entry.governingControl.label.length, entry.id).toBeGreaterThan(0);
      for (const actor of entry.requiredActors) {
        expect(actor.kind.length, entry.id).toBeGreaterThan(0);
        // Bulgarian labels (the UI-copy law).
        expect(actor.label, entry.id).toMatch(/[Ѐ-ӿ]/);
      }
    }
  });
});

describe("card derivation pins — known clips (R1/R2/R4)", () => {
  it("sc-follow-distance__m0 requires the lead car; no control; exterior", () => {
    const entry = builtById("sc-follow-distance__m0");
    expect(entry.requiredActors.some((a) => a.kind === "vehicle" && a.label.includes("отпред"))).toBe(true);
    expect(entry.governingControl.kind).toBe("none");
    expect(entry.view).toBe("exterior");
  });

  it("sc-vp-readiness__m0 (belt) is a cockpit clip", () => {
    expect(builtById("sc-vp-readiness__m0").view).toBe("cockpit");
  });

  it("sc-ac-night-lights__m0 (lights) is exterior+dashboard", () => {
    expect(builtById("sc-ac-night-lights__m0").view).toBe("exterior+dashboard");
  });

  it("sc-ov-ban-overtake__m0 is governed by the В24 sign, positioned", () => {
    const control = builtById("sc-ov-ban-overtake__m0").governingControl;
    expect(control.kind).toBe("sign");
    expect(control.label).toContain("В24");
    expect(control.approxPos).toBeDefined();
  });

  it("sc-ov-solid-line__m0 is governed by the М1 marking", () => {
    const control = builtById("sc-ov-solid-line__m0").governingControl;
    expect(control.kind).toBe("marking");
    expect(control.label).toContain("М1");
  });

  it("sc-junction-stop__m0 is governed by the Б2 stop sign at the junction", () => {
    const control = builtById("sc-junction-stop__m0").governingControl;
    expect(control.kind).toBe("sign");
    expect(control.label).toContain("Б2");
    expect(control.approxPos).toBeDefined();
  });

  it("sc-ed-d2-city-run__m0 (red light) is governed by a signal", () => {
    const control = builtById("sc-ed-d2-city-run__m0").governingControl;
    expect(control.kind).toBe("signal");
    expect(control.approxPos).toBeDefined();
  });

  it("sc-rx-unguarded__m0 is governed by the А35 rail-crossing sign", () => {
    expect(builtById("sc-rx-unguarded__m0").governingControl.label).toContain("А35");
  });

  it("sc-zebra-approach__m0 requires the pedestrian over the zebra marking", () => {
    const entry = builtById("sc-zebra-approach__m0");
    expect(entry.requiredActors.some((a) => a.kind === "pedestrian")).toBe(true);
    expect(entry.governingControl.kind).toBe("marking");
  });

  it("sc-vu-emergency__m0 requires the emergency vehicle", () => {
    const entry = builtById("sc-vu-emergency__m0");
    expect(entry.requiredActors.some((a) => a.kind === "emergency")).toBe(true);
  });

  it("sc-park-perp-rev__m0 requires the parked cars it collides with", () => {
    const entry = builtById("sc-park-perp-rev__m0");
    expect(entry.requiredActors.some((a) => a.kind === "parkedVehicle")).toBe(true);
  });
});
