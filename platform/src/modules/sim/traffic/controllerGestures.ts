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
 * three questions he actually asked — what am I looking at, who goes, who
 * stops — and carries the article that makes it law. ADR-002: `lawRef` is
 * RETRIEVED from the authored `CONTROLLER_GESTURES` (pinned by that test),
 * never recalled by the model.
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
  /** Accent colour for the headline + border: red = spri, green = minavaj,
   *  amber = vnimanie. */
  accent: string;
  lawRef: string;
}

export const CONTROLLER_BUBBLES: readonly ControllerBubbleCopy[] = [
  {
    posture: "sideProfile",
    headlineBg: "МИНАВАШ ТИ",
    poseBg: "Виждаш го СТРАНИЧНО, ръцете долу",
    goBg: "Минава: ти и цялата твоя посока",
    stopBg: "Спира: напречното направление",
    accent: "#3ddc84",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "chestOrBack",
    headlineBg: "СПРИ",
    poseBg: "Обърнат е с ГЪРДИ или ГРЪБ към теб",
    goBg: "Минава: напречното направление",
    stopBg: "Спираш: ти, преди стоп-линията",
    accent: "#ff6a5a",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "armRaised",
    headlineBg: "ВНИМАНИЕ",
    poseBg: "Ръката му е ВДИГНАТА нагоре",
    goBg: "Минава: никой — това не е „тръгвай“",
    stopBg: "Спират: всички посоки — сменя фазите",
    accent: "#ffb020",
    lawRef: "ППЗДвП сигнали на регулировчика",
  },
];

/** Index into CONTROLLER_BUBBLES, by posture (the renderer's hot path picks
 *  by index so the per-frame read is an array lookup, never a find). */
export const BUBBLE_SIDE_PROFILE = 0;
export const BUBBLE_CHEST_OR_BACK = 1;
export const BUBBLE_ARM_RAISED = 2;
