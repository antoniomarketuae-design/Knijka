/**
 * THEO-2 Stage 1 (doc 64) — the why-panel resolver: question id → the side
 * panel's data payload. A PURE BRIDGE over EXISTING content (ADR-002 content
 * law): the payload carries the question's STORED explanationBg + lawRefs
 * verbatim and, when the chain resolves, a reference to an existing scenario
 * drill whose RECORDED mistake demo shows the fault the question tests —
 * never generated text, never paraphrased law.
 *
 * The chain: question id → whyPanelMap.generated.ts (the committed compact
 * artifact of docs/simulation/scenario-engine/scenario-map.json — docs/ is
 * unreadable at runtime) → ev-* scenario event → the rule-catalog codes that
 * grade the event (sim/scenarios scenarioForCode over the sim/rules catalog)
 * → the scenario templates whose mistake demos cite one of those codes
 * (sim/lessons SCENARIO_TEMPLATES). The representative is DETERMINISTIC: a
 * mistake whose codeRefs ALL belong to the event outranks a partial citation,
 * ties break on lowest catalog index (template order, then mistake order) —
 * the picks are pinned in whyPanel.test.ts so they never flap.
 *
 * Questions without a scenario-map event (431 of 1,016) — and events no
 * recorded demo grades yet — yield a payload WITHOUT `sim`: the panel shows
 * text + citations only. Unknown question id → null.
 *
 * THE PAIRING LAYER (whyPanelPairing.ts) sits between that chain and the
 * payload, because an ev-* event is a TOPIC and a question is a MANOEUVRE, and
 * one bucket serves both. `ev-cyclist` covers overtaking a rider, a right hook
 * across a cycleway and a child wobbling; wired to a single template it showed
 * `q-predimstvo-062` — a right-turn-yield question — a car signalling LEFT and
 * overtaking. So before `sim` ships, the question is re-pointed at the drill
 * that depicts ITS manoeuvre where an authored correction says so, and the
 * pairing must then survive the law guard: share an article with the drill's
 * `teach.lawRef`, or be an allow-listed pair with a written reason. Anything
 * else ships WITHOUT `sim` — showing nothing beats showing the wrong manoeuvre,
 * because the stored explanation is already correct and already cited.
 *
 * Sim data crosses the module boundary ONLY through the public barrels
 * (sim/lessons, sim/rules, sim/scenarios — docs/architecture/05).
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import {
  SCENARIO_TEMPLATES,
  mistakeExperienceSeedForEvent,
  scenarioById,
  type ScenarioLevel,
  type ScenarioSpec,
} from "@/modules/sim/lessons";
import { VIOLATIONS } from "@/modules/sim/rules";
import { scenarioForCode } from "@/modules/sim/scenarios";
import { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";
import {
  EVENT_SCENARIO_CORRECTION,
  QUESTION_SCENARIO_CORRECTION,
  pairingVerdict,
} from "./whyPanelPairing";

/** The demonstrated wrong way the panel offers to replay. */
export interface WhyPanelMistakeRef {
  titleBg: string;
  whatWentWrongBg: string;
  /** Repo-relative recorded demo trace (served from /public/traces/…). */
  tracePath: string;
  /** District the drill plays in (content/world/<districtId>.json). */
  districtId: string;
}

/** THEO-3 „Преживей грешката": the founder-wired mistake-experience matching
 *  this card's scenario event (six seed classes today — sim/lessons
 *  MISTAKE_EXPERIENCE_SEEDS). May point at a DIFFERENT mistake of the same or
 *  another template than the replayed demo — it is the class's vetted
 *  experience, not the replay. */
export interface WhyPanelExperienceRef {
  templateId: string;
  mistakeIndex: number;
  /** STORED mistake-demo title (context for the button — ADR-002). */
  titleBg: string;
}

