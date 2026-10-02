/**
 * THEO-4 pairing guard — the test that makes "the visual teaches a different
 * manoeuvre" fail a build instead of waiting for the founder to catch it by eye.
 *
 * The defect it was written from: `q-predimstvo-062` („Каниш се да завиеш
 * надясно… по обозначена велолента… Кой преминава пръв?" — ЗДвП чл. 25, ал. 2 ·
 * чл. 35, ал. 2 · чл. 5, ал. 2, т. 1) was illustrated by „Бързо изпреварване с
 * късно отместване": a car signalling LEFT and overtaking, cited to чл. 42. The
 * question has no media and no sim of its own, so the panel had picked that
 * clip by TOPIC fallback — meaning the same fallback was wrong for every other
 * right-hook question too.
 *
 * Battery:
 *  1. The founder regression, pinned: the right-hook set resolves to the
 *     right-hook drill, and explicitly not to the overtake.
 *  2. The GUARD ITSELF: every drill the resolver ships must share a law article
 *     with the question it illustrates, or be an allow-listed pair with a
 *     written reason. A new event wiring, a re-authored teach.lawRef or a new
 *     question with different citations fails here, by name.
 *  3. The canary: the ORIGINAL defective pairing is proven "suspect" by the
 *     guard, so the mechanism — not just the hand-written correction — is what
 *     stops it.
 *  4. Table hygiene: no stale allow-list keys, no stale corrections, reasons
 *     actually written, denied pairs not quietly re-allowed, and MISSING_DRILLS
 *     still describing questions that really are text-only.
 *  5. Citation-normalization units (ranges, ordinances, multi-act strings).
 *
 * The 2026-08-03 additions are all one story. A citation wave re-cited 175 bank
 * rows against verbatim law, which moved 27 verdicts under a guard nobody had
 * re-run. Almost all of them moved between the two SERVED verdicts and changed
 * nothing a student sees — but four questions stopped being about the drill's
 * manoeuvre, and the numbers pinned below are what makes that visible instead
 * of silent. A citation is not cosmetic: it is what this guard reasons with.
 *
 * Runs against the REAL /content repo and the real scenario templates.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { scenarioById } from "@/modules/sim/lessons";
import { resolveWhyPanel, whyPanelCandidateSimRef } from "./whyPanel";
import { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";
import {
  EVENT_SCENARIO_CORRECTION,
  LAWREF_MISMATCH_ALLOW,
  MISSING_DRILLS,
  PAIRINGS_DELIBERATELY_DENIED,
  QUESTION_CLIP_WITHHELD,
  QUESTION_SCENARIO_CORRECTION,
  pairKey,
  pairingVerdict,
  questionArticleKeys,
  scenarioArticleKeys,
} from "./whyPanelPairing";

/** The five bank questions sc-vu-bikelane-turn was authored against. */
/** content/world — the committed maps (this file is platform/src/modules/clips/…). */
const WORLD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../content/world");

const RIGHT_HOOK_QUESTIONS = [
  "q-predimstvo-062",
  "q-uyazvimi-011",
  "q-uyazvimi-034",
  "q-uyazvimi-063",
  "q-krastovishta-031",
] as const;

/**
 * The ЗАОБИКАЛЯНЕ set — going ROUND a stopped car, on its right (ЗДвП чл. 43б,
 * new in ДВ бр. 64 от 2025 г.; § 6, т. 80 ДР defines it as passing „неподвижен
 * участник в движението"). The 2026-08-03 citation wave moved these three off
 * чл. 42, which is what exposed that the В24 overtake drill argues from another
 * rule AND teaches the opposite answer („изчакай" vs „може, отдясно").
 */
const GOING_ROUND_QUESTIONS = ["q-krastovishta-051", "q-manevri-024", "q-manevri-060"] as const;

