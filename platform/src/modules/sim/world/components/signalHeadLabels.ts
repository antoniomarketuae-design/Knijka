/**
 * WHAT A HEAD THE STUDENT CANNOT READ HAS TO SAY FOR ITSELF — doc 87 B35.
 *
 * THE DEFECT, measured and photographed before a line of this was written. On
 * «Загаснал светофар» every lens on the head IS unlit — the 2026-08-03 look
 * wave sampled all three at 12× (red `#841811`, amber `#815609`, green
 * `#1b692a`) against the same head on the live drill (`#841710`, `#815507`,
 * `#67b967`) and proved that red and amber are pixel-identical between a dead
 * head and a working one. The lamps are correct. The READING is not: a dead
 * head and a live head both show three coloured discs, the only difference is
 * that one lens on the live head is brighter, and at native 1:1 from the stop
 * line the whole head is about 8 × 30 px. A student cannot tell «загаснал»
 * from «работещ», which is the founder's original complaint in its true form.
 *
 * WHY THIS IS NOT A LENS-COLOUR CHANGE. Doc 86 L2 deliberately raised
 * `LAMP_OFF` from `on × 0.1` to a dark-tinted-glass read because a black head
 * had NO read at all — that is the bug he filed as „no traffic light exists".
 * Darkening the lenses again re-opens it. What is missing is not contrast, it
 * is an AFFORDANCE: something that says „this one is off" in words, on the
 * object, at the distance where slowing down is still possible.
 *
 * WHY THE SAME TREATMENT GOES TO МИГАЩО ЖЪЛТО. `amberFlashOff` is, by
 * construction, every lens unlit — the same three discs — so half of every
 * blink cycle is indistinguishable from загаснал, and the register asks for
 * this row and `sc-signal-flashing` in the same sentence. One label kind
 * spans the whole blink so the caption cannot flicker at 2 Hz.
 *
 * ADR-002 — THE LAW IS RETRIEVED, NOT RECALLED. Both captions cite **ЗДвП
 * чл. 48**, which the corpus holds verbatim: „На кръстовище на равнозначни
 * пътища водачът на пътно превозно средство е длъжен да пропусне пътните
 * превозни средства, които се намират или приближават от дясната му страна…"
 * That is the правило на дясното the caption states, and
 * `__tests__/world-label.test.ts` re-reads it out of `content/law/acts` on
 * every run rather than trusting this comment. The step from „тъмен светофар"
 * to „равнозначно кръстовище" itself lives in ППЗДвП, which the corpus does
 * NOT hold — so it is stated as the rule with no article number, which is the
 * founder's standing ruling, and never as an invented citation.
 *
 * The wording is the lesson's own, not new copy: `templates-signals.ts`
 * instruction 2 on each drill already says „Тъмен светофар означава
 * равнозначно кръстовище… правилото на дясното" and „Мигащото жълто не е
 * зелено… важи правилото на дясното". The caption is that sentence, put where
 * he is looking.
 */
import type { SignalLampState } from "../../contracts";
import type { WorldLabelCopy } from "./worldLabel";

/** The two head states a driver cannot read off the lenses. */
export type SignalLabelKind = "dark" | "amberFlash";

export const SIGNAL_HEAD_LABELS: Readonly<Record<SignalLabelKind, WorldLabelCopy>> = {
  dark: {
    headlineBg: "ЗАГАСНАЛ СВЕТОФАР",
    line1Bg: "Кръстовището е равнозначно",
    line2Bg: "Пропусни идващия ОТДЯСНО",
    lawRef: "ЗДвП чл. 48 · правилото на дясното",
    // Cold grey-blue: the head is DEAD. An amber accent here would say
    // „caution light", which is the other drill.
    accent: "#c3d3e6",
  },
  amberFlash: {
    headlineBg: "МИГАЩО ЖЪЛТО",
    line1Bg: "Светофарът не регулира — внимание",
    line2Bg: "Пропусни идващия ОТДЯСНО",
    lawRef: "ЗДвП чл. 48 · правилото на дясното",
    // The colour of the lens the student is being told to read.
    accent: "#ffc23d",
  },
};

/**
 * Which caption a head in this state owes the driver — `null` for every state
 * the lenses already say out loud.
 *
 * Red, amber and green need no caption: the lens IS the message, and a card
 * over a working head would be noise on ~150 scenarios. `redYellow` is a lit,
 * legible state too. Only the two unreadable ones are labelled.
 */
export function signalLabelKindFor(state: SignalLampState): SignalLabelKind | null {
  if (state === "dark") return "dark";
  if (state === "amberFlashOn" || state === "amberFlashOff") return "amberFlash";
  return null;
}

/**
 * Beyond this the caption is dropped rather than grown further.
 *
 * 75 m is one and a half times the 45 m at which the drill's own instruction
 * card says «намали отрано», and it is short of the 95 m at which the staged
 * conflict car is still parked — so a second junction further up a boulevard
 * never captions itself over the one the student is driving into.
 */
export const SIGNAL_LABEL_MAX_DIST_M = 75;
