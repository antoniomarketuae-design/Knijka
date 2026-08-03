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
  QUESTION_SCENARIO_CORRECTION,
  pairKey,
  pairingVerdict,
  questionArticleKeys,
  scenarioArticleKeys,
} from "./whyPanelPairing";

/** The five bank questions sc-vu-bikelane-turn was authored against. */
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
    expect(refused).toBe(57);
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
