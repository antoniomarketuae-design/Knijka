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
 * lesson copy use. These strings are its caption: the same three answers, cut
 * to what stays readable on a billboard 30–60 m away in a moving cockpit.
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

export interface ControllerBubbleCopy {
  posture: ControllerBubblePosture;
  /** The verdict for the driver reading it, in two or three words. */
  headlineBg: string;
  /** What the student is physically looking at. */
  poseBg: string;
  /** Who may go. */
  goBg: string;
  /** Who must stop. */
  stopBg: string;
  /**
   * WHOSE PRIORITY IT IS — his third question, and the one the card was
   * missing (B41, 2026-08-10).
   *
   * „who is he letting go" and „whos turn its to pass" are not the same
   * question and the drill is built on the difference: `goBg` says which
   * direction is moving, this says who OUTRANKS whom, and on every one of the
   * three postures the answer turns on the same clause — the officer beats the
   * lamp (ЗДвП чл. 7). Without it the card can be read as „the green light and
   * the officer agree", which is exactly the belief the authored mistake
   * `mistake-barge-chest` grades as an опасна грешка. The authored long form is
   * `CONTROLLER_GESTURES[i].priorityBg`; this is that answer cut to a line.
   */
  priorityBg: string;
  /** Accent colour for the headline + border: red = spri, green = minavaj,
   *  amber = vnimanie. */
  accent: string;
  lawRef: string;
}

export const CONTROLLER_BUBBLES: readonly ControllerBubbleCopy[] = [
  {
    posture: "sideProfile",
    headlineBg: "МИНАВАШ ТИ",
    /**
     * THE ARMS THE CAPTION NAMED WERE NEVER THE ARMS ON SCREEN (sweep161,
     * `sc-signal-controller/mobile-right/04-t076s.png`).
     *
     * This line shipped as „Виждаш го СТРАНИЧНО, ръцете долу". Cropped at 2×
     * out of that frame the officer holds BOTH arms straight out horizontally,
     * and he has to: `TrafficLayer.officerArmTarget` sets
     * `lat = ±OFC_ARM_OUT_RAD` (1.47 rad) for every posture that is not
     * „внимание", and `OFC_ARM_FWD_RAD` (0.44) was added by FR-OFC-ARMS
     * precisely so those arms have a silhouette when the driver sees the
     * PROFILE — i.e. the engine spent a fix making the arms visible in exactly
     * the pose whose caption told the student they would be down.
     *
     * THE MESH IS RIGHT AND THE COPY WAS WRONG, which is why the repair is
     * here and not in the renderer. ППЗДвП, retrieved verbatim in
     * `templates-signals.ts`: „ръка или ръце, протегнати хоризонтално встрани
     * — след като е подал този сигнал, регулировчикът МОЖЕ да свали ръката или
     * ръцете си". Extended is the signal; lowered is a permitted follow-on.
     * A caption may name either, but it may not name the one the frame is not
     * showing.
     *
     * SO WHY DOES THE NEW LINE NOT SAY „ръцете настрани" EITHER? Because the
     * arms are not the discriminator, and naming them would hand the student
     * the wrong cue in the more dangerous direction. `officerArmTarget` does
     * not take a posture — the SAME officer with the SAME arms out is
     * „минавай" for the drivers at his shoulders and „спри" for the drivers at
     * his chest and back. A student who learns „arms out = go" reads the halt
     * posture as permission, which is `mistake-barge-chest`. The law puts it
     * on the shoulder, not the limb — „за водачите, които се намират срещу
     * лявото или дясното рамо" — so the line names the shoulder and keeps the
     * СТРАНИЧНО / анфас pairing with `chestOrBack`'s pose line, which is the
     * contrast the drill is actually built on.
     *
     * 37 characters against the 40-char billboard cap.
     * `controller-bubble.test.ts` drives `officerArmTarget` and fails this
     * caption if it ever describes an arm state the renderer does not hold.
     */
    poseBg: "Виждаш го СТРАНИЧНО — срещу рамото му",
    goBg: "Минава: ти и цялата твоя посока",
    stopBg: "Спира: напречното направление",
    priorityBg: "Предимството е ТВОЕ — дори на червено",
    accent: "#3ddc84",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "chestOrBack",
    headlineBg: "СПРИ",
    poseBg: "Обърнат е с ГЪРДИ или ГРЪБ към теб",
    goBg: "Минава: напречното направление",
    stopBg: "Спираш: ти, преди стоп-линията",
    priorityBg: "Предимството НЕ е твое — и на зелено",
    accent: "#ff6a5a",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "armRaised",
    headlineBg: "ВНИМАНИЕ",
    poseBg: "Ръката му е ВДИГНАТА нагоре",
    goBg: "Минава: никой — това не е „тръгвай“",
    stopBg: "Спират: всички посоки — сменя фазите",
    priorityBg: "Предимството не е ничие — чакат всички",
    accent: "#ffb020",
    lawRef: "ППЗДвП сигнали на регулировчика",
  },
];

/** Index into CONTROLLER_BUBBLES, by posture (the renderer's hot path picks
 *  by index so the per-frame read is an array lookup, never a find). */
export const BUBBLE_SIDE_PROFILE = 0;
export const BUBBLE_CHEST_OR_BACK = 1;
export const BUBBLE_ARM_RAISED = 2;
