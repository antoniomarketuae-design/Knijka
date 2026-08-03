/**
 * THEO-4 pairing guard — "does this clip depict the manoeuvre this question is
 * actually about?"
 *
 * THE DEFECT THIS EXISTS FOR. `q-predimstvo-062` („Каниш се да завиеш надясно,
 * а отдясно на теб, по обозначена велолента, право напред продължава
 * велосипедист") is a RIGHT HOOK: you cross a bike lane and yield to the rider
 * going straight (ЗДвП чл. 25, ал. 2 · чл. 35, ал. 2 · чл. 5, ал. 2, т. 1). The
 * question carries no `media` and no `sim` of its own, so the why-panel picked
 * its visual by FALLBACK: question → `ev-cyclist` → the one template that event
 * is wired to → „Бързо изпреварване с късно отместване" — a car signalling LEFT
 * and OVERTAKING a cyclist, under чл. 42, an article the question never cites.
 * The student answering a right-turn question was shown a left-signal overtake.
 *
 * That is not a cosmetic slip. Requirement zero (doc 64 THEO-4) is that every
 * theory feature acts as a virtual driving instructor that EXPLAINS the
 * decision; for a behaviour question the visual IS the explanation. A wrong
 * visual is the instructor demonstrating the wrong manoeuvre.
 *
 * THE RULE THIS MODULE ENFORCES: SHOWING NOTHING IS BETTER THAN SHOWING THE
 * WRONG THING. A question with no clip falls back to its stored, law-cited,
 * already-reviewed explanation text — correct, just quieter. A question with
 * the wrong clip teaches the wrong manoeuvre. So when the pairing is not
 * confident, the resolver serves NO `sim` rather than the nearest clip in the
 * topic.
 *
 * The three layers, in the order `resolveWhyPanel` applies them:
 *
 *   1. CORRECTION  — `QUESTION_SCENARIO_CORRECTION` / `EVENT_SCENARIO_CORRECTION`:
 *      the ev-* bucket is coarser than the manoeuvre (one `ev-cyclist` covers
 *      overtaking a rider, a right hook across a cycleway, a child wobbling, a
 *      group…). These tables re-point a question — or a whole event — at the
 *      template that depicts ITS manoeuvre. Authored, never inferred.
 *   2. GUARD       — `pairingVerdict`: compare the question's STORED `lawRefs`
 *      against the scenario's STORED `teach.lawRef`. Share an article → the
 *      pairing argues from the same law and is served. Share nothing → suspect,
 *      and it is served only if the `event → template` pair is in
 *      `LAWREF_MISMATCH_ALLOW` with a written reason.
 *   3. FALLBACK    — no confident pairing → no `sim`, text + citations only.
 *
 * AND THE BY-PRODUCT: every time layer 3 fires because no drill teaches the
 * rule at all — rather than because the wrong drill was picked — the guard has
 * specified a demo the simulator is missing. `MISSING_DRILLS` at the bottom of
 * this file is that list, written from the student's side.
 *
 * ADR-002: nothing here reads, paraphrases or generates law. It compares
 * citation STRINGS that content authors already wrote, and every decision is a
 * committed table entry with a reason, test-gated by whyPanelPairing.test.ts.
 *
 * DELIBERATELY NOT the clip pilot. `whyPanelSimRefIndex()` (→ clipPilot.ts →
 * clipPlan.generated.ts) still resolves the raw EVENT_TO_SCENARIO wiring, so
 * the recorded-clip inventory and its freshness gate are untouched by anything
 * in this file. Corrections change WHICH question gets WHICH drill, not which
 * drills get rendered; a corrected target with no rendered clip degrades to the
 * 2D replay of the RIGHT manoeuvre (MistakeMedia), which is the whole point.
 */

import type { LawRef } from "@/lib/content/types";

/** A re-pointing: the template + mistake that depicts the real manoeuvre. */
export interface PairingCorrection {
  readonly templateId: string;
  /** Index into ScenarioSpec.mistakes. */
  readonly mistakeIndex: number;
  /** Why the event's default pick was wrong here — required, human-written. */
  readonly reason: string;
}

/* ------------------------------------------------------------------ *
 * Layer 1 — corrections
 * ------------------------------------------------------------------ */

/**
 * PER-QUESTION re-pointing, for questions whose event bucket is too coarse.
 *
 * The right-hook set. `ev-cyclist` collapses six cycling templates onto
 * „Изпреварване на велосипедист" (sc-vu-pass-clearance, чл. 42) — an OVERTAKE.
 * These five questions are all the same different manoeuvre: turning right
 * ACROSS a cycle lane and yielding to the rider going straight. The template
 * that depicts exactly that already exists — sc-vu-bikelane-turn „Десен завой
 * през велоалея" (ЗДвП чл. 25; чл. 37; чл. 42) — and its own authoring note
 * names these question ids as the bank it was verified against
 * (templates-vru2.ts). This table is that note, made executable.
 *
 * mistakeIndex 1 = „Отрязване на колелото по алеята" — the car turns right
 * while the rider is still crossing the mouth (the classic right hook).
 * mistakeIndex 0 = „Завой само с поглед назад — колело отпред-дясно" — the
 * shoulder check misses the COUNTER-FLOW rider on a two-way cycleway.
 */
