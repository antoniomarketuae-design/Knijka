/**
 * The регулировчик's three postures, as a CAPTION — the copy TrafficLayer
 * paints in the bubble above the officer's head (founder item 20, ledger L4).
 *
 * WHY THIS FILE EXISTS. The founder asked twice for it in his own words:
 * *„each position the traffic officers shows on top of his head some bubble
 * must appear stating what exactly he is pointing, who is he letting go, whos
 * turn its to pass"*. Doc 86 L4 closed the scale and the placement and left
 * this open — *„`TrafficLayer.tsx` contains no `Html`/label/bubble of any
 * kind"* — because the figure lives in `traffic/` and the teaching text lives
 * in `lessons/scenario/templates-signals.ts` (`CONTROLLER_GESTURES`), and no
 * lane owned both. A presentation module must not reach into lesson content
 * (docs/architecture/05), so the caption lives here, next to the renderer that
 * paints it, and `__tests__/controller-bubble.test.ts` pins it against the
 * authored gestures so the two can never drift.
 *
 * THEO-4. A pose is a bare verdict wearing a costume: a student who sees an
 * arm go up learns nothing from the arm. Every bubble therefore answers the
 * questions he actually asked — what am I looking at, who goes, who stops,
 * WHOSE PRIORITY IT IS — and carries the article that makes it law. ADR-002:
 * `lawRef` is RETRIEVED from the authored `CONTROLLER_GESTURES` (pinned by
 * that test), never recalled by the model.
 *
 * THE FOURTH LINE (2026-08-10, B41). The card shipped with three of the four
 * and the register closed the row on „all three of his questions are
 * answered". Read his sentence again: *„what exactly he is pointing, who is he
 * letting go, whos turn its to pass"* — and then read the drill. Both authored
 * mistakes on `sc-sig-controller-postures` are priority mistakes, not
 * who-is-moving mistakes: a student who barges the officer's chest has read
 * „who goes" correctly (the cross traffic) and still drives, because nothing
 * told him the officer OUTRANKS the lamp he is looking at. `priorityBg` is
 * that line, and it names the lamp on purpose — «дори на червено» / «и на
 * зелено» — because the confusion is always with a light, never in the
 * abstract.
 *
 * The long-form teaching text — `poseBg` / `goBg` / `stopBg` / `priorityBg` in
 * `CONTROLLER_GESTURES` — stays where it is and is what the debrief and the
 * lesson copy use. These strings are its caption, cut to what stays readable
 * on a billboard 30–60 m away in a moving cockpit — and since the founder's
 * «short card» ruling (2026-09-22, see `CONTROLLER_BUBBLES`) that means three
 * lines: the posture's name, who goes / who stops, and the law.
 *
 * THE FOURTH CATALOGUE (2026-08-09). Three surveys of „where does the simulator
 * cite law" named the scenario templates and the 58-entry rule catalogue and
 * missed this file — and this is the one whose `lawRef` is PAINTED ONTO A
 * CANVAS in the 3D scene (`TrafficLayer.tsx`, `g.fillText(copy.lawRef, …)`),
 * i.e. read from the driving seat rather than from a panel. All three entries
 * cited „ППЗДвП чл. 29, ал. 3", an article of an act `content/law/acts` does
 * not hold, so nobody could check the number. They now name the act and the
 * subject — „ППЗДвП сигнали на регулировчика" — and the half that IS checkable
 * stays exactly as it was: ЗДвП чл. 7, which is in the corpus and is the
 * clause that actually says the officer outranks the lamp.
 * `modules/sim/__tests__/law-citations.test.ts` scans this file by name.
 */

/** A posture the officer can hold (ППЗДвП чл. 29, ал. 3). Mirrors the authored
 *  `ControllerPosture` union in lessons/scenario/templates-signals.ts. */
export type ControllerBubblePosture = "sideProfile" | "chestOrBack" | "armRaised";

