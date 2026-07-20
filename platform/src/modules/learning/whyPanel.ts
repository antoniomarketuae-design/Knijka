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
 * Sim data crosses the module boundary ONLY through the public barrels
 * (sim/lessons, sim/rules, sim/scenarios — docs/architecture/05).
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import {
  SCENARIO_TEMPLATES,
  mistakeExperienceSeedForEvent,
  type ScenarioLevel,
  type ScenarioSpec,
} from "@/modules/sim/lessons";
import { VIOLATIONS } from "@/modules/sim/rules";
import { scenarioForCode } from "@/modules/sim/scenarios";
import { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";

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
 * ev-* event → the representative drill reference, chosen by the pinned
 * deterministic order (exact code match first, then lowest catalog index).
 * Built once per process — SCENARIO_TEMPLATES and the catalog are static.
 */
function buildSimRefIndex(): ReadonlyMap<string, WhyPanelSimRef> {
  const index = new Map<string, WhyPanelSimRef>();
  for (const [event, codes] of codesByEvent()) {
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
    if (best === null) continue;
    const mistake = best.spec.mistakes[best.mistakeIndex];
    // THEO-3: the wired „Преживей грешката" seed for this event's codes —
    // resolved from the founder seed list (sim/lessons), stored refs only.
    const seed = mistakeExperienceSeedForEvent(codes);
    index.set(
      event,
      Object.freeze<WhyPanelSimRef>({
        templateId: best.spec.id,
        level: entryLevel(best.spec),
        titleBg: best.spec.titleBg,
        mistake: Object.freeze<WhyPanelMistakeRef>({
          titleBg: mistake.titleBg,
          whatWentWrongBg: mistake.whatWentWrongBg,
          tracePath: mistake.traceRef.path,
          districtId: best.spec.map.districtId,
        }),
        experience:
          seed === null
            ? null
            : Object.freeze<WhyPanelExperienceRef>({
                templateId: seed.templateId,
                mistakeIndex: seed.mistakeIndex,
                titleBg: seed.titleBg,
              }),
      }),
    );
  }
  return index;
}

let simRefIndexCache: ReadonlyMap<string, WhyPanelSimRef> | null = null;

function simRefIndex(): ReadonlyMap<string, WhyPanelSimRef> {
  simRefIndexCache ??= buildSimRefIndex();
  return simRefIndexCache;
}

/**
 * Resolve the why-panel payload for a question. Pure lookup — no persistence,
 * no I/O; requires the content repo (import '@/lib/content/loader' server-side
 * first, like every learning entry point). Null for an unknown question id.
 */
export function resolveWhyPanel(questionId: string): WhyPanelPayload | null {
  const question = getContentRepo().questionById(questionId);
  if (!question) return null;

  const eventType = Object.hasOwn(QUESTION_EVENT_TYPE, questionId)
    ? QUESTION_EVENT_TYPE[questionId]
    : undefined;
  const sim = eventType === undefined ? undefined : simRefIndex().get(eventType);

  const payload: WhyPanelPayload = {
    explanationBg: question.explanationBg,
    lawRefs: [...question.lawRefs],
  };
  if (sim !== undefined) payload.sim = sim;
  return payload;
}