export const QUESTION_SCENARIO_CORRECTION: Readonly<Record<string, PairingCorrection>> = {
  "q-predimstvo-062": {
    templateId: "sc-vu-bikelane-turn",
    mistakeIndex: 1,
    reason:
      "Right hook: turning right across a marked cycle lane, yielding to the rider going straight. The ev-cyclist default showed an OVERTAKE with a left signal (чл. 42) — the founder-caught defect. This demo cuts the rider off mid-mouth, which is the fault the question tests.",
  },
  "q-uyazvimi-011": {
    templateId: "sc-vu-bikelane-turn",
    mistakeIndex: 1,
    reason:
      "Same right hook, asked as „Кой преминава пръв?“ — the rider continues straight while the car turns right. An overtaking clip depicts a different manoeuvre.",
  },
  "q-uyazvimi-063": {
    templateId: "sc-vu-bikelane-turn",
    mistakeIndex: 1,
    reason:
      "Right hook asked as a SEQUENCE (signal → check the cycle lane and blind spot → yield → turn). It shared чл. 42 with the overtake template by accident of citation, so the law guard alone would not have caught it — the correction is what fixes it.",
  },
  "q-krastovishta-031": {
    templateId: "sc-vu-bikelane-turn",
    mistakeIndex: 1,
    reason:
      "Right turn at a city junction with a cycle lane on the right: the mandatory actions are the right-hook checks, not overtaking clearance.",
  },
  "q-uyazvimi-034": {
    templateId: "sc-vu-bikelane-turn",
    mistakeIndex: 0,
    reason:
      "„Откъде може да дойде велосипедист?“ on a TWO-WAY cycleway before a shop entrance — mistake 0 is the one that misses the counter-flow rider a shoulder check never covers.",
  },

  /* --- the Б1 SECONDARY-ROAD seat (2026-07-28) -------------------------- *
   *
   * `ev-junction-priority-sign` is the coarsest bucket in the map: its 18
   * questions are split almost evenly between the TWO SEATS of the same signed
   * junction — nine ask what you do while ON the priority road (жълт ромб, a
   * car waiting at Б1/Б2 on the side street) and nine ask what you do while
   * WAITING AT the Б1 on the secondary road. The event is wired to
   * sc-jx-priority-confidence, which teaches the priority-road seat, so the
   * guard denies the Б1 half and 14 of the 18 get no visual.
   *
   * A WHOLE-EVENT correction to sc-jx-giveway-b1 was the obvious fix and it is
   * wrong: it law-matches (чл. 50) for twelve questions, but six of those
   * twelve are priority-road questions — q-krastovishta-005 („движиш се по
   * булевард… отдясно се включва малка улица със знак Стоп, на който вече чака
   * автомобил"), q-krastovishta-057, q-predimstvo-006, q-predimstvo-056,
   * q-signali-i-markirovka-063, q-signs-037 — and it would hand them a drill
   * whose student is the one YIELDING. That is the founder's original complaint
   * with the seats swapped, and for q-krastovishta-005 it would actively
   * downgrade „no clip" to „wrong clip": sc-jx-priority-confidence's map IS
   * that question (tj-stop-v1, a car waiting at Б2 on the side street).
   *
   * So the correction is per-question, and only for questions whose student is
   * standing at the Б1. The priority-road half keeps sc-jx-priority-confidence
   * where it law-matches and keeps text + citations where it does not — the
   * denial note below records what stays denied and why.
   */
  "q-krastovishta-006": {
    templateId: "sc-jx-giveway-b1",
    mistakeIndex: 0,
    reason:
      "„Приближаваш кръстовище по второстепенна улица със знак Б1“ — the Б1 seat, asked as the sign's meaning. m0 „Навлизане пред колата по главния“ demonstrates the duty the statements turn on: Б1 obliges you to LET THROUGH, and only to stop when letting through requires it.",
  },
  "q-krastovishta-048": {
    templateId: "sc-jx-giveway-b1",
    mistakeIndex: 0,
    reason:
      "„Чакаш на знак Б1… приближава автомобил с включен десен мигач… Можеш ли да потеглиш веднага?“ — no: an indicator is an intention, not a guarantee. m0 is exactly that pull-out in front of a priority vehicle.",
  },
  "q-signali-i-markirovka-008": {
    templateId: "sc-jx-giveway-b1",
    mistakeIndex: 0,
    reason:
      "Flashing amber with a Б1 beneath it: the light abdicates, the sign governs, and the student is on the secondary road. m0 shows the yield that Б1 still demands when the signal has stopped deciding.",
  },
  "q-signs-064": {
    templateId: "sc-jx-giveway-b1",
    mistakeIndex: 0,
    reason:
      "Shark's teeth painted before a Б1 — the marking is the place where the yield is owed, and this drill's grading lines ARE those Б1 lines. m0 is the yield being skipped at one of them.",
  },
  "q-signs-009": {
    templateId: "sc-jx-giveway-b1",
    mistakeIndex: 1,
    reason:
      "„По пътя с предимство не се движи никой. Длъжен ли си да спреш напълно?“ — the question this drill is titled after („Б1 не значи спри винаги“). m1 (не m0): the answer is NO, you need not stop, and the fault that teaches it is the FIRST, clear junction taken without the look that permission depends on — not the barge in front of a priority car.",
  },
};