/** "Виж го в симулатора" — the drill that demonstrates this question's fault. */
export interface WhyPanelSimRef {
  templateId: string;
  /** Entry rung — the template's lowest authored level. */
  level: ScenarioLevel;
  titleBg: string;
  mistake: WhyPanelMistakeRef;
  /** Wired mistake-experience for this event; null = not wired. */
  experience: WhyPanelExperienceRef | null;
}

export interface WhyPanelPayload {
  /** STORED explanation text — displayed verbatim (ADR-002). */
  explanationBg: string;
  /** STORED law citations — displayed verbatim (ADR-002). */
  lawRefs: LawRef[];
  /** Absent when no scenario event / no recorded demo covers the question. */
  sim?: WhyPanelSimRef;
}

function entryLevel(spec: ScenarioSpec): ScenarioLevel {
  let min = spec.levels[0].level;
  for (const rung of spec.levels) if (rung.level < min) min = rung.level;
  return min;
}

/**
 * DIRECT event → drill wiring — the EVENT→SCENARIO resolver.
 *
 * The code-match path (codesByEvent, below) keys on the FLAT CODE_TO_SCENARIO
 * (sim/scenarios/mapping.ts): each violation code belongs to exactly ONE
 * event, so many distinct events that grade the SAME code (e.g. every
 * FAILED_TO_YIELD situation — roundabout, left-turn, merge, tram, uncontrolled
 * junction …) collapse onto that code's single owning event and the others get
 * NO codes → NO reel. This table breaks the collapse: an event listed here
 * resolves STRAIGHT to the named template's mistake, bypassing the shared code
 * entirely. Events NOT listed keep the pinned code-match pick (the fallback).
 *
 * Each entry names the mistake (`mistakeIndex` into ScenarioSpec.mistakes) that
 * most directly demonstrates the event's fault. Every trace here is RECORDED
 * (non-pending) and committed under content/traces + platform/public/traces; a
 * template whose target mistake ever goes pending is skipped by the resolver
 * (the pending-trace guard) and degrades to text-only until its trace lands.
 */
const EVENT_TO_SCENARIO: Readonly<
  Record<string, { readonly templateId: string; readonly mistakeIndex: number }>