/**
 * HOW MUCH OF THE CARD THIS RUNG GETS — the §7 aid ladder applied to the one
 * surface that was never on it (sweep161 `sc-sig-controller-postures:3936550e`,
 * „the billboard states the answer outright, removing the reading-the-posture
 * exercise the task asks for", and `:ef0e821c`, „five lines of tiny
 * multi-coloured text, unreadable at native phone size").
 *
 * THE TWO ROWS ARE ONE REPAIR AND THE GEOMETRY FORCES IT. Cap height on this
 * card is the plane's height divided by the number of line slots, and the plane
 * cannot get taller: its top must stay inside the windscreen at the range the
 * drill grades, which is what `bubbleScale`/`BUBBLE_H_M` in `TrafficLayer.tsx`
 * already measure (h = 1.9 m clips at ≈11.7 m; h = 2.4 m clips at ≈17.0 m,
 * which is the stop line itself). Width buys no cap height, and every body line
 * is at or near the shrink clamp already. So the ONLY lever that makes this
 * type bigger is FEWER LINES — which is exactly what the other row asks for.
 *
 * AND THE FOUNDER'S ASK IS NOT NARROWED, which is the reason this is a ladder
 * and not a deletion. Item 20, twice: „each position the traffic officers shows
 * on top of his head some bubble must appear stating what exactly he is
 * pointing, who is he letting go, whos turn its to pass." That is `"full"`, and
 * `"full"` is what L1 gets — the rung whose own name is «Пълна помощ»
 * (`scenario/types.ts` SCENARIO_LEVEL_NAMES_BG). The rungs that promise LESS
 * help now deliver less of it:
 *
 *   L1 «Пълна помощ»      `"full"`     the SHORT card (founder, 2026-09-22):
 *                                      posture name, who goes / who stops in
 *                                      one line, the law. Still the answer.
 *   L2 «Частична помощ»   `"posture"`  the POSE, named and legible; the rule is
 *                                      the student's to apply. Partial help is
 *                                      exactly this split — the product does
 *                                      the perception, he does the law.
 *   L3 «Самостоятелно»    `"off"`      no card. He reads the man.
 *   L4 «Изпитни условия»  `"off"`      an examiner does not caption the officer.
 *
 * DEFAULT `"full"` on every mount that does not ask (the clip-capture rig, the
 * curriculum lessons, any headless test), so nothing that shipped changes.
 */
export type ControllerCaptionDetail = "full" | "posture" | "off";

/**
 * The rung's caption detail. `level` is the scenario rung (1..5); anything
 * absent or out of range is `"full"` — a lesson that cannot say which rung it
 * is gets the помощ, never the exam.
 */
export function controllerCaptionDetailForLevel(
  level: number | null | undefined,
): ControllerCaptionDetail {
  if (typeof level !== "number" || !Number.isFinite(level)) return "full";
  if (level <= 1) return "full";
  if (level === 2) return "posture";
  return "off";
}

export interface ControllerBubbleCopy {
  posture: ControllerBubblePosture;
  /**
   * WHAT HE IS DOING, not what you should do — the header of the L1 card and
   * the whole card at `"posture"` detail, the line the reading exercise is
   * built on.
   *
   * It is a NAME and not a sentence on purpose: two words at 112 px of a 540 px
   * canvas is ≈2× the cap height the old six-line card's body lines measured
   * (`TrafficLayer.tsx`, `BUBBLE_POSTURE_LINE_PX`), which is the size half of
   * `sc-sig-controller-postures:ef0e821c`.
   *
   * The words are the law's own vocabulary, retrieved from the ППЗДвП text
   * quoted verbatim in `lessons/scenario/templates-signals.ts`
   * (`CONTROLLER_GESTURES`) and from this template's `objectiveBg`
   * («страничен профил … гърди или гръб … вдигната ръка»), never invented here.
   */
  postureNameBg: string;
  /**
   * WHO GOES AND WHO STOPS, IN ONE SHORT LINE — the answer the L1 card still
   * gives (founder ruling 2026-09-20) on the short card he ruled on 2026-09-22.
   *
   * Cut from the authored bank's own words (`CONTROLLER_GESTURES[i].goBg` /
   * `.stopBg`: «Минаваш ТИ…», «Спира напречното направление…», «Спираш ТИ…»,
   * «Спират ВСИЧКИ посоки…», «Никой.»), never re-worded into something the
   * bank does not say. ≤ 30 characters so it paints at its authored size on
   * the painter test's unforgiving 0.62 em/char stub.
   *
   * It says nothing about the ARMS, on purpose — `officerArmTarget` is
   * posture-blind, so an arm cue would teach the halt posture as permission
   * (`mistake-barge-chest`); the name line above carries the body, which is the
   * discriminator the law gives («срещу лявото или дясното рамо»).
   */
  answerBg: string;
  /** Accent colour for the posture name + border: red = spri, green = minavaj,
   *  amber = vnimanie. L1 gives the answer, so it may give it in colour too;
   *  the `"posture"` card drops it (`BUBBLE_POSTURE_BORDER`). */
  accent: string;
  /** The citation, RETRIEVED — equal to `CONTROLLER_GESTURES[i].lawRef`
   *  (ADR-002, pinned by `controller-bubble.test.ts`). */
  lawRef: string;
}