/**
 * WHOLE-EVENT re-pointing, where the event's wiring names a template from a
 * different manoeuvre class outright. Applies to every question of the event
 * that has no per-question correction.
 *
 * Both entries below were introduced by the 2026-07-22 coverage batch, whose
 * goal was reach (wire every event at SOME rendered reel) rather than fidelity.
 * Reach won and fidelity lost; these two put fidelity back. The raw
 * EVENT_TO_SCENARIO wiring is left alone so the recorded-clip inventory does
 * not move — see the module header.
 */
export const EVENT_SCENARIO_CORRECTION: Readonly<Record<string, PairingCorrection>> = {
  "ev-junction-signalized": {
    templateId: "sc-signal-response",
    mistakeIndex: 0,
    reason:
      "Signalized-junction questions were illustrated by sc-junction-stop „Знак Стоп“ — a STOP-SIGN drill. A sign that means „always stop“ is not the lesson of a light that changes; sc-signal-response „Светофар“ (ППЗДвП чл. 31, „Жълтото като зелено“) is the same junction under the control the questions actually ask about.",
  },
  "ev-lane-change": {
    templateId: "sc-lane-change",
    mistakeIndex: 0,
    reason:
      "Lane-change questions (including „от коя лента завиваш“ at a city junction) were illustrated by sc-mw-discipline „Висене в лявата лента при 130“ — MOTORWAY lane hogging, a different road and a different fault. sc-lane-change „Престрояване без мигач“ (ЗДвП чл. 25) depicts the manoeuvre being asked about.",
  },
};

/* ------------------------------------------------------------------ *
 * Layer 2 — the law-citation guard
 * ------------------------------------------------------------------ */

/**
 * `event → templateId` pairs that share NO article with the questions they
 * serve and are nevertheless correct — each with the reason a reviewer wrote
 * after looking at the drill and the questions.
 *
 * Why an allow-list rather than a looser rule: article divergence is normal
 * (a scenario cites the one article it grades, a question cites the two or
 * three that decide it) so a bare "no shared article" test would be noisy — but
 * it is the ONLY structured signal we have that a clip is arguing from a
 * different rule than the question, and it caught this defect. So divergence
 * does not fail the build; it fails UNLESS SOMEONE SAID WHY. A new event
 * wiring, a re-authored `teach.lawRef` or a new question with different
 * citations all land here as a test failure that names what to look at.
 *
 * Absent from this list = the questions of that pair with no shared article get
 * NO clip. That is the point: text + citations, not the nearest clip in the topic.
 */
export interface LawRefMismatchAllowance {
  /** Why the drill still depicts these questions' manoeuvre. Required. */
  readonly reason: string;
  /**
   * SCOPE. Blanket entries excuse every unmatched question of the pair, which
   * is what you want when the event is one manoeuvre cited two ways. When the
   * event MIXES manoeuvres, name the question ids instead: any other unmatched
   * question of the pair stays suspect and gets no clip.
   *
   * This is not a nicety — it is what keeps the guard load-bearing, and the
   * 2026-08-03 citation wave proved it twice.
   *
   * ORIGINALLY the scoped entry was `ev-cyclist→sc-vu-pass-clearance`: the
   * founder's q-predimstvo-062 lives on that pair, which also legitimately
   * serves a lateral-clearance question (q-eco-009). Left blanket, that one
   * excuse would have covered the right hook too and the guard would have
   * slept through the defect it was written for. That entry is GONE — see the
   * deleted-entry note below — because q-eco-009's citations were corrected to
   * ЗДвП чл. 42, ал. 2, т. 1 and the pairing is now carried by the law itself
   * rather than by an excuse. Better outcome, same guard.
   *
   * TODAY the exemplar is `ev-overtake→sc-ov-ban-overtake`, and it is the same
   * shape: ЗДвП § 6, т. 80 (нова, ДВ бр. 64 от 2025 г.) split ЗАОБИКАЛЯНЕ off
   * from ИЗПРЕВАРВАНЕ as a separate manoeuvre with its own article, the theory
   * bank was re-cited onto it, and three questions of the event stopped being
   * about the drill's manoeuvre. Blanket, the overtake-ban excuse would have
   * carried them silently.
   */
  readonly onlyQuestionIds?: readonly string[];
}