describe("the right-hook regression (the founder's q-predimstvo-062)", () => {
  it("q-predimstvo-062 is illustrated by the right turn across the cycle lane, not by an overtake", () => {
    const sim = resolveWhyPanel("q-predimstvo-062")?.sim;
    expect(sim?.templateId).toBe("sc-vu-bikelane-turn");
    expect(sim?.titleBg).toBe("Десен завой през велоалея");
    expect(sim?.mistake.titleBg).toBe("Отрязване на колелото по алеята");
    expect(sim?.mistake.tracePath).toBe(
      "content/traces/sc-vu-bikelane-turn/mistake-cut-path.trace.json",
    );
    expect(sim?.mistake.districtId).toBe("vu-bikelane-v1");
  });

  it("…and never again by sc-vu-pass-clearance / „Бързо изпреварване с късно отместване“", () => {
    const sim = resolveWhyPanel("q-predimstvo-062")?.sim;
    expect(sim?.templateId).not.toBe("sc-vu-pass-clearance");
    expect(sim?.mistake.titleBg).not.toContain("изпреварване");
    expect(sim?.titleBg).not.toContain("Изпреварване");
  });

  it("every right-hook question in the bank gets the right-hook drill", () => {
    for (const id of RIGHT_HOOK_QUESTIONS) {
      expect(resolveWhyPanel(id)?.sim?.templateId, id).toBe("sc-vu-bikelane-turn");
    }
  });

  it("the rest of ev-cyclist keeps the pass-clearance drill (the correction is surgical)", () => {
    // These ARE overtaking questions — the clip that was wrong for the right
    // hook is exactly right for them, and must not have been collateral damage.
    for (const id of ["q-manevri-040", "q-uyazvimi-010", "q-uyazvimi-051", "q-eco-009"]) {
      expect(resolveWhyPanel(id)?.sim?.templateId, id).toBe("sc-vu-pass-clearance");
    }
  });
});

