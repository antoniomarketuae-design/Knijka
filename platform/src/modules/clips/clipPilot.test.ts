/**
 * Clip pilot list (clipPilot.ts) — the clip list the capture rig records. Pins:
 *  1. size ≥ 15 (the founder-ratified pilot scale — 20 resolvable events
 *     today, minus representative sharing);
 *  2. every entry resolves: real template, in-range mistake index, the trace
 *     path IS that mistake's traceRef.path, and the committed trace file
 *     exists (both the repo content copy and the published public copy);
 *  3. id format + uniqueness + deterministic order (the manifest contract);
 *  4. full coverage: every event the why-panel index resolves has exactly one
 *     "event-index" clip — AND every drill a THEO-4 pairing correction
 *     re-points at is in the list too, because a clip that is not in the pilot
 *     can never be rendered (headless-client refuses it) and would be stuck on
 *     the 2D replay forever.
 *
 * No content repo needed — the list is static-template + catalog + table derived.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES, scenarioById } from "@/modules/sim/lessons";
import { clipIdFor, clipPilotList } from "./clipPilot";
import { whyPanelSimRefIndex } from "./whyPanel";
import {
  EVENT_SCENARIO_CORRECTION,
  QUESTION_SCENARIO_CORRECTION,
} from "./whyPanelPairing";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLATFORM_ROOT = path.resolve(HERE, "../../..");

describe("clipPilotList — the derived pilot", () => {
  const list = clipPilotList();

  it("carries at least 15 clips (20 resolvable events today, deduped)", () => {
    expect(list.length).toBeGreaterThanOrEqual(15);
    // The index half can never exceed the number of resolvable events (they
    // share representatives); the pairing/authored folds are additions on top.
    const indexClips = list.filter((e) => e.origin === "event-index");
    expect(indexClips.length).toBeLessThanOrEqual(whyPanelSimRefIndex().size);
  });

  it("every entry resolves to a real template mistake and an existing trace file", () => {
    for (const entry of list) {
      const spec = scenarioById(entry.templateId);
      expect(spec, entry.id).toBeDefined();
      const mistake = spec!.mistakes[entry.mistakeIndex];
      expect(mistake, entry.id).toBeDefined();
      expect(mistake.traceRef.path, entry.id).toBe(entry.tracePath);
      expect(mistake.traceRef.pending === true, entry.id).toBe(false);
      expect(entry.titleBg, entry.id).toBe(mistake.titleBg);
      // Committed source of truth…
      expect(existsSync(path.join(REPO_ROOT, entry.tracePath)), entry.tracePath).toBe(true);
      // …and the published byte-identical public copy the rig fetches.
      const publicPath = entry.tracePath.replace(/^content\//, "public/");
      expect(existsSync(path.join(PLATFORM_ROOT, publicPath)), publicPath).toBe(true);
    }
  });

  it("ids follow the manifest contract, are unique, and the list is sorted", () => {
    const ids = list.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    for (const entry of list) {
      expect(entry.id).toBe(clipIdFor(entry.templateId, entry.mistakeIndex));
      expect(entry.id).toMatch(/^[a-z0-9][a-z0-9-]*__m\d+$/);
    }
  });

  it("covers every resolvable event exactly once (the event-index half)", () => {
    const index = whyPanelSimRefIndex();
    const covered = new Map<string, string>();
    for (const entry of list) {
      expect(entry.eventTypes).toEqual([...entry.eventTypes].sort());
      if (entry.origin !== "event-index") continue;
      expect(entry.eventTypes.length, entry.id).toBeGreaterThan(0);
      for (const event of entry.eventTypes) {
        expect(index.has(event), event).toBe(true);
        expect(covered.has(event), `${event} on ${covered.get(event)} and ${entry.id}`).toBe(
          false,
        );
        covered.set(event, entry.id);
      }
    }
    expect(covered.size).toBe(index.size);
  });

  it("every pairing-correction target is in the list — else it can never be rendered", () => {
    // The defect this closes: whyPanelPairing re-points a question at the drill
    // that depicts ITS manoeuvre, but the pilot used to derive from the RAW
    // event wiring only, so those targets had no clip slot, no requirements
    // card, and /dev/clip-headless refused them („не е в пилота"). The panel
    // then fell back to the 2D canvas for exactly the questions the correction
    // was written to get right.
    const ids = new Set(list.map((e) => e.id));
    const targets = [
      ...Object.values(QUESTION_SCENARIO_CORRECTION),
      ...Object.values(EVENT_SCENARIO_CORRECTION),
    ];
    for (const correction of targets) {
      const id = clipIdFor(correction.templateId, correction.mistakeIndex);
      expect(ids.has(id), `${id} is a pairing-correction target but not in the pilot`).toBe(true);
    }
  });

  it("is deterministic across calls", () => {
    expect(clipPilotList()).toEqual(list);
  });

  it("mistake-index recovery is unambiguous (trace paths unique per template)", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const paths = spec.mistakes.map((m) => m.traceRef.path);
      expect(new Set(paths).size, spec.id).toBe(paths.length);
    }
  });
});