export const LAWREF_MISMATCH_ALLOW: Readonly<Record<string, LawRefMismatchAllowance>> = {
  "ev-adverse-weather→sc-ac-rain-lights": { reason: "„Дъжд без светлини“ is the adverse-weather conduct drill; the questions cite the speed/visibility duties (чл. 20, чл. 21, чл. 74) while the drill cites the lights article (чл. 70). Same weather, same manoeuvre: slow down and be seen." },
  // 2026-08-03 — REMOVED, not stale by accident: this excused sc-animal-hazard
  // for citing „чл. 63", described here as „the obstacle article". ЗДвП чл. 63 is
  // the TUNNEL article; the solid-line ban the drill actually teaches is ППЗДвП
  // чл. 63, ал. 2, т. 1 („Единична непрекъсната линия" - М1… забранено да я
  // застъпват и пресичат"). With the drill corrected to ППЗДвП чл. 63, ал. 2,
  // т. 1 + ЗДвП чл. 20, ал. 2 the pairing MATCHES the questions' чл. 20 and
  // needs no excuse. This gate is what caught it.
  "ev-bus-pullout→sc-merge-bus-pullout": { reason: "Bus at a stop / pulling out — the questions cite the passenger-and-stop articles (чл. 116-119), the drill the pull-out priority article (чл. 67). One situation, two ends of it." },
  "ev-driver-distraction→sc-driver-distraction": { reason: "Distraction questions (phone, headphones, navigation, fatigue) cite the fitness articles (чл. 5, чл. 104а); the drill cites the attention duty (чл. 20, ал. 2) and shows the delayed reaction those questions warn about." },
  "ev-emergency-stop-triangle→sc-hz-breakdown-pulloff": { reason: "Breakdown protocol: the questions cite the triangle/warning article (чл. 97), the drill the motorway hard-shoulder article (чл. 58, т. 3). Same drill, same sequence." },
  "ev-emergency-vehicle→sc-vu-emergency": { reason: "Making way for a vehicle on a special regime; the questions cite чл. 92/104, the drill чл. 91." },
  "ev-following-distance→sc-follow-distance": { reason: "Following distance under a different citation (чл. 5/чл. 20 vs the drill's чл. 23) — the depicted fault („Лепене за предния“) is the questions' fault." },
  "ev-illegal-stop-zone→sc-pk-ban-stop": { reason: "Stopping where stopping is banned; the questions cite the specific bans (чл. 58, чл. 93-96) and the markings ordinance, the drill the general article (чл. 98)." },
  "ev-lane-control-signal→sc-lane-control-signal": { reason: "Overhead lane signals — the questions cite ППЗДвП чл. 33 (the signal itself), the drill ЗДвП чл. 6 (obeying it). Same red X, same manoeuvre." },
  "ev-lane-discipline→sc-mw-discipline": { reason: "Lane discipline on a multi-lane carriageway; the drill's fault (occupying the wrong lane with a free lane to the right) is the question's rule, cited as чл. 16 rather than чл. 15." },
  "ev-lights-usage→sc-ac-night-lights": { reason: "Which lights, when — the questions cite the tunnel/fog articles (чл. 63, чл. 74), the drill the night-lights article (чл. 70). The depicted fault is driving with the wrong lights, which is what they ask." },
  "ev-merge-giveway→sc-merge-from-property": { reason: "Joining the carriageway from a property or a lesser surface without priority — the drill („Излизане от бензиностанция през тротоара“) cites the manoeuvre article чл. 25, the questions the duty article for the surface they are leaving: чл. 37, ал. 3 („водачът на пътно превозно средство, излизащо на път от крайпътна територия, като двор, предприятие, ГАРАЖ, паркинг, БЕНЗИНОСТАНЦИЯ и други подобни, е длъжен да пропусне пешеходците и пътните превозни средства“ — q-manevri-064, q-krastovishta-056, q-predimstvo-018/019) or чл. 49 („водач … което излиза от ЗЕМЕН път на път с настилка, е длъжен да пропусне…“ — q-manevri-035, q-krastovishta-041). One manoeuvre, cited from either end." },
  "ev-motorway-entry-exit→sc-merge-accel-lane": { reason: "Acceleration-lane merging; the questions cite the motorway articles (чл. 56, чл. 58), the drill the merge article (чл. 55)." },
  "ev-oncoming-meeting→sc-ln-obstacle-meeting": { reason: "Meeting oncoming traffic where the road will not take both — the questions cite the narrow/gradient rule (чл. 45), the drill the obstacle-on-your-side rule (чл. 44). The drill shows the manoeuvre both describe." },
  // SCOPED, on purpose — see LawRefMismatchAllowance.onlyQuestionIds. Since
  // ДВ бр. 64 от 2025 г. (в сила 7.09.2025) the act separates two manoeuvres
  // this event used to collapse:
  //   § 6, т. 80 ДР — „Заобикаляне“ е преминаване на участник в пътното
  //     движение покрай препятствие, повреди на платното за движение или
  //     НЕПОДВИЖЕН участник в движението.
  //   чл. 41, ал. 2 — при ИЗПРЕВАРВАНЕ водачът „напуска пътната лента…
  //     преминава покрай ДВИЖЕЩОТО СЕ в същата посока пътно превозно средство
  //     и се връща в напуснатата лента“.
  // sc-ov-ban-overtake is an ИЗПРЕВАРВАНЕ drill: a moving slow car, passed on
  // the LEFT, inside a В24 zone, and its lesson is „wait“. The three questions
  // the 2026-08-03 wave re-cited onto чл. 43б („Заобикалянето се извършва от
  // лявата страна…, а при невъзможност или при наличие на съответния пътен
  // знак – и от дясната“) ask the opposite question — when you MAY go round a
  // stopped car, on its right — so they are excluded and get text only. The
  // ids below are the ones a reviewer checked ARE the drill's manoeuvre.
  "ev-overtake→sc-ov-ban-overtake": {
    reason:
      "Overtaking under a ban, cited by the questions to the marking or the sign rather than to the drill's чл. 42-43: the В24 sign itself (q-signs-032, Наредба РД-02-21-1 чл. 83), the centre line that forbids it (q-manevri-014/-048 Наредба № 2/2001; q-signali-i-markirovka-054/-055 ППЗДвП чл. 63, ал. 2, т. 5), the чл. 41 definition of the manoeuvre where a crawling lane is NOT an overtake (q-magistrali-i-izvangradsko-044, q-manevri-031), and why it is riskier at night (q-nosht-054, чл. 20). All eight are the drill's manoeuvre — a slow vehicle ahead, a ban that holds anyway. NOT granted to the чл. 43б заобикаляне questions; see the comment above.",
    onlyQuestionIds: [
      "q-magistrali-i-izvangradsko-044",
      "q-manevri-014",
      "q-manevri-031",
      "q-manevri-048",
      "q-nosht-054",
      "q-signali-i-markirovka-054",
      "q-signali-i-markirovka-055",
      "q-signs-032",
    ],
  },
  "ev-parking-maneuver→sc-park-parallel": { reason: "Parallel parking and what you owe after it (doors, handbrake, wheels to the kerb) — the questions cite чл. 94-96, the drill чл. 40. Same manoeuvre, adjacent duties." },
  "ev-ped-crossing-marked→sc-zebra-approach": { reason: "Approaching a marked crossing; the questions cite the pedestrian-priority articles (чл. 116, чл. 120) or the speed duty (чл. 20), the drill чл. 119." },
  "ev-ped-unmarked-hazard→sc-pe-parked-row-scan": { reason: "A pedestrian appearing from behind a parked row — the questions cite the vulnerable-user care articles (чл. 116-117), the drill the speed/anticipation duties (чл. 20, чл. 21)." },
  "ev-police-stop-signal→sc-vp-police-stop": { reason: "Stopping on a police signal — the questions cite the officer's power (чл. 103), the drill the driver's duty to comply (чл. 170)." },
  "ev-railway-crossing→sc-rx-unguarded": { reason: "Unguarded level crossing; the questions cite чл. 50/52 individually, the drill the range чл. 51-53 (the article-range parse is exact, so 52 matches — what remains here cites чл. 50/20)." },
  "ev-speed-limit→sc-speed-creep": { reason: "Creeping over the limit; the questions cite the sign hierarchy or the zone article (чл. 6, чл. 7, чл. 62), the drill the limit article (чл. 21)." },
  "ev-traffic-controller→sc-signal-controller": { reason: "The controller outranks the light — the questions cite the controller's signals (чл. 10), the drill the hierarchy article (чл. 7). The drill's fault IS that hierarchy." },
  "ev-tram→sc-rx-tram-left": { reason: "Tram priority — the questions cite the equal-roads/priority article (чл. 48) or the overtaking articles, the drill the rail-vehicle priority (чл. 8, ал. 2 и чл. 37)." },
  // The parenthetical here used to read „the drill the U-turn ban (чл. 38)“ and
  // that was wrong: чл. 38 is the U-turn MANOEUVRE article („Завиването в
  // обратна посока се извършва наляво от най-лявата пътна лента…“) and чл. 39
  // is the BAN („Завиването в обратна посока е забранено на пешеходна пътека,
  // железопътен прелез, мост, надлез, в тунел, в подлез, при ограничена
  // видимост или при намалена видимост под 50 метра“). The 2026-08-03 wave
  // moved q-manevri-021 and -052 onto чл. 39, which is correct and which is
  // why they now need this entry.
  "ev-uturn-reverse→sc-mv-uturn-ban": { reason: "U-turn and reversing to recover a missed exit. The drill cites the U-turn manoeuvre article (чл. 38); the questions cite the half of the same manoeuvre they ask about — where it is forbidden (чл. 39, q-manevri-021/-052), the В23 sign (q-manevri-053), the reversing article (чл. 40) or the motorway ban (чл. 58/58а). Same manoeuvre, adjacent articles." },
  "ev-zone-regime→sc-pe-zone-living": { reason: "Residential/school zone pace — the questions cite the vulnerable-user duties (чл. 117, чл. 119), the drill the zone articles (чл. 62-63)." },
  "ev-junction-uncontrolled→sc-junction-rhr": { reason: "Priority from the right at an uncontrolled junction; the questions cite чл. 47/48 (the equal-roads rule), the drill чл. 50 (the junction article). Same junction, same yield." },
  "ev-junction-signalized→sc-signal-response": { reason: "After the event correction above: light-controlled junction questions that cite the junction/priority articles (чл. 7, чл. 37, чл. 50а) rather than the signal article the drill cites (ППЗДвП чл. 31)." },
  "ev-lane-change→sc-lane-change": { reason: "After the event correction above: lane-choice-at-a-junction questions cite чл. 36/37 (where to position for the turn) while the drill cites чл. 25 (the manoeuvre duty). The depicted fault — changing lane without signal or mirror — is the one they test." },
};

