/**
 * Clip pilot list (clipPilot.ts) — the derived ~20-clip pilot the capture rig
 * records. Pins:
 *  1. size ≥ 15 (the founder-ratified pilot scale — 20 resolvable events
 *     today, minus representative sharing);
 *  2. every entry resolves: real template, in-range mistake index, the trace
 *     path IS that mistake's traceRef.path, and the committed trace file
 *     exists (both the repo content copy and the published public copy);
 *  3. id format + uniqueness + deterministic order (the manifest contract);
 *  4. full coverage: every event the why-panel index resolves appears on
 *     exactly one clip.
 *
 * No content repo needed — the list is static-template + catalog derived.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES, scenarioById } from "@/modules/sim/lessons";
import { clipIdFor, clipPilotList } from "./clipPilot";
import { whyPanelSimRefIndex } from "./whyPanel";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLATFORM_ROOT = path.resolve(HERE, "../../..");

describe("clipPilotList — the derived pilot", () => {
  const list = clipPilotList();

  it("carries at least 15 clips (20 resolvable events today, deduped)", () => {
    expect(list.length).toBeGreaterThanOrEqual(15);
    expect(list.length).toBeLessThanOrEqual(whyPanelSimRefIndex().size);
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

  it("covers every resolvable event exactly once", () => {
    const index = whyPanelSimRefIndex();
    const covered = new Map<string, string>();
    for (const entry of list) {
      expect(entry.eventTypes.length).toBeGreaterThan(0);
      expect(entry.eventTypes).toEqual([...entry.eventTypes].sort());
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
