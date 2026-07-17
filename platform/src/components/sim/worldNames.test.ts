/**
 * WORLD_NAME_BG coverage — the tripwire for the „света" fallback gap.
 *
 * Every district a shipped ScenarioSpec loads (map.districtId) is surfaced in
 * LessonScene's loading/error copy by name. When 53 of the referenced maps had
 * no entry, two thirds of the catalog read the generic „света" fallback. This
 * asserts the map stays exhaustive against SCENARIO_TEMPLATES, so a new
 * template (or a new wave) that forgets its name fails HERE, loudly, instead of
 * silently degrading the copy.
 *
 * Scoped to REFERENCED ids: "district-v1" is the builder default (SceneSlot +
 * world tests), reachable via DEFAULT_DISTRICT_ID rather than any template — it
 * is asserted present separately so it is never dropped, but it does not need a
 * template to justify its entry.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_DISTRICT_ID } from "@/modules/sim/contracts";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario/templates";
import { WORLD_NAME_BG, WORLD_NAME_FALLBACK, worldNameBg } from "./worldNames";

describe("WORLD_NAME_BG coverage", () => {
  const referenced = [...new Set(SCENARIO_TEMPLATES.map((s) => s.map.districtId))].sort();

  it("names every district a shipped scenario template loads", () => {
    const missing = referenced.filter((id) => !(id in WORLD_NAME_BG));
    // Names the gap explicitly so a failure points straight at the culprit ids.
    expect(missing).toEqual([]);
  });

  it("resolves a real name (never the fallback) for every referenced district", () => {
    const falling = referenced.filter((id) => worldNameBg(id) === WORLD_NAME_FALLBACK);
    expect(falling).toEqual([]);
  });

  it("keeps the builder-default district named", () => {
    // district-v1 is loaded by SceneSlot / world tests, not by a template —
    // guard it so the orphan-but-live default is never pruned.
    expect(WORLD_NAME_BG[DEFAULT_DISTRICT_ID]).toBeTruthy();
  });

  it("assigns a distinct display name to each district", () => {
    // Two districts sharing a name makes the loading/error copy ambiguous.
    const byName = new Map<string, string[]>();
    for (const [id, name] of Object.entries(WORLD_NAME_BG)) {
      byName.set(name, [...(byName.get(name) ?? []), id]);
    }
    const collisions = [...byName.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions).toEqual([]);
  });

  it("has non-empty names throughout", () => {
    const empty = Object.entries(WORLD_NAME_BG)
      .filter(([, name]) => name.trim().length === 0)
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });
});