/**
 * ENTRIES DELETED because nothing needs excusing any more — recorded verbatim
 * so a revert on the other side of the pairing is a two-minute restore rather
 * than a rediscovery. `no stale allow-list entries` fails the build the moment
 * a key stops being exercised, so these could not simply be left in place.
 *
 * Both went away on 2026-08-03 for the SAME good reason: the two sides now
 * cite the same article because someone corrected a citation that was wrong.
 *
 *  ev-cyclist→sc-vu-pass-clearance  (was SCOPED to ["q-eco-009"])
 *      „q-eco-009 („В кои ситуации трябва да си осигуриш по-голямо странично
 *      разстояние?“) is exactly what „Изпреварване на велосипедист“
 *      demonstrates; it cites чл. 23/41 where the drill cites чл. 42.“
 *      — the theory wave re-cited q-eco-009 onto ЗДвП чл. 42, ал. 2, т. 1 („по
 *      време на изпреварването да осигури достатъчно странично разстояние
 *      между своето и изпреварваното пътно превозно средство“), which is the
 *      drill's own article and is literally the question. law-match now.
 *      NOTE the canary in whyPanelPairing.test.ts still depends on this pair
 *      having NO blanket entry — do not re-add one without scoping it.
 *
 *  ev-roundabout→sc-roundabout-entry
 *      „Roundabout entry and priority; the questions cite the junction article
 *      (чл. 50) or the ordinance, the drill the roundabout article (чл. 50а).“
 *      — that parenthetical was false. ЗДвП чл. 50а is „Забранено е
 *      навлизането в кръстовище дори и при разрешаващ сигнал на светофара, ако
 *      обстановката в кръстовището ще принуди водача да спре в кръстовището“ —
 *      the blocked-junction rule, with no roundabout provision in it (doc 90
 *      §6.1: there is no statutory roundabout-priority rule at all; the chain
 *      is Б1/Б2 + чл. 50, ал. 1 + Наредба РД-02-21-1 чл. 61, ал. 5 и чл. 98).
 *      The bank was corrected first, which briefly moved seven questions onto
 *      this excuse; the sim lane then re-cited sc-roundabout-entry to
 *      „ЗДвП чл. 50, ал. 1; чл. 28, ал. 1, т. 2; Наредба № РД-02-21-1 чл. 61,
 *      ал. 5“ and all ten questions law-match. If that re-citation is ever
 *      reverted, restore this key WITH THE CORRECTED WORDING, not the old one.
 */