describe("the guard: no question is shown a drill that argues from another law", () => {
  it("every SHIPPED pairing is either law-matched or allow-listed with a reason", () => {
    const repo = getContentRepo();
    const offenders: string[] = [];
    for (const [questionId, event] of Object.entries(QUESTION_EVENT_TYPE)) {
      const sim = resolveWhyPanel(questionId)?.sim;
      if (sim === undefined) continue;
      const question = repo.questionById(questionId)!;
      const spec = scenarioById(sim.templateId)!;
      const check = pairingVerdict({
        questionId,
        event,
        templateId: sim.templateId,
        questionLawRefs: question.lawRefs,
        scenarioLawRef: spec.teach.lawRef,
      });
      if (check.verdict === "suspect") {
        offenders.push(
          `${questionId} [${question.lawRefs.map((r) => `${r.act} ${r.ref}`).join(" · ") || "no lawRefs"}] ` +
            `is illustrated by ${sim.templateId} „${sim.mistake.titleBg}“ [${spec.teach.lawRef}] — ` +
            `no shared article and no LAWREF_MISMATCH_ALLOW["${check.key}"] entry. ` +
            `Either the clip depicts a different manoeuvre (correct the pairing) or it does not (allow-list it, with the reason).`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the questions the guard refuses still get their stored explanation + citations", () => {
    // "Showing nothing is better than showing the wrong thing" only holds
    // because the text fallback is real: prove it is.
    let refused = 0;
    for (const questionId of Object.keys(QUESTION_EVENT_TYPE)) {
      const payload = resolveWhyPanel(questionId)!;
      if (payload.sim !== undefined) continue;
      // A candidate existed and the guard withheld it (not "no drill at all").
      if (whyPanelCandidateSimRef(questionId) === null) continue;
      refused++;
      expect(payload.explanationBg.length, questionId).toBeGreaterThan(0);
      expect(payload.lawRefs.length + payload.explanationBg.length, questionId).toBeGreaterThan(0);
    }
    // The questions of the deliberately-denied pairings, plus the questions a
    // SCOPED allowance leaves out. 58 → 53 on 2026-07-28: five Б1
    // secondary-road questions left
    // ev-junction-priority-sign→sc-jx-priority-confidence for the drill that
    // puts the student in their seat (sc-jx-giveway-b1). That pairing is
    // REDUCED, not lifted — its priority-road half is still refused.
    //
    // 53 → 57 on 2026-08-03, all four from the citation wave (see
    // MISSING_DRILLS): q-signs-054 (Т13, ЗДвП чл. 50, ал. 2) and the three
    // заобикаляне questions the scoped ev-overtake allowance now excludes.
    //
    // 57 → 63 on 2026-08-05: six markings questions
    // (q-signali-i-markirovka-013, -014, -018, -030, -053, -058) that used to
    // law-match sc-ov-solid-line on „ППЗДвП чл. 63". Nothing was found wrong
    // with those pairings — the question bank's citation pin dropped the
    // article number from every ref naming an act content/law does not hold,
    // and ППЗДвП is one, so the shared key is gone. See the long note on the
    // same count in whyPanel.test.ts: ingesting ППЗДвП restores all six.
    //
    // 63 → 64 on 2026-10-02 (founder ruling «KEEP-RIGHT FOLLOWS THE LAW»):
    // q-manevri-032, the TOWN lane-choice question, no longer gets the
    // motorway keep-right mistake. It is not refused by the citation guard —
    // both sides cite чл. 15 — but by QUESTION_CLIP_WITHHELD, a reviewer's
    // veto for a duty and its exemption sharing one article.
    expect(refused).toBe(64);
  });

  it("CANARY: the original defective pairing is caught by the guard, not just by the correction", () => {
    // Had nobody written the q-predimstvo-062 correction, this is the verdict
    // the resolver would have reached — no clip, rather than the overtake.
    // It stays "suspect" because ev-cyclist→sc-vu-pass-clearance carries NO
    // allowance at all: the scoped one that used to excuse q-eco-009 was
    // deleted on 2026-08-03 once that question's corrected citations
    // (ЗДвП чл. 42, ал. 2, т. 1) law-matched the drill on their own. A BLANKET
    // entry on this pair would put the guard back to sleep — see the
    // deleted-entry note in whyPanelPairing.ts.
    const question = getContentRepo().questionById("q-predimstvo-062")!;
    const overtake = scenarioById("sc-vu-pass-clearance")!;
    const check = pairingVerdict({
      questionId: "q-predimstvo-062",
      event: "ev-cyclist",
      templateId: overtake.id,
      questionLawRefs: question.lawRefs,
      scenarioLawRef: overtake.teach.lawRef,
    });
    expect(check.shared).toEqual([]);
    expect(check.verdict).toBe("suspect");
  });

  it("a scoped allowance excuses only the question it names", () => {
    // ev-overtake→sc-ov-ban-overtake is the live scoped entry (it took over
    // from ev-cyclist→sc-vu-pass-clearance on 2026-08-03). The drill is an
    // ИЗПРЕВАРВАНЕ demo under a В24 ban; the three questions below are
    // ЗАОБИКАЛЯНЕ (ЗДвП чл. 43б), which the scope must not reach.
    const repo = getContentRepo();
    const banDrill = scenarioById("sc-ov-ban-overtake")!;
    const verdictFor = (questionId: string) =>
      pairingVerdict({
        questionId,
        event: "ev-overtake",
        templateId: banDrill.id,
        questionLawRefs: repo.questionById(questionId)!.lawRefs,
        scenarioLawRef: banDrill.teach.lawRef,
      }).verdict;
    expect(verdictFor("q-signs-032")).toBe("allow-listed");
    for (const id of GOING_ROUND_QUESTIONS) expect(verdictFor(id), id).toBe("suspect");
  });

  it("the заобикаляне questions get no clip at all, and keep their text", () => {
    // The student-visible half of the scoping: not merely "not allow-listed"
    // but actually served without a sim, with the stored explanation intact
    // (THEO-4 — a withheld clip must never leave a bare verdict behind).
    for (const id of GOING_ROUND_QUESTIONS) {
      const payload = resolveWhyPanel(id)!;
      expect(payload.sim, id).toBeUndefined();
      expect(payload.explanationBg.length, id).toBeGreaterThan(0);
      expect(payload.lawRefs.length, id).toBeGreaterThan(0);
      // …and the candidate the guard withheld really was the В24 overtake
      // drill, so this is the guard's doing and not a missing demo.
      expect(whyPanelCandidateSimRef(id)?.templateId, id).toBe("sc-ov-ban-overtake");
    }
  });

  it("q-signs-054 (табела Т13) is withheld rather than shown the straight-priority-road drill", () => {
    // ЗДвП чл. 50, ал. 2: where the priority road CHANGES DIRECTION the drivers
    // on it „се ръководят помежду си от правилата на чл. 48". The candidate
    // drill teaches the opposite instinct on a road that runs straight.
    const payload = resolveWhyPanel("q-signs-054")!;
    expect(payload.sim).toBeUndefined();
    expect(payload.explanationBg.length).toBeGreaterThan(0);
    expect(whyPanelCandidateSimRef("q-signs-054")?.templateId).toBe("sc-jx-priority-confidence");
  });
});

describe("the town lane-choice question never gets the keep-right mistake (founder ruling 2026-10-01)", () => {
  const LANE_DISCIPLINE = Object.entries(QUESTION_EVENT_TYPE)
    .filter(([, event]) => event === "ev-lane-discipline")
    .map(([id]) => id);

  it("q-manevri-032 („в населено място по булевард с две ленти… Задължен ли си… само в дясната?“) ships text + citations, no clip", () => {
    const payload = resolveWhyPanel("q-manevri-032")!;
    expect(payload.sim).toBeUndefined();
    expect(payload.explanationBg).toContain("най-удобната лента");
    expect(payload.lawRefs.map((r) => `${r.act} ${r.ref}`)).toEqual(["ЗДвП чл. 15"]);
    // …and it is the veto that withheld it: the pick it would otherwise get is
    // the motorway keep-right mistake, which the citation guard lets through.
    const candidate = whyPanelCandidateSimRef("q-manevri-032")!;
    expect(candidate.templateId).toBe("sc-mw-discipline");
    expect(candidate.mistake.titleBg).toBe("Висене в лявата лента при 130");
    expect(candidate.mistake.districtId).toBe("mw-v1");
    const drill = scenarioById("sc-mw-discipline")!;
    expect(
      pairingVerdict({
        questionId: "q-manevri-032",
        event: "ev-lane-discipline",
        templateId: drill.id,
        questionLawRefs: getContentRepo().questionById("q-manevri-032")!.lawRefs,
        scenarioLawRef: drill.teach.lawRef,
      }).verdict,
    ).toBe("law-match");
  });

  it("the veto is surgical: the other eight lane-discipline questions — motorway, out of town, the two-way road — keep the motorway drill", () => {
    expect(LANE_DISCIPLINE).toHaveLength(9);
    for (const id of LANE_DISCIPLINE) {
      if (id === "q-manevri-032") continue;
      expect(resolveWhyPanel(id)?.sim?.templateId, id).toBe("sc-mw-discipline");
    }
  });

  it("no served question whose STEM puts it in a settlement, and which cites чл. 15, is illustrated on a road where ал. 1 binds", () => {
    // The class, not the one id: чл. 15 holds the duty (ал. 1) and its town
    // exemption (ал. 2, т. 2), so «shares an article» cannot tell a town
    // lane-choice question from a motorway keep-right drill. Where ал. 1 binds
    // is measured on the drill's own committed map: a bank of two or more lanes
    // one way that is a motorway or is posted above 80.
    const repo = getContentRepo();
    const bindsCache = new Map<string, boolean>();
    const binds = (districtId: string): boolean => {
      const hit = bindsCache.get(districtId);
      if (hit !== undefined) return hit;
      const doc = JSON.parse(readFileSync(path.join(WORLD_DIR, `${districtId}.json`), "utf-8")) as {
        roads: { edges: { lanes: number; oneway: boolean; maxspeed: number; motorway?: boolean }[] };
      };
      const out = doc.roads.edges.some(
        (e) => (e.oneway ? e.lanes : Math.floor(e.lanes / 2)) >= 2 && (e.motorway === true || e.maxspeed > 80),
      );
      bindsCache.set(districtId, out);
      return out;
    };
    const TOWN_SCENE = /населен\p{L}*\s+м[яе]ст|(?<!\p{L})в\s+града|градск|булевард/iu;
    const NOT_TOWN = /извън\s+населен|извънградск|магистрал/iu;
    const offenders: string[] = [];
    let served15 = 0;
    for (const questionId of Object.keys(QUESTION_EVENT_TYPE)) {
      const question = repo.questionById(questionId)!;
      if (!question.lawRefs.some((r) => /чл\. ?15(?!\d)/u.test(r.ref))) continue;
      const sim = resolveWhyPanel(questionId)?.sim;
      if (sim === undefined) continue;
      served15++;
      if (TOWN_SCENE.test(question.textBg) && !NOT_TOWN.test(question.textBg) && binds(sim.mistake.districtId)) {
        offenders.push(`${questionId} („${question.textBg}“) → ${sim.templateId} on ${sim.mistake.districtId}`);
      }
    }
    expect(offenders).toEqual([]);
    // Not vacuous: questions citing чл. 15 ARE served, and the motorway map binds.
    expect(served15).toBeGreaterThan(5);
    expect(binds("mw-v1")).toBe(true);
    expect(binds("wb-boulevard-v1")).toBe(false);
  });

  it("every withheld entry is real, reasoned, and its fitting drill is a recorded demo that still cannot be served", () => {
    const repo = getContentRepo();
    expect(Object.keys(QUESTION_CLIP_WITHHELD)).toEqual(["q-manevri-032"]);
    for (const [questionId, entry] of Object.entries(QUESTION_CLIP_WITHHELD)) {
      const question = repo.questionById(questionId);
      expect(question, questionId).toBeDefined();
      expect(Object.hasOwn(QUESTION_EVENT_TYPE, questionId), questionId).toBe(true);
      // A veto and a correction on the same question would be two answers.
      expect(Object.hasOwn(QUESTION_SCENARIO_CORRECTION, questionId), questionId).toBe(false);
      expect(entry.reason.trim().length, questionId).toBeGreaterThan(120);
      // The veto still has something to veto.
      expect(whyPanelCandidateSimRef(questionId), questionId).not.toBeNull();
      if (entry.fittingDrill === null) continue;
      const spec = scenarioById(entry.fittingDrill.templateId);
      const mistake = spec?.mistakes[entry.fittingDrill.mistakeIndex];
      expect(mistake, questionId).toBeDefined();
      expect(mistake!.traceRef.pending, questionId).not.toBe(true);
      expect(entry.fittingDrill.blockedBy.trim().length, questionId).toBeGreaterThan(80);
      // The day this is „law-match“, make it a QUESTION_SCENARIO_CORRECTION and delete the veto.
      expect(
        pairingVerdict({
          questionId,
          event: QUESTION_EVENT_TYPE[questionId],
          templateId: spec!.id,
          questionLawRefs: question!.lawRefs,
          scenarioLawRef: spec!.teach.lawRef,
        }).verdict,
        `${questionId}: the fitting drill law-matches now — convert the veto into a correction`,
      ).toBe("suspect");
    }
    const fit = QUESTION_CLIP_WITHHELD["q-manevri-032"].fittingDrill!;
    expect(scenarioById(fit.templateId)!.mistakes[fit.mistakeIndex].titleBg).toBe("Лутане между лентите без мигач");
    expect(scenarioById(fit.templateId)!.map.districtId).toBe("wb-boulevard-v1");
  });
});

describe("table hygiene", () => {
  it("every correction names a real question / event and a playable demo", () => {
    const repo = getContentRepo();
    for (const [questionId, correction] of Object.entries(QUESTION_SCENARIO_CORRECTION)) {
      expect(repo.questionById(questionId), questionId).toBeDefined();
      expect(Object.hasOwn(QUESTION_EVENT_TYPE, questionId), questionId).toBe(true);
      const spec = scenarioById(correction.templateId);
      expect(spec, `${questionId} → ${correction.templateId}`).toBeDefined();
      const mistake = spec!.mistakes[correction.mistakeIndex];
      expect(mistake, `${questionId} → mistake ${correction.mistakeIndex}`).toBeDefined();
      expect(mistake.traceRef.pending, questionId).not.toBe(true);
      expect(correction.reason.length, questionId).toBeGreaterThan(40);
    }
    const events = new Set(Object.values(QUESTION_EVENT_TYPE));
    for (const [event, correction] of Object.entries(EVENT_SCENARIO_CORRECTION)) {
      expect(events.has(event), event).toBe(true);
      const spec = scenarioById(correction.templateId);
      expect(spec, `${event} → ${correction.templateId}`).toBeDefined();
      const mistake = spec!.mistakes[correction.mistakeIndex];
      expect(mistake, `${event} → mistake ${correction.mistakeIndex}`).toBeDefined();
      expect(mistake.traceRef.pending, event).not.toBe(true);
      expect(correction.reason.length, event).toBeGreaterThan(40);
    }
  });

  it("a correction never needs the allow-list: it must law-match the questions it serves", () => {
    // A correction that had to be excused by the allow-list would be a guess,
    // not a correction.
    const repo = getContentRepo();
    for (const questionId of Object.keys(QUESTION_SCENARIO_CORRECTION)) {
      const question = repo.questionById(questionId)!;
      const spec = scenarioById(QUESTION_SCENARIO_CORRECTION[questionId].templateId)!;
      const check = pairingVerdict({
        questionId,
        event: QUESTION_EVENT_TYPE[questionId],
        templateId: spec.id,
        questionLawRefs: question.lawRefs,
        scenarioLawRef: spec.teach.lawRef,
      });
      expect(check.verdict, `${questionId}: ${check.shared.join(", ")}`).toBe("law-match");
    }
  });

  it("no stale allow-list entries — every key is exercised by a real pairing", () => {
    const repo = getContentRepo();
    const used = new Set<string>();
    for (const [questionId, event] of Object.entries(QUESTION_EVENT_TYPE)) {
      const sim = resolveWhyPanel(questionId)?.sim;
      if (sim === undefined) continue;
      const spec = scenarioById(sim.templateId)!;
      const check = pairingVerdict({
        questionId,
        event,
        templateId: sim.templateId,
        questionLawRefs: repo.questionById(questionId)!.lawRefs,
        scenarioLawRef: spec.teach.lawRef,
      });
      if (check.verdict === "allow-listed") used.add(check.key);
    }
    const stale = Object.keys(LAWREF_MISMATCH_ALLOW).filter((key) => !used.has(key));
    expect(stale, `remove these — nothing needs excusing any more:\n${stale.join("\n")}`).toEqual([]);
  });

  it("every allow-list entry carries an actual reason, and any scope names real questions", () => {
    const repo = getContentRepo();
    for (const [key, allowance] of Object.entries(LAWREF_MISMATCH_ALLOW)) {
      expect(key, key).toContain("→");
      expect(allowance.reason.trim().length, key).toBeGreaterThan(60);
      if (allowance.onlyQuestionIds === undefined) continue;
      const event = key.split("→")[0];
      for (const questionId of allowance.onlyQuestionIds) {
        expect(repo.questionById(questionId), `${key}: ${questionId}`).toBeDefined();
        expect(QUESTION_EVENT_TYPE[questionId], `${key}: ${questionId}`).toBe(event);
      }
    }
  });

  it("the deliberately-denied pairings are still denied, and still real", () => {
    for (const key of PAIRINGS_DELIBERATELY_DENIED) {
      expect(Object.hasOwn(LAWREF_MISMATCH_ALLOW, key), `${key} was quietly allow-listed`).toBe(
        false,
      );
    }
    // Each denied key must still be a pairing the resolver actually reaches —
    // otherwise the note is stale and should be deleted with its wiring.
    const reached = new Set<string>();
    for (const [questionId, event] of Object.entries(QUESTION_EVENT_TYPE)) {
      const candidate = whyPanelCandidateSimRef(questionId);
      if (candidate !== null) reached.add(pairKey(event, candidate.templateId));
    }
    for (const key of PAIRINGS_DELIBERATELY_DENIED) {
      expect(reached.has(key), `${key} no longer occurs — delete the note`).toBe(true);
    }
  });

  it("MISSING_DRILLS names real, still-withheld questions — the spec cannot rot into a lie", () => {
    // It is a specification, not wiring, so the only thing to enforce is that
    // it still describes THIS build: real ids, and every one of them actually
    // text-only today. The day someone records the demo, this test is what
    // tells them to delete the entry.
    const repo = getContentRepo();
    expect(MISSING_DRILLS.length).toBeGreaterThan(0);
    for (const gap of MISSING_DRILLS) {
      expect(gap.lawRef.trim().length, gap.lawRef).toBeGreaterThan(10);
      expect(gap.briefBg.trim().length, gap.lawRef).toBeGreaterThan(120);
      expect(gap.nearestWrong.trim().length, gap.lawRef).toBeGreaterThan(60);
      expect(gap.questionIds.length, gap.lawRef).toBeGreaterThan(0);
      for (const id of gap.questionIds) {
        expect(repo.questionById(id), `${gap.lawRef}: ${id}`).toBeDefined();
        expect(resolveWhyPanel(id)?.sim, `${gap.lawRef}: ${id} is served again`).toBeUndefined();
      }
    }
  });

  it("no question served by a denied pairing gets a clip", () => {
    const denied = new Set(PAIRINGS_DELIBERATELY_DENIED);
    for (const [questionId, event] of Object.entries(QUESTION_EVENT_TYPE)) {
      const candidate = whyPanelCandidateSimRef(questionId);
      if (candidate === null || !denied.has(pairKey(event, candidate.templateId))) continue;
      const spec = scenarioById(candidate.templateId)!;
      const check = pairingVerdict({
        questionId,
        event,
        templateId: candidate.templateId,
        questionLawRefs: getContentRepo().questionById(questionId)!.lawRefs,
        scenarioLawRef: spec.teach.lawRef,
      });
      // Law-matched questions of a denied pair are still served — the denial is
      // about the UNMATCHED ones. Only assert the unmatched ones are withheld.
      if (check.verdict !== "suspect") continue;
      expect(resolveWhyPanel(questionId)?.sim, questionId).toBeUndefined();
    }
  });
});

describe("citation normalization", () => {
  it("reads article numbers, ranges and suffixed articles out of a scenario lawRef", () => {
    expect([...scenarioArticleKeys("ЗДвП чл. 42")]).toEqual(["ЗДвП чл. 42"]);
    expect([...scenarioArticleKeys("ЗДвП чл. 25; чл. 37; чл. 42")]).toEqual([
      "ЗДвП чл. 25",
      "ЗДвП чл. 37",
      "ЗДвП чл. 42",
    ]);
    // A range cites both ends (чл. 51–53 is how the rail drill cites itself).
    expect([...scenarioArticleKeys("ЗДвП чл. 51–53")]).toEqual(["ЗДвП чл. 51", "ЗДвП чл. 53"]);
    expect([...scenarioArticleKeys("ЗДвП чл. 50а")]).toEqual(["ЗДвП чл. 50а"]);
    expect([...scenarioArticleKeys("ЗДвП чл. 8, ал. 2 и чл. 37")]).toEqual([
      "ЗДвП чл. 8",
      "ЗДвП чл. 37",
    ]);
  });

  it("keeps acts apart, and inherits the act across segments", () => {
    expect([...scenarioArticleKeys("ППЗДвП чл. 31; ЗДвП чл. 119")]).toEqual([
      "ППЗДвП чл. 31",
      "ЗДвП чл. 119",
    ]);
    // ППЗДвП чл. 31 must never satisfy a question citing ЗДвП чл. 31.
    expect(
      pairingVerdict({
        event: "ev-x",
        templateId: "sc-x",
        questionLawRefs: [{ act: "ЗДвП", ref: "чл. 31" }],
        scenarioLawRef: "ППЗДвП чл. 31",
      }).shared,
    ).toEqual([]);
  });

  it("compares ordinances act-level, because both sides cite them loosely", () => {
    // „Наредба № РД-02-21-1/2023" vs „…/23.11.2023" is the same ordinance.
    expect([...scenarioArticleKeys("Наредба № РД-02-21-1/2023")]).toEqual([
      "Наредба РД-02-21-1",
    ]);
    expect([
      ...questionArticleKeys([{ act: "Наредба № РД-02-21-1/23.11.2023", ref: "чл. 40" }]),
    ]).toEqual(["Наредба РД-02-21-1"]);
    expect([...scenarioArticleKeys("Наредба № 38 (контролни уреди)")]).toEqual(["Наредба 38"]);
  });

  it("a question with no citations can never law-match (it needs an allow-listed pair)", () => {
    const check = pairingVerdict({
      event: "ev-nowhere",
      templateId: "sc-nowhere",
      questionLawRefs: [],
      scenarioLawRef: "ЗДвП чл. 20",
    });
    expect(check.shared).toEqual([]);
    expect(check.verdict).toBe("suspect");
  });
});