/**
 * ── 2026-09-22 · FOUNDER RULING «SHORT CARD» (sc-sig-controller-postures:ef0e821c)
 *
 * „The controller's speech billboard is five lines of tiny multi-coloured text,
 * unreadable at native phone size." The ladder above fixed L2+ and left L1 on
 * the six-line card — headline, pose, «Минава:», «Спира:», «Предимството…», law
 * — in five inks, because L1 is «Пълна помощ» and must give the answer. The
 * ruling keeps that (the 2026-09-20 ruling: L1 GIVES THE ANSWER) and changes
 * its shape: posture name, ONE short line of who goes / who stops, and the law
 * reference. Three lines, two inks plus the accent.
 *
 * WHAT LEFT THE CARD, and where it still lives. `headlineBg`, `poseBg`, `goBg`,
 * `stopBg` and `priorityBg` were painted only here; with the card short they
 * would be exported copy nothing reads — the dead-data class this tree has
 * learned to refuse — so they are removed, not parked. Their long forms stay in
 * the authored bank (`CONTROLLER_GESTURES`, which the lessons and debrief own),
 * and the priority clause — the officer outranks the lamp — stays on the card
 * as its citation, ЗДвП чл. 7, and in the three drills' `instructionsBg`.
 *
 * L2 («Частична помощ», `"posture"`) and L3+ (`"off"`) are NOT touched: they
 * never painted the six-line card, and the short card is `"full"` only.
 */
export const CONTROLLER_BUBBLES: readonly ControllerBubbleCopy[] = [
  {
    posture: "sideProfile",
    postureNameBg: "СТРАНИЧЕН ПРОФИЛ",
    // goBg «Минаваш ТИ и всички по твоята посока…» + stopBg «Спира напречното
    // направление…».
    answerBg: "Минаваш ТИ, напречното спира",
    accent: "#3ddc84",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "chestOrBack",
    postureNameBg: "ГЪРДИ ИЛИ ГРЪБ",
    // stopBg «Спираш ТИ, преди стоп-линията…» + goBg «Минава напречното
    // направление…».
    answerBg: "Спираш ТИ, напречното минава",
    accent: "#ff6a5a",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "armRaised",
    postureNameBg: "ВДИГНАТА РЪКА",
    // stopBg «Спират ВСИЧКИ посоки…» + goBg «Никой. Вдигнатата ръка не пуска
    // никого…».
    answerBg: "Спират ВСИЧКИ, никой не минава",
    accent: "#ffb020",
    lawRef: "ППЗДвП сигнали на регулировчика",
  },
];

/** Index into CONTROLLER_BUBBLES, by posture (the renderer's hot path picks
 *  by index so the per-frame read is an array lookup, never a find). */
export const BUBBLE_SIDE_PROFILE = 0;
export const BUBBLE_CHEST_OR_BACK = 1;
export const BUBBLE_ARM_RAISED = 2;