> = {
  "ev-emergency-stop-triangle": { templateId: "sc-hz-breakdown-pulloff", mistakeIndex: 0 },
  "ev-eco-defensive": { templateId: "sc-jx-priority-confidence", mistakeIndex: 0 },
  // mistakeIndex 1 (не 0): the m0 „Нахлуване без предимство" barges through the
  // mouth BEFORE the priority car reaches it (car 18 m off, past the frame) —
  // m1 „Навлизане без оглеждане" collides with it, so the conflict vehicle is
  // in the fault frame (the R1 gate). doc 72 rule 4.
  "ev-junction-uncontrolled": { templateId: "sc-junction-rhr", mistakeIndex: 1 },
  "ev-merge-giveway": { templateId: "sc-merge-from-property", mistakeIndex: 1 },
  // mistakeIndex 1 (не 0): m0 „Обръщане през плътната линия" faults on the M1
  // marking at the tempting spot while the oncoming stream is still far north —
  // m1 „Обратен завой пред насрещния поток" turns into the stream (the vehicle
  // is in frame). doc 72 rule 4.
  "ev-uturn-reverse": { templateId: "sc-mv-uturn-ban", mistakeIndex: 1 },
  "ev-loss-of-control-recovery": { templateId: "sc-ac-crosswind", mistakeIndex: 1 },
  "ev-left-turn-yield-oncoming": { templateId: "sc-turn-left-oncoming", mistakeIndex: 0 },
  "ev-ped-unmarked-hazard": { templateId: "sc-pe-parked-row-scan", mistakeIndex: 0 },
  // mistakeIndex 1 (не 0): m0 „Провиране покрай велосипедиста" convicts late,
  // once the ghost has already drawn level and passed the rider (behind the
  // chase frame at the fault) — m1 „Бързо изпреварване с късно отместване"
  // faults while the cyclist is still ahead-right, in frame. doc 72 rule 4.
  "ev-cyclist": { templateId: "sc-vu-pass-clearance", mistakeIndex: 1 },
  "ev-oncoming-meeting": { templateId: "sc-ln-obstacle-meeting", mistakeIndex: 0 },
  "ev-parking-maneuver": { templateId: "sc-park-parallel", mistakeIndex: 0 },
  "ev-roundabout": { templateId: "sc-roundabout-entry", mistakeIndex: 0 },
  "ev-traffic-controller": { templateId: "sc-signal-controller", mistakeIndex: 0 },
  "ev-motorway-entry-exit": { templateId: "sc-merge-accel-lane", mistakeIndex: 0 },
  "ev-tram": { templateId: "sc-rx-tram-left", mistakeIndex: 0 },
  "ev-bus-pullout": { templateId: "sc-merge-bus-pullout", mistakeIndex: 0 },
  "ev-zone-regime": { templateId: "sc-pe-zone-living", mistakeIndex: 0 },
  "ev-emergency-braking": { templateId: "sc-hz-brake-dont-swerve", mistakeIndex: 0 },
  "ev-warning-light": { templateId: "sc-vp-telltale-red", mistakeIndex: 0 },
  // The scenario-map event id is ev-police-stop-signal (there is no bare
  // ev-police-stop); sc-vp-police-stop is „Спиране от полицейски сигнал".
  // mistakeIndex 1 (не 0): m0 „Подминаване на сигнала" faults (NOT_KEEPING_RIGHT)
  // only once the ghost has driven ~100 m past the officer — m1 „Паника в
  // лентата" panic-stops SHORT of the officer, who is still in the fault frame
  // (~31 m ahead). The officer renders as a staged pedestrian (runners.ts
  // policeStop), so the R1 „police" row is satisfied by that framed pedestrian
  // (capturePlan.actorSpawned). doc 72 rule 4.
  "ev-police-stop-signal": { templateId: "sc-vp-police-stop", mistakeIndex: 1 },
  // Half-B reel wave (templates-reels.ts) — each has ONE mistake (index 0).
  // ev-accident-own-conduct is a NEW event id (sc-hz-accident-scene, passing
  // SOMEONE ELSE's crash, keeps its own event untouched).
  "ev-sign-warning": { templateId: "sc-sign-warning", mistakeIndex: 0 },
  "ev-driver-distraction": { templateId: "sc-driver-distraction", mistakeIndex: 0 },
  "ev-accident-own-conduct": { templateId: "sc-accident-own-conduct", mistakeIndex: 0 },
  "ev-animal-hazard": { templateId: "sc-animal-hazard", mistakeIndex: 0 },
  "ev-lane-control-signal": { templateId: "sc-lane-control-signal", mistakeIndex: 0 },
  // Coverage batch (2026-07-22): wire the remaining question-events to the
  // reels that already depict them — before this, 60% of behavior questions
  // (350/585) fell back to the 2D canvas because their event was unwired and
  // the code-match fallback landed on an unrelated (often clip-less) scenario.
  // Each pairing is the reel that shows that event's mistake.
  "ev-following-distance": { templateId: "sc-follow-distance", mistakeIndex: 0 },
  "ev-overtake": { templateId: "sc-ov-ban-overtake", mistakeIndex: 0 },
  "ev-illegal-stop-zone": { templateId: "sc-pk-ban-stop", mistakeIndex: 0 },
  "ev-lights-usage": { templateId: "sc-ac-night-lights", mistakeIndex: 0 },
  "ev-speed-for-conditions": { templateId: "sc-speed-rain", mistakeIndex: 0 },
  "ev-speed-limit": { templateId: "sc-speed-creep", mistakeIndex: 0 },
  "ev-junction-signalized": { templateId: "sc-junction-stop", mistakeIndex: 0 },
  "ev-junction-priority-sign": { templateId: "sc-jx-priority-confidence", mistakeIndex: 0 },
  "ev-ped-crossing-marked": { templateId: "sc-zebra-approach", mistakeIndex: 0 },
  "ev-lane-change": { templateId: "sc-mw-discipline", mistakeIndex: 0 },
  "ev-lane-discipline": { templateId: "sc-mw-discipline", mistakeIndex: 0 },
  "ev-markings-response": { templateId: "sc-ov-solid-line", mistakeIndex: 0 },
  "ev-adverse-weather": { templateId: "sc-ac-rain-lights", mistakeIndex: 0 },
  "ev-railway-crossing": { templateId: "sc-rx-unguarded", mistakeIndex: 0 },
  "ev-emergency-vehicle": { templateId: "sc-vu-emergency", mistakeIndex: 0 },
  "ev-stop-sign": { templateId: "sc-junction-stop", mistakeIndex: 0 },
  "ev-sign-prohibitory": { templateId: "sc-pk-ban-stop", mistakeIndex: 0 },
  "ev-accident-scene-conduct": { templateId: "sc-accident-own-conduct", mistakeIndex: 0 },
  // Small remainder events — nearest reel that carries the lesson.
  "ev-signaling-discipline": { templateId: "sc-turn-left-oncoming", mistakeIndex: 0 },
  "ev-seatbelt": { templateId: "sc-vp-readiness", mistakeIndex: 0 },
  "ev-collision": { templateId: "sc-hz-brake-dont-swerve", mistakeIndex: 0 },
  // ev-roundabout stays → sc-roundabout-entry (template exists; its reel is
  // rendered separately and added to the manifest).
};

