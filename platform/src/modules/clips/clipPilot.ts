/**
 * Clip-capture PILOT LIST (the why-panel video pilot, docs/development/62..64
 * context) — the clips the /dev/clip-capture + /dev/clip-headless rigs record.
 *
 * THE LIST IS THE PRODUCTION ORDER. `/dev/clip-headless` refuses a template
 * that is not in it (headless-client: „не е в пилота"), and clipPlan.test.ts
 * asserts the generated requirements card covers exactly this list, in order.
 * So a drill the why-panel can serve and this list does not name is a drill
 * that can never be RENDERED — it degrades to the 2D canvas MistakeReplay
 * forever. The founder's verdict on that fallback (2026-07-28) was „we cant
 * accept 2d i suppose", and he is right: the 2D replay is a correctness
 * backstop, not the destination.
 *
 * Hence three ORIGINS, in the order they are folded in:
 *
 *   "event-index" — DERIVED, never hand-picked: one entry per REPRESENTATIVE
 *      mistake of every event the why-panel resolver can serve through the raw
 *      EVENT_TO_SCENARIO wiring (whyPanel.ts simRefIndex — the same
 *      deterministic pick the panel replays), deduped by clip id.
 *   "pairing"     — DERIVED from the THEO-4 pairing corrections
 *      (whyPanelPairing.ts). A correction re-points a question — or a whole
 *      event — at the drill that depicts ITS manoeuvre, and the panel serves
 *      THAT drill; the pairing layer deliberately does not touch the raw
 *      wiring, so without this fold the corrected targets were invisible to
 *      the rig. They were exactly the clips the right-hook fix could not show
 *      in 3D.
 *   "authored"    — the short, reasoned list of demos the resolver does not
 *      name (yet) and the media programme still owes a rendered clip.
 *
 * A clip id can only be claimed once; the earliest origin wins and later
 * origins only contribute their event labels.
 *
 * The clip id `<templateId>__m<mistakeIndex>` is the SHARED manifest contract
 * with platform/public/clips/manifest.json (capture rig writes it, the
 * gallery/why-panel read it).
 *
 * Pure static data — no content repo, no I/O; safe on server and client.
 */

import { SCENARIO_TEMPLATES, scenarioById, type ScenarioSpec } from "@/modules/sim/lessons";
import { whyPanelSimRefIndex } from "./whyPanel";
import { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";
import {
  EVENT_SCENARIO_CORRECTION,
  QUESTION_SCENARIO_CORRECTION,
  type PairingCorrection,
} from "./whyPanelPairing";

/** Where a pilot entry came from — see the module header. */
export type ClipPilotOrigin = "event-index" | "pairing" | "authored";

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
  /**
   * The ev-* scenario events this clip covers. For an "event-index" clip that
   * is the set of events whose REPRESENTATIVE it is (≥1, sorted). For a
   * "pairing" clip it is the events whose corrected questions it serves — those
   * events still have their own index clip, so an event legitimately appears on
   * two entries and only the index one is its representative. May be empty for
   * an "authored" clip, which by definition no event resolves to yet.
   */
  eventTypes: string[];
  origin: ClipPilotOrigin;
}

/**
 * Demos the resolver does not name and the programme still owes a clip.
 * Every entry is a decision, so every entry carries the reason it is here;
 * the list is meant to stay short and to shrink as wiring catches up.
 */
const CLIP_PILOT_AUTHORED: readonly {
  readonly templateId: string;
  readonly mistakeIndex: number;
  readonly reason: string;
}[] = [
  {
    templateId: "sc-vu-cyclist-hook",
    mistakeIndex: 2,
    reason:
      "„Отрязване на велосипедиста в завоя“ — the picture-true right hook authored 2026-07-28 to the founder's brief: the car turns across the rider's line and forces him from 3.00 m/s to a standstill (4.26 m closest approach, no contact). Its two siblings grade the same code correctly but pass BEHIND the rider, so nothing on screen argues the lesson. Not wired to an event yet; it is here because the demo only exists to be LOOKED at.",
  },
];