/**
 * Pairs deliberately NOT allow-listed, recorded so the next reader does not
 * "fix" the gap by adding them. Every question of these pairs that shares no
 * article with the drill now shows text + citations instead of a clip.
 *
 *  ev-collision→sc-hz-brake-dont-swerve      — the unmatched questions are
 *      POST-crash procedure („одраскваш вратата на съседен автомобил", the
 *      insurance claim after hitting a deer). The drill is a collision
 *      AVOIDANCE manoeuvre. Nothing it shows answers what to do afterwards.
 *  ev-eco-defensive→sc-jx-priority-confidence — fuel-economy questions („Кой
 *      начин на шофиране пести най-много гориво?") illustrated by a panic stop
 *      on a priority road. Different manoeuvre, different lesson.
 *  ev-junction-priority-sign→sc-jx-priority-confidence — REDUCED, not lifted
 *      (2026-07-28). Five of the unmatched questions were the Б1 SECONDARY-road
 *      seat and are now corrected to sc-jx-giveway-b1 (above). What remains
 *      denied is deliberate and of two kinds. (a) PRIORITY-ROAD questions that
 *      cite чл. 50 rather than the drill's чл. 48/20 — q-krastovishta-005 and
 *      -057, q-predimstvo-006 and -056, q-signali-i-markirovka-063, q-signs-037:
 *      the drill is the right SEAT for them but the guard cannot see it, and
 *      re-pointing them at the Б1 drill to buy a law match would put the
 *      student in the wrong seat. (b) Questions about the SIGNS THEMSELVES or
 *      about a dead/flashing signal, cited only to ППЗДвП/Наредба —
 *      q-osnovni-058, q-predimstvo-009, q-predimstvo-023: no drive depicts
 *      „what does this sign mean", and the stored explanation already does.
 *      (c) NEW 2026-08-03 — q-signs-054, the Т13 BENT PRIORITY ROAD. It used
 *      to law-match on чл. 48; the wave re-cited it to ЗДвП чл. 50, ал. 2 +
 *      ППЗДвП чл. 46, ал. 5 („Когато пътят с предимство променя направлението
 *      си в кръстовището, това се указва с допълнителна табела Т13“) and the
 *      guard withheld the drill. Withholding is RIGHT and re-pointing would be
 *      wrong: чл. 50, ал. 2 says that when the priority road bends, the
 *      drivers ON it „се ръководят помежду си от правилата на чл. 48“ — i.e.
 *      being on the priority road stops settling it and you owe the right-hand
 *      rule to another priority-road car. sc-jx-priority-confidence teaches
 *      the opposite instinct („предимството се използва — не спирай без
 *      причина“) on a road that runs STRAIGHT. No template in the catalogue
 *      has a Т13 plate or a bending priority road; see MISSING_DRILLS below.
 *  ev-markings-response→sc-ov-solid-line — arrow-lanes, shark's teeth and
 *      sign-versus-marking conflicts illustrated by an OVERTAKE across the
 *      centre line. The marking is shared; the manoeuvre is not.
 *  ev-signaling-discipline→sc-turn-left-oncoming — indicator-discipline
 *      questions (the order of checks before a manoeuvre, a blinker left on,
 *      passing a parked car) illustrated by cutting a LEFT TURN across
 *      oncoming traffic. This is the founder's complaint in its purest form:
 *      the wrong indicator on the wrong manoeuvre.
 *  ev-sign-prohibitory→sc-pk-ban-stop — the unmatched questions are about the
 *      NO-OVERTAKING sign; the drill is a no-STOPPING zone.
 *  ev-sign-warning→sc-sign-warning — the unmatched questions ask which group-А
 *      signs precede a junction / announce vulnerable users; the drill is А15,
 *      slippery road. Same defect class as the А5 sign that drew an ascent
 *      while its question keyed descent.
 *  ev-speed-for-conditions→sc-speed-rain — the unmatched questions are about
 *      being DAZZLED by oncoming high beams (чл. 77), not about rain.
 */