/** Reused empty code set for directly-wired events with no rule codes. */
const NO_CODES: ReadonlySet<string> = new Set();

/** ev-* event → the catalog codes the rule engine grades it with. */
function codesByEvent(): Map<string, Set<string>> {
  const byEvent = new Map<string, Set<string>>();
  for (const code of Object.keys(VIOLATIONS)) {
    const event = scenarioForCode(code);
    if (event === null) continue;
    let codes = byEvent.get(event);
    if (!codes) byEvent.set(event, (codes = new Set()));
    codes.add(code);
  }
  return byEvent;
}

/**
 * The pinned code-match pick for an event's codes: a mistake whose codeRefs ALL
 * belong to the event outranks a partial citation, ties break on lowest catalog
 * index (template order, then mistake order). Null when no non-pending demo
 * cites any of the event's codes.
 */
function codeMatchPick(
  codes: ReadonlySet<string>,
): { spec: ScenarioSpec; mistakeIndex: number } | null {
  let best: { exact: boolean; spec: ScenarioSpec; mistakeIndex: number } | null = null;
  for (const spec of SCENARIO_TEMPLATES) {
    for (let mi = 0; mi < spec.mistakes.length; mi++) {
      const mistake = spec.mistakes[mi];
      // A pending trace has no file to replay — never representative.
      if (mistake.traceRef.pending === true) continue;
      const cited = mistake.codeRefs.filter((code) => codes.has(code));
      if (cited.length === 0) continue;
      const exact = cited.length === mistake.codeRefs.length;
      // Scan order IS catalog order: within a rank the first hit stays;
      // only the exact-match rank upgrade replaces a partial one.
      if (best === null || (exact && !best.exact)) {
        best = { exact, spec, mistakeIndex: mi };
      }
    }
  }
  return best === null ? null : { spec: best.spec, mistakeIndex: best.mistakeIndex };
}

/**
 * The DIRECT pick for a wired event: the named template's chosen mistake,
 * bypassing the shared code. Null when the template is missing or its target
 * mistake has no recorded (non-pending) trace — the pending-trace skip, so a
 * not-yet-recorded demo degrades the event to text-only rather than pointing at
 * an absent replay.
 */