/** The shared manifest id format: `<templateId>__m<mistakeIndex>`. */
export function clipIdFor(templateId: string, mistakeIndex: number): string {
  return `${templateId}__m${mistakeIndex}`;
}

/** A recorded (non-pending) mistake of a real template, or null. */
function playable(
  templateId: string,
  mistakeIndex: number,
): { spec: ScenarioSpec; titleBg: string; tracePath: string } | null {
  const spec = scenarioById(templateId);
  const mistake = spec?.mistakes[mistakeIndex];
  if (spec === undefined || mistake === undefined || mistake.traceRef.pending === true) return null;
  return { spec, titleBg: mistake.titleBg, tracePath: mistake.traceRef.path };
}

/**
 * Every drill a PAIRING CORRECTION re-points at, with the events whose
 * questions it serves. Derived so a future correction cannot silently land
 * without a clip slot — the failure mode this fold exists to close.
 */
function pairingTargets(): Map<string, { correction: PairingCorrection; events: Set<string> }> {
  const byId = new Map<string, { correction: PairingCorrection; events: Set<string> }>();
  const add = (correction: PairingCorrection, event: string | undefined): void => {
    const id = clipIdFor(correction.templateId, correction.mistakeIndex);
    let slot = byId.get(id);
    if (slot === undefined) byId.set(id, (slot = { correction, events: new Set() }));
    if (event !== undefined) slot.events.add(event);
  };
  for (const [questionId, correction] of Object.entries(QUESTION_SCENARIO_CORRECTION)) {
    add(
      correction,
      Object.hasOwn(QUESTION_EVENT_TYPE, questionId) ? QUESTION_EVENT_TYPE[questionId] : undefined,
    );
  }
  for (const [event, correction] of Object.entries(EVENT_SCENARIO_CORRECTION)) add(correction, event);
  return byId;
}

/**
 * The pilot list: the event index's representatives, plus every pairing
 * correction target, plus the authored remainder — sorted by clip id.
 * Deterministic — same templates + catalog + tables → same list (the index's
 * pinned-pick law carries over).
 */
export function clipPilotList(): ClipPilotEntry[] {
  const byId = new Map<string, ClipPilotEntry>();
  const claim = (
    id: string,
    templateId: string,
    mistakeIndex: number,
    titleBg: string,
    tracePath: string,
    origin: ClipPilotOrigin,
    events: readonly string[],
  ): void => {
    const existing = byId.get(id);
    if (existing) {
      for (const event of events) if (!existing.eventTypes.includes(event)) existing.eventTypes.push(event);
      return;
    }
    byId.set(id, { id, templateId, mistakeIndex, tracePath, titleBg, eventTypes: [...events], origin });
  };

  for (const [event, ref] of whyPanelSimRefIndex()) {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === ref.templateId);
    if (!spec) continue; // structurally impossible — the index built from it
    // The index exposes the picked mistake by its trace path (unique per
    // recorded demo); recover the index for the manifest id.
    const mistakeIndex = spec.mistakes.findIndex((m) => m.traceRef.path === ref.mistake.tracePath);
    if (mistakeIndex < 0) continue;
    claim(
      clipIdFor(ref.templateId, mistakeIndex),
      ref.templateId,
      mistakeIndex,
      ref.mistake.titleBg,
      ref.mistake.tracePath,
      "event-index",
      [event],
    );
  }

  for (const [id, { correction, events }] of pairingTargets()) {
    const found = playable(correction.templateId, correction.mistakeIndex);
    if (found === null) continue; // an unplayable correction already degrades to text-only
    claim(
      id,
      correction.templateId,
      correction.mistakeIndex,
      found.titleBg,
      found.tracePath,
      "pairing",
      [...events].sort(),
    );
  }

  for (const authored of CLIP_PILOT_AUTHORED) {
    const found = playable(authored.templateId, authored.mistakeIndex);
    if (found === null) continue;
    claim(
      clipIdFor(authored.templateId, authored.mistakeIndex),
      authored.templateId,
      authored.mistakeIndex,
      found.titleBg,
      found.tracePath,
      "authored",
      [],
    );
  }

  const list = [...byId.values()];
  for (const entry of list) entry.eventTypes.sort();
  list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return list;
}