export const PAIRINGS_DELIBERATELY_DENIED: readonly string[] = [
  "ev-collision→sc-hz-brake-dont-swerve",
  "ev-eco-defensive→sc-jx-priority-confidence",
  "ev-junction-priority-sign→sc-jx-priority-confidence",
  "ev-markings-response→sc-ov-solid-line",
  "ev-signaling-discipline→sc-turn-left-oncoming",
  "ev-sign-prohibitory→sc-pk-ban-stop",
  "ev-sign-warning→sc-sign-warning",
  "ev-speed-for-conditions→sc-speed-rain",
];

/**
 * THE SPEC THIS GUARD PRODUCES AS A BY-PRODUCT.
 *
 * Every time the guard withholds a clip and the honest answer is "no drill
 * teaches that rule" rather than "point it at another drill", it has named a
 * hole in the simulator's catalogue — with the exact article, the exact
 * questions already written against it, and the reason the nearest existing
 * drill would teach the wrong thing. That is a scenario brief, arrived at from
 * the student's side instead of the author's.
 *
 * These are the rows where a REVIEWER decided "accept the withheld clip",
 * not the full withheld set: a denial that reduces to „no drive can depict
 * what a sign MEANS" is not a missing drill and is recorded above instead.
 *
 * Not consumed by any runtime code on purpose — it is a specification, and
 * pretending otherwise would invite someone to wire it. `whyPanelPairing.test.ts`
 * checks only that the question ids are real and are still withheld, so an
 * entry cannot rot into a lie about the current build.
 */
export interface MissingDrill {
  /** The rule with no demo, as the questions cite it. */
  readonly lawRef: string;
  /** What the drill would have to depict. */
  readonly briefBg: string;
  /** Bank questions already written against it and currently text-only. */
  readonly questionIds: readonly string[];
  /** The drill they fall back to today, and why it is the wrong lesson. */
  readonly nearestWrong: string;
}

export const MISSING_DRILLS: readonly MissingDrill[] = [
  {
    lawRef: "ЗДвП чл. 43б (+ § 6, т. 80 ДР) — заобикаляне, вкл. отдясно",
    briefBg:
      "Спрял на осевата с ляв мигач автомобил, който чака да завие наляво към страничен път; вдясно от него лентата стига. Ученикът трябва да го ЗАОБИКОЛИ отдясно, като преди това пропусне движещите се по лентата, която ще ползва (чл. 43б, ал. 2). Грешката за демото: тръгване отдясно без да се пропусне колата, която вече се движи по дясната лента — и вариант, в който заобикалянето се прави на релсово ПС отляво (чл. 43а забранява точно това).",
    questionIds: ["q-krastovishta-051", "q-manevri-024", "q-manevri-060"],
    nearestWrong:
      "sc-ov-ban-overtake „Изпреварване при забрана“ — a moving slow car passed on the LEFT inside a В24 zone, whose whole lesson is „изчакай“. These three ask when you MAY pass, on the RIGHT, a car that is standing still. Opposite side, opposite answer, and since ДВ бр. 64 от 2025 г. a different article.",
  },
  {
    lawRef: "ЗДвП чл. 50, ал. 2 + ППЗДвП чл. 46, ал. 5 — табела Т13",
    briefBg:
      "Кръстовище, на което пътят с предимство ЗАВИВА, сигнализирано с Б3 + допълнителна табела Т13. Ученикът е на пътя с предимство, но приближава втора кола, също на пътя с предимство, отдясно. Демонстрираната грешка: минаване без спиране „защото знакът е мой“ — а чл. 50, ал. 2 връща двамата към правилото на дясното по чл. 48.",
    questionIds: ["q-signs-054"],
    nearestWrong:
      "sc-jx-priority-confidence „По пътя с предимство — без излишни спирания“ — a priority road that runs STRAIGHT past a Б2 side street, teaching „не спирай без причина“. Shown on a Т13 question it reinforces exactly the instinct that causes the crash there.",
  },
];