function directPick(event: string): { spec: ScenarioSpec; mistakeIndex: number } | null {
  const wired = Object.hasOwn(EVENT_TO_SCENARIO, event) ? EVENT_TO_SCENARIO[event] : undefined;
  if (wired === undefined) return null;
  const spec = scenarioById(wired.templateId);
  const mistake = spec?.mistakes[wired.mistakeIndex];
  if (spec === undefined || mistake === undefined || mistake.traceRef.pending === true) return null;
  return { spec, mistakeIndex: wired.mistakeIndex };
}

/**
 * ev-* event → the representative drill reference. A directly-wired event
 * (EVENT_TO_SCENARIO) resolves straight to its named mistake; every other event
 * keeps the pinned code-match order (exact code match first, then lowest catalog
 * index). Built once per process — SCENARIO_TEMPLATES and the catalog are static.
 */
function buildSimRefIndex(): ReadonlyMap<string, WhyPanelSimRef> {
  const index = new Map<string, WhyPanelSimRef>();
  const byEvent = codesByEvent();
  // Resolve every event that either grades rule codes OR is directly wired.
  const events = new Set<string>([...byEvent.keys(), ...Object.keys(EVENT_TO_SCENARIO)]);
  for (const event of events) {
    const codes = byEvent.get(event) ?? NO_CODES;
    // DIRECT wiring wins over the shared code; else the pinned code-match pick.
    const best = directPick(event) ?? codeMatchPick(codes);
    if (best === null) continue;
    index.set(event, makeSimRef(best.spec, best.mistakeIndex, codes));
  }
  return index;
}

/**
 * Freeze one drill reference. Shared by the event index and the pairing
 * corrections (whyPanelPairing.ts) so a corrected question gets a payload
 * indistinguishable from a natively-wired one.
 *
 * THEO-3: `codes` are the EVENT's rule codes — the „Преживей грешката" seed is
 * a property of the fault class, not of the template that demonstrates it, so a
 * correction keeps whatever experience the event had (events with no codes have
 * no founder class, hence null).
 */
function makeSimRef(
  spec: ScenarioSpec,
  mistakeIndex: number,
  codes: ReadonlySet<string>,
): WhyPanelSimRef {
  const mistake = spec.mistakes[mistakeIndex];
  const seed = mistakeExperienceSeedForEvent(codes);
  return Object.freeze<WhyPanelSimRef>({
    templateId: spec.id,
    level: entryLevel(spec),
    titleBg: spec.titleBg,
    mistake: Object.freeze<WhyPanelMistakeRef>({
      titleBg: mistake.titleBg,
      whatWentWrongBg: mistake.whatWentWrongBg,
      tracePath: mistake.traceRef.path,
      districtId: spec.map.districtId,
    }),
    experience:
      seed === null
        ? null
        : Object.freeze<WhyPanelExperienceRef>({
            templateId: seed.templateId,
            mistakeIndex: seed.mistakeIndex,
            titleBg: seed.titleBg,
          }),
  });
}

let simRefIndexCache: ReadonlyMap<string, WhyPanelSimRef> | null = null;

function simRefIndex(): ReadonlyMap<string, WhyPanelSimRef> {
  simRefIndexCache ??= buildSimRefIndex();
  return simRefIndexCache;
}

let codesByEventCache: Map<string, Set<string>> | null = null;

function eventCodes(event: string): ReadonlySet<string> {
  codesByEventCache ??= codesByEvent();
  return codesByEventCache.get(event) ?? NO_CODES;
}

const correctionRefCache = new Map<string, WhyPanelSimRef | null>();

/**
 * The drill a pairing CORRECTION names (whyPanelPairing.ts), built exactly like
 * an event-index entry. Null when the named template or mistake is missing, or
 * its trace is still pending — an authored correction that cannot resolve
 * degrades to text-only and NEVER falls back to the pick it was written to
 * replace, because that pick is the wrong manoeuvre.
 */
