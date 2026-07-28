/**
 * The ask chips — the founder's „with buttons stop ask", made concrete.
 *
 * WHY CHIPS AND NOT JUST A TEXT BOX. Three reasons, and only the third is
 * about the student:
 *
 *  - GROUNDING. A chip is a known string with a known intent, so the material
 *    that answers it is decided before the student ever presses it. That means
 *    a chip's answer can be VERIFIED by a test — a guarantee free text can
 *    never give.
 *  - COST. A chip whose answer is an authored material is $0 and instant. A
 *    board-control chip („Покажи го пак") is a player command and never
 *    touches the model at all. The bill only moves for genuinely new questions.
 *  - IT TEACHES WHAT CAN BE ASKED. A 17-year-old facing an empty box asks
 *    nothing. Facing „Какво ми струва това на изпита?" they press it.
 *
 * PURE — no repo, no network. The caller says what is in scope for the beat.
 */

import { CHIP_LABEL_BG } from "./frames";
import type { AskChip, BoardSpec } from "./types";

export interface ChipScope {
  beatId: string;
  /** The beat has a concept whose summary can answer „защо е така". */
  hasConcept: boolean;
  /** The beat cites a rule-catalog code — unlocks how / exam / opinion. */
  hasRule: boolean;
  /** Any Tier-1 material of this beat carries a lawRef. */
  hasLaw: boolean;
  board: BoardSpec | null;
}

/**
 * Build the chips for a beat.
 *
 * ORDER MATTERS AND IS DELIBERATE: the question a student actually has comes
 * first („защо"), the exam consequence second (it is the thing they are
 * frightened of and it is what makes them press), the teacher's opinion third
 * (the founder's explicit ask), the citation fourth. Board controls sit apart
 * because they are free and instant, and the free-text chip is always last so
 * it reads as the escape hatch rather than the default.
 */
export function chipsForBeat(scope: ChipScope): AskChip[] {
  const chips: AskChip[] = [];

  if (scope.hasConcept || scope.hasRule) {
    chips.push({
      kind: "ask",
      id: `${scope.beatId}:why`,
      labelBg: CHIP_LABEL_BG.why,
      intent: "why",
    });
  }
  if (scope.hasRule) {
    chips.push({
      kind: "ask",
      id: `${scope.beatId}:how`,
      labelBg: CHIP_LABEL_BG.how,
      intent: "how",
    });
    chips.push({
      kind: "ask",
      id: `${scope.beatId}:exam`,
      labelBg: CHIP_LABEL_BG.exam,
      intent: "exam",
    });
  }
  // „А ти какво мислиш?" — the founder asked for this by name. It is offered
  // wherever the teacher has an AUTHORED stance to offer (a rule's corrective
  // is a stance about driving) and nowhere else, because the alternative is a
  // model improvising an opinion about Bulgarian law, which is the one thing
  // ADR-002 exists to prevent. See interrupt.ts for how it is answered.
  if (scope.hasRule) {
    chips.push({
      kind: "ask",
      id: `${scope.beatId}:opinion`,
      labelBg: CHIP_LABEL_BG.opinion,
      intent: "opinion",
    });
  }
  if (scope.hasLaw) {
    chips.push({
      kind: "ask",
      id: `${scope.beatId}:law`,
      labelBg: CHIP_LABEL_BG.law,
      intent: "law",
    });
  }

  if (scope.board !== null && scope.board.mode !== "sign") {
    chips.push({
      kind: "board",
      id: `${scope.beatId}:replay`,
      labelBg: CHIP_LABEL_BG.replay,
      command: "replay",
    });
    // `slower` is in the BoardCommand contract but is NOT offered yet: the 2D
    // canvas replay plays at ~1x and exposes no rate, so a chip for it would
    // be a button that does nothing. The command stays in the type because the
    // classroom lane's board is where a rate control belongs; the chip appears
    // the day that board can honour it. Shipping the button first is how a
    // classroom acquires its first piece of furniture that lies.
    if (scope.board.mode === "compare") {
      chips.push({
        kind: "board",
        id: `${scope.beatId}:show-correct`,
        labelBg: CHIP_LABEL_BG.showCorrect,
        command: "show-correct",
      });
    }
  }

  chips.push({
    kind: "free",
    id: `${scope.beatId}:free`,
    labelBg: CHIP_LABEL_BG.free,
  });
  return chips;
}