/* ------------------------------------------------------------------ *
 * Citation normalization — string comparison only, never interpretation
 * ------------------------------------------------------------------ */

/** „чл. 42" / „чл. 41–42" / „чл. 137а" inside a citation string. */
const ARTICLE_RE = /чл\.\s*(\d+[а-я]?)(?:\s*[–—-]\s*(\d+[а-я]?))?/g;

/**
 * The act a citation belongs to, normalized to one token. Наредби collapse to
 * their number („Наредба № 2/2001" → „Наредба 2") because the two sides cite
 * them inconsistently (with the year, with a full date, with a parenthetical),
 * and an ordinance is compared ACT-LEVEL — see articleKeysFor.
 */
function actKey(act: string): string {
  const a = act.trim();
  if (a.startsWith("ППЗДвП")) return "ППЗДвП";
  if (a.startsWith("ЗДвП")) return "ЗДвП";
  if (a.startsWith("Наредба")) {
    const m = /№\s*([^\s,;()]+)/.exec(a);
    return m === null ? "Наредба" : `Наредба ${m[1].split("/")[0]}`;
  }
  return a;
}

/** Every article number in a citation fragment; a range yields both ends. */
function articleNumbers(fragment: string): string[] {
  const out: string[] = [];
  ARTICLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ARTICLE_RE.exec(fragment)) !== null) {
    out.push(m[1]);
    if (m[2] !== undefined) out.push(m[2]);
  }
  return out;
}

/**
 * Comparison keys for one act + citation fragment. ЗДвП/ППЗДвП compare per
 * ARTICLE („ЗДвП чл. 25"); ordinances compare per ACT, because their article
 * numbering is cited too loosely on both sides to mean anything.
 */
function articleKeysFor(act: string, fragment: string, into: Set<string>): void {
  const key = actKey(act);
  if (key.startsWith("Наредба")) {
    into.add(key);
    return;
  }
  for (const n of articleNumbers(fragment)) into.add(`${key} чл. ${n}`);
}

/** Comparison keys for a question's STORED lawRefs. */
export function questionArticleKeys(lawRefs: readonly LawRef[]): Set<string> {
  const keys = new Set<string>();
  for (const ref of lawRefs) articleKeysFor(ref.act, ref.ref, keys);
  return keys;
}

/**
 * Comparison keys for a scenario's STORED `teach.lawRef` — one free-text line
 * that may switch acts („Наредба № 38; ЗДвП чл. 25, чл. 98"). Segments inherit
 * the last act named, defaulting to ЗДвП.
 */
export function scenarioArticleKeys(teachLawRef: string): Set<string> {
  const keys = new Set<string>();
  let act = "ЗДвП";
  for (const segment of teachLawRef.split(";")) {
    const named = /^\s*(ППЗДвП|ЗДвП|Наредба[^,(]*)/.exec(segment);
    if (named !== null) act = named[1];
    articleKeysFor(act, segment, keys);
  }
  return keys;
}

/** The `event→templateId` key both tables are addressed by. */
export function pairKey(event: string, templateId: string): string {
  return `${event}→${templateId}`;
}

export type PairingVerdict =
  /** The question and the drill cite a common article — served. */
  | "law-match"
  /** No common article, but the pair is allow-listed with a reason — served. */
  | "allow-listed"
  /** No common article and no allow-list entry — NOT served (text-only). */
  | "suspect";

export interface PairingCheck {
  verdict: PairingVerdict;
  /** Articles both sides cite, sorted — the evidence for "law-match". */
  shared: string[];
  /** The allow-list key this pairing is addressed by. */
  key: string;
}

/**
 * The guard. Pure string comparison over STORED citations (ADR-002): does the
 * drill argue from an article the question also cites, and if not, has someone
 * written down why the pairing still depicts the question's manoeuvre?
 */
export function pairingVerdict(args: {
  /** Question being illustrated — only needed to honour a SCOPED allowance. */
  questionId?: string;
  event: string;
  templateId: string;
  questionLawRefs: readonly LawRef[];
  scenarioLawRef: string;
}): PairingCheck {
  const key = pairKey(args.event, args.templateId);
  const qKeys = questionArticleKeys(args.questionLawRefs);
  const sKeys = scenarioArticleKeys(args.scenarioLawRef);
  const shared = [...qKeys].filter((k) => sKeys.has(k)).sort();
  if (shared.length > 0) return { verdict: "law-match", shared, key };
  const allowance = Object.hasOwn(LAWREF_MISMATCH_ALLOW, key)
    ? LAWREF_MISMATCH_ALLOW[key]
    : undefined;
  const allowed =
    allowance !== undefined &&
    (allowance.onlyQuestionIds === undefined ||
      (args.questionId !== undefined && allowance.onlyQuestionIds.includes(args.questionId)));
  return { verdict: allowed ? "allow-listed" : "suspect", shared, key };
}