function correctedSimRef(
  event: string,
  correction: { templateId: string; mistakeIndex: number },
): WhyPanelSimRef | null {
  const key = `${event}|${correction.templateId}|${correction.mistakeIndex}`;
  const cached = correctionRefCache.get(key);
  if (cached !== undefined) return cached;
  const spec = scenarioById(correction.templateId);
  const mistake = spec?.mistakes[correction.mistakeIndex];
  const ref =
    spec === undefined || mistake === undefined || mistake.traceRef.pending === true
      ? null
      : makeSimRef(spec, correction.mistakeIndex, eventCodes(event));
  correctionRefCache.set(key, ref);
  return ref;
}

/**
 * MODULE-INTERNAL (whyPanelPairing.test.ts): the drill a question would be
 * offered BEFORE the law guard runs — i.e. the correction layer's output, or
 * the event index's pick. The guard test needs this to prove that a suspect
 * pairing is the reason a question has no clip (rather than a missing demo).
 */
export function whyPanelCandidateSimRef(questionId: string): WhyPanelSimRef | null {
  const eventType = Object.hasOwn(QUESTION_EVENT_TYPE, questionId)
    ? QUESTION_EVENT_TYPE[questionId]
    : undefined;
  if (eventType === undefined) return null;
  const correction = Object.hasOwn(QUESTION_SCENARIO_CORRECTION, questionId)
    ? QUESTION_SCENARIO_CORRECTION[questionId]
    : Object.hasOwn(EVENT_SCENARIO_CORRECTION, eventType)
      ? EVENT_SCENARIO_CORRECTION[eventType]
      : undefined;
  if (correction !== undefined) return correctedSimRef(eventType, correction);
  return simRefIndex().get(eventType) ?? null;
}

/**
 * MODULE-INTERNAL (clipPilot.ts): the full ev-* event → representative-drill
 * index the resolver serves per question. The clip-capture pilot list derives
 * from THIS map so every recorded clip lands on the exact demo the why-panel
 * would replay — never a hand-picked set. Needs no content repo (built from
 * the static templates + catalog only). Not re-exported by the barrel.
 */
export function whyPanelSimRefIndex(): ReadonlyMap<string, WhyPanelSimRef> {
  return simRefIndex();
}

/**
 * Resolve the why-panel payload for a question. Pure lookup — no persistence,
 * no I/O; requires the content repo (import '@/lib/content/loader' server-side
 * first, like every learning entry point). Null for an unknown question id.
 */
export function resolveWhyPanel(questionId: string): WhyPanelPayload | null {
  const question = getContentRepo().questionById(questionId);
  if (!question) return null;

  const payload: WhyPanelPayload = {
    explanationBg: question.explanationBg,
    lawRefs: [...question.lawRefs],
  };

  const eventType = Object.hasOwn(QUESTION_EVENT_TYPE, questionId)
    ? QUESTION_EVENT_TYPE[questionId]
    : undefined;
  const candidate = whyPanelCandidateSimRef(questionId);
  if (eventType === undefined || candidate === null) return payload;

  // THE PAIRING GUARD (whyPanelPairing.ts). A drill whose STORED teach.lawRef
  // shares no article with the question's STORED lawRefs argues from a
  // different rule than the question — the q-predimstvo-062 defect, where a
  // right-turn-across-a-cycle-lane question (чл. 25/35/5) was illustrated by an
  // overtake (чл. 42). Unless a reviewer allow-listed the pair with a reason,
  // the payload ships WITHOUT `sim`: the stored explanation + citations, which
  // are already correct, instead of a clip of the wrong manoeuvre.
  const spec = scenarioById(candidate.templateId);
  if (spec === undefined) return payload;
  const check = pairingVerdict({
    questionId,
    event: eventType,
    templateId: candidate.templateId,
    questionLawRefs: question.lawRefs,
    scenarioLawRef: spec.teach.lawRef,
  });
  if (check.verdict === "suspect") return payload;

  payload.sim = candidate;
  return payload;
}
