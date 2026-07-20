/**
 * Clip-capture PILOT LIST (the why-panel video pilot, docs/development/62..64
 * context) — the ~20 clips the /dev/clip-capture rig records first.
 *
 * DERIVED, never hand-picked: one entry per REPRESENTATIVE mistake of every
 * event the why-panel resolver can serve today (whyPanel.ts simRefIndex — the
 * same deterministic pick the panel replays), deduped by clip id (events that
 * share a representative share one clip). By construction every clip lands on
 * questions the founder will actually meet in theory practice.
 *
 * The clip id `<templateId>__m<mistakeIndex>` is the SHARED manifest contract
 * with platform/public/clips/manifest.json (capture rig writes it, the
 * gallery/why-panel read it).
 *
 * Pure static data — no content repo, no I/O; safe on server and client.
 */

import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import { whyPanelSimRefIndex } from "./whyPanel";

export interface ClipPilotEntry {
  /** Manifest clip id — `<templateId>__m<mistakeIndex>`. */
  id: string;
  templateId: string;
  /** Index into ScenarioSpec.mistakes of the represented demo. */
  mistakeIndex: number;
  /** Repo-relative trace path, EXACTLY ScenarioSpec.mistakes[i].traceRef.path. */
  tracePath: string;
  /** STORED mistake title (the manifest titleBg — ADR-002, never invented). */
  titleBg: string;
  /** The ev-* scenario events this clip covers (≥1, sorted). */
  eventTypes: string[];
}

/** The shared manifest id format: `<templateId>__m<mistakeIndex>`. */
export function clipIdFor(templateId: string, mistakeIndex: number): string {
  return `${templateId}__m${mistakeIndex}`;
}

/**
 * The pilot list: one clip per representative mistake of every resolvable
 * event, sorted by clip id. Deterministic — same templates + catalog → same
 * list (the index's pinned-pick law carries over).
 */
export function clipPilotList(): ClipPilotEntry[] {
  const byId = new Map<string, ClipPilotEntry>();
  for (const [event, ref] of whyPanelSimRefIndex()) {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === ref.templateId);
    if (!spec) continue; // structurally impossible — the index built from it
    // The index exposes the picked mistake by its trace path (unique per
    // recorded demo); recover the index for the manifest id.
    const mistakeIndex = spec.mistakes.findIndex(
      (m) => m.traceRef.path === ref.mistake.tracePath,
    );
    if (mistakeIndex < 0) continue;
    const id = clipIdFor(ref.templateId, mistakeIndex);
    const existing = byId.get(id);
    if (existing) {
      if (!existing.eventTypes.includes(event)) existing.eventTypes.push(event);
      continue;
    }
    byId.set(id, {
      id,
      templateId: ref.templateId,
      mistakeIndex,
      tracePath: ref.mistake.tracePath,
      titleBg: ref.mistake.titleBg,
      eventTypes: [event],
    });
  }
  const list = [...byId.values()];
  for (const entry of list) entry.eventTypes.sort();
  list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return list;
}
