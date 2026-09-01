import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capBg,
  clutchHeldObjBg,
  clutchObjBg,
  gearDownActBg,
  gearDownWithBg,
  gearUpActBg,
  gearUpWithBg,
  hintInputFor,
  leverActBg,
  parkingBrakeActBg,
  starterActBg,
  starterWithBg,
  STALL_RESTART_LABEL_BG,
  TOUCH_SHEET_LOCATOR_BG,
  type HintInput,
} from "@/modules/sim/hud";
import type { DrivelineRejection, DrivelineSnapshot, TransmissionMode } from "@/modules/sim/vehicle";
import { rejectionHint, stuckStartHint, transmissionSwitchHint } from "./LessonPlayShell";

/**
 * =============================================================================
 * THE HINTS A PHONE CAN OBEY — doc 91 §J-WAVE-4 item 2, 2026-08-12.
 *
 * `transmissionSwitchHint` fired the moment a student chose «Напреднал» and
 * said «задръж съединителя и включи първа (Z + ])… после отпускай съединителя
 * плавно». On a phone that is not an instruction, it is a dead end — and the
 * engine then graded him for not doing it. THEO-4 is founder-ratified: the
 * student is owed the reasoning, and reasoning he cannot act on is a verdict
 * with decoration on it.
 *
 * WHY THIS FILE IS NOT „grep for Z". Three checks in this project were caught
 * this week measuring something weaker than the requirement they were named
 * for, so this one states the requirement itself, in four parts:
 *
 *   1. THE CELLS ARE REAL. Every touch face this vocabulary names is read back
 *      out of the SHIPPED `TouchControls.tsx`. A renamed cell fails here rather
 *      than on a student's screen — the exact failure the drivetrain pad's
 *      reverse promise was (`touchLabels.test.ts`).
 *   2. NO TOUCH SENTENCE NAMES A KEY OR A MOUSE, over the FULL cross-product of
 *      every hint the shell can emit (rejection × reason × selector × gearbox,
 *      stuck-reason × gearbox, tier-switch × selector) — not a sampled few.
 *   3. …AND THE KEYBOARD ONES STILL DO. The negative control, because every
 *      assertion in (2) is a `not.toContain` and those pass just as happily
 *      against an empty string.
 *   4. SAME DECISION, NOT A SHORTER CARD. For every hint, blanking out the
 *      control phrases must leave the keyboard and the touch text IDENTICAL.
 *      That is „the card teaches the same thing in the reader's own terms"
 *      expressed as an equality a machine can check — a touch variant that
 *      dropped a clause, softened an instruction or lost the WHY fails it.
 * =============================================================================
 */

const INPUTS: HintInput[] = ["keyboard", "touch"];
const BOXES: TransmissionMode[] = ["automatic", "manual"];

/** Anything a phone does not have. „с I" is caught by the bare-key rule. */
const KEYBOARD_TOKENS = [
  "клавиш",
  "мишк",
  "щракн",
  "Щракн",
  "(Z)",
  "Z + ",
  "Space",
  "десен бутон",
];
/** A bare key cap standing alone as an instruction: „с ]", „с [", „с I". */
const BARE_KEY_RE = /(^|[\s(])[\[\]]($|[\s.,)])|(^|\s)с\s+[A-Z](\s|[.,)]|$)/;

// ── (1) the faces, read out of the shipped touch layer ──────────────────────

const TOUCH_CONTROLS_SRC = readFileSync(
  join(process.cwd(), "src/components/sim/TouchControls.tsx"),
  "utf8",
);

describe("the touch names are the faces that are actually on the glass", () => {
  // The strip cells (`textBg=`) plus the rail button that reveals them
  // (`wordBg=`). Quoted exactly as the vocabulary prints them, minus the
  // Bulgarian quotation marks the copy wraps them in.
  const FACES = ["ДВИГ", "РЪЧНА", "СЪЕД", "◄P", "M►", "D►"];

  // A quoted literal rather than `textBg="X"`: the stepper's up-cell is a
  // ternary (`textBg={transmission === "manual" ? "M►" : "D►"}`) precisely
  // because the face depends on the gearbox — which is the same fact this
  // vocabulary has to track.
  it.each(FACES)("«%s» is a rendered cell face in TouchControls.tsx", (face) => {
    expect(TOUCH_CONTROLS_SRC).toContain(`"${face}"`);
  });

  it("…and «Кола», the station the locator sentence sends the student to", () => {
    // ⚠ `wordBg` → `captionBg` on 2026-08-13: «Кола» left the top rail (a
    // word-button 110.7 mm from either thumb) for the lowest station on the
    // right-hand arc (a ghost glyph with its word under it, ~27 mm). The FACE
    // is unchanged, which is what this row is really about — the sentence names
    // a control the student can see.
    expect(TOUCH_CONTROLS_SRC).toContain('captionBg="Кола"');
    expect(TOUCH_SHEET_LOCATOR_BG).toContain("Кола");
    // …and the sentence must not still be pointing at the top of the screen.
    expect(TOUCH_SHEET_LOCATOR_BG).not.toContain("горе");
  });

  it("every face the vocabulary can print appears in that list", () => {
    // The negative control for the check above: if a new phrase starts naming
    // a seventh cell, FACES must grow or this fails. Collected from the
    // vocabulary itself rather than from a hand-kept copy of it.
    const printed = new Set<string>();
    for (const box of BOXES) {
      for (const s of [
        clutchObjBg("touch"),
        clutchHeldObjBg("touch"),
        starterActBg("touch"),
        starterWithBg("touch"),
        parkingBrakeActBg("touch"),
        gearUpWithBg("touch", box),
        gearUpActBg("touch", box),
        gearDownWithBg("touch"),
        gearDownActBg("touch"),
        leverActBg("touch"),
      ]) {
        for (const m of s.matchAll(/„([^“]+)“/g)) printed.add(m[1] as string);
      }
    }
    expect([...printed].sort()).toEqual([...FACES].sort());
  });
});

// ── the hint corpus: every sentence the shell can put on a screen ───────────

interface HintCase {
  id: string;
  /** Manual-only hints must never name «D►»; automatic ones never «СЪЕД». */
  box: TransmissionMode;
  by: (input: HintInput) => string;
}

function snapOf(
  selector: DrivelineSnapshot["selector"],
  transmission: TransmissionMode,
): DrivelineSnapshot {
  return {
    transmission,
    engineOn: true,
    stalled: false,
    selector,
    manualGear: 5,
    clutchDown: false,
    parkingBrakeOn: false,
    hazardsOn: false,
    wipersOn: false,
    fogLightsOn: false,
    hornOn: false,
    gearLabel: selector,
  };
}

/**
 * REACHABLE STATES ONLY, and the reachability is read off `driveline.ts`
 * rather than assumed:
 *   · `startRejected/clutch`  — `toggleEngine()` emits it inside
 *     `if (this.transmission === "manual")`; the automatic branch below it
 *     emits `selector` instead. So the two start refusals are one per gearbox.
 *   · `shiftRejected/clutch`  — `trySelect()`: `intoGear && transmission ===
 *     "manual" && …`. Manual only.
 *   · selector D never exists on a manual gate (P—R—N—M1…M5) and selector M
 *     never on an automatic (P—R—N—D).
 * A corpus that included the impossible ones would be measuring sentences no
 * student can reach — and would have forced the vocabulary to name «СЪЕД» on a
 * car that does not render it.
 */
const SELECTORS = { automatic: ["P", "R", "N", "D"], manual: ["P", "R", "N", "M"] } as const;

const CASES: HintCase[] = [];
for (const box of BOXES) {
  const startReason = box === "manual" ? "clutch" : "selector";
  const start: DrivelineRejection = { kind: "startRejected", reason: startReason };
  CASES.push({
    id: `rejection/startRejected/${startReason}/${box}`,
    box,
    by: (i) => rejectionHint(start, snapOf("P", box), i).explanationBg,
  });
  const shiftReasons =
    box === "manual" ? (["speed", "clutch", "endOfGate"] as const) : (["speed", "endOfGate"] as const);
  for (const reason of shiftReasons) {
    for (const selector of SELECTORS[box]) {
      CASES.push({
        id: `rejection/shift/${reason}/${selector}/${box}`,
        box,
        by: (i) =>
          rejectionHint({ kind: "shiftRejected", reason }, snapOf(selector, box), i)
            .explanationBg,
      });
    }
  }
  for (const reason of ["engineOff", "stalled", "parked", "neutral", "parkingBrake"] as const) {
    CASES.push({
      id: `stuckStart/${reason}/${box}`,
      box,
      by: (i) => stuckStartHint(reason, box, i).explanationBg,
    });
  }
  for (const to of SELECTORS[box]) {
    // …AND THE GEARBOX THE LESSON ITSELF OPENED ON (sc-vp-stall:95df9139).
    // `transmissionSwitchHint` gained a fourth axis, so the corpus gains it
    // too — a new dimension left out of the cross-product is exactly the
    // "sampled few" this file was written against. All four combinations are
    // reachable: `LessonSpec.openingTier` is authored on sc-vp-stall and
    // absent (→ automatic) on the other 166 templates, and a student can move
    // the tier either way on either kind of lesson.
    for (const lessonBox of BOXES) {
      CASES.push({
        id: `tierSwitch/${to}/${box}/lesson-${lessonBox}`,
        box,
        by: (i) => transmissionSwitchHint(box, to, i, lessonBox).explanationBg,
      });
    }
  }
}

describe("the hint corpus is the whole reachable cross-product, not a sample", () => {
  it("covers every hint the shell can emit", () => {
    // manual   1 start + 3 reasons × 4 selectors + 5 stuck + 4 tier × 2 lesson = 26
    // automatic 1 start + 2 reasons × 4 selectors + 5 stuck + 4 tier × 2 lesson = 22
    // Was 40 before the lesson-gearbox axis; the extra 8 are the tier cases
    // re-run for a lesson whose own car is a manual.
    expect(CASES).toHaveLength(48);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });
});

// ── (2) no touch sentence names a key, a mouse or a right-click ─────────────

describe("§C2/THEO-4 — a phone student is never told to press a key", () => {
  it.each(CASES.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const touch = c.by("touch");
    for (const token of KEYBOARD_TOKENS) expect(touch).not.toContain(token);
    expect(touch).not.toMatch(BARE_KEY_RE);
  });

  it("…and never names a cell that is not on the tier it is speaking to", () => {
    // The cross-wiring this file exists to catch: «D►» is the automatic's
    // stepper face and «M►» the manual's, and `TouchControls` renders exactly
    // one of them. A hint that named the wrong one would pass every check
    // above and still point at a button that is not there.
    for (const c of CASES) {
      const touch = c.by("touch");
      if (c.box === "manual") expect(touch).not.toContain("D►");
      else {
        expect(touch).not.toContain("M►");
        // An automatic has no clutch, so «СЪЕД» is not rendered on that tier.
        expect(touch).not.toContain("СЪЕД");
      }
    }
  });

  it("…and locates the strip whenever it names a cell inside it", () => {
    for (const c of CASES) {
      const touch = c.by("touch");
      const namesCell = /„(ДВИГ|РЪЧНА|СЪЕД|◄P|M►|D►)“/.test(touch);
      expect(touch.includes(TOUCH_SHEET_LOCATOR_BG)).toBe(namesCell);
      // …and the keyboard reader is never sent to a strip he does not have.
      expect(c.by("keyboard")).not.toContain(TOUCH_SHEET_LOCATOR_BG);
    }
  });
});

// ── (3) the negative control: the keyboard cards did NOT go quiet ───────────

describe("the key names survive for the reader who has keys", () => {
  it("every hint that names a touch cell still names its key or its click", () => {
    let checked = 0;
    for (const c of CASES) {
      if (!/„(ДВИГ|РЪЧНА|СЪЕД|◄P|M►|D►)“/.test(c.by("touch"))) continue;
      checked += 1;
      const kb = c.by("keyboard");
      expect(
        KEYBOARD_TOKENS.some((t) => kb.includes(t)) || BARE_KEY_RE.test(kb),
        `${c.id} lost its keyboard wording: ${kb}`,
      ).toBe(true);
    }
    // Guards the loop itself: if the corpus stopped producing cell-naming
    // hints, every assertion above would vacuously pass.
    expect(checked).toBeGreaterThan(30);
  });

  it("«Напреднал»'s opening card still teaches „Z + ]“ to a keyboard", () => {
    // The single worst string in the audit, both halves of it.
    const kb = transmissionSwitchHint("manual", "N", "keyboard", "manual").explanationBg;
    expect(kb).toContain("съединителя (Z)");
    expect(kb).toContain("с клавиш ]");
    const touch = transmissionSwitchHint("manual", "N", "touch", "manual").explanationBg;
    expect(touch).toContain("задръж „СЪЕД“");
    expect(touch).toContain("включи първа с „M►“");
  });
});

// ── the drill that loses its own gearbox — sc-vp-stall:95df9139 ─────────────

describe("a manual drill says what the tier pill just took away", () => {
  // The residual half of the finding. `start.openingTier` fixed the OPENING
  // (the car arrives manual and the stall is reachable); nothing covered the
  // student who taps „Нормален" afterwards. `Driveline.update` gates the stall
  // behind `transmission === "manual"`, so from that tap on the engine cannot
  // stall — the fault the lesson exists to teach stops existing, silently.
  const THE_LOSS_BG = "без съединител двигателят изобщо не може да загасне";

  it.each(["D", "N"] as const)("returning to an automatic in %s explains the cost", (to) => {
    for (const input of INPUTS) {
      const manualLesson = transmissionSwitchHint("automatic", to, input, "manual");
      expect(manualLesson.explanationBg).toContain(THE_LOSS_BG);
      expect(manualLesson.titleBg).toBe("Този урок е с ръчна кутия");
      // …and it is not a bare state change: the WHY and the way back are both
      // in the card (THEO-4).
      expect(manualLesson.explanationBg).toContain("Смени нивото обратно");

      // The negative control — every other lesson's card is untouched, which
      // is what makes this an addition rather than a rewrite of 166 rungs.
      const normalLesson = transmissionSwitchHint("automatic", to, input, "automatic");
      expect(normalLesson.explanationBg).not.toContain(THE_LOSS_BG);
      expect(normalLesson.titleBg).toBe(to === "D" ? "Скоростният лост е на D" : "Скоростният лост е на N");
      // The car half is shared verbatim; the drill clause is appended to it.
      expect(manualLesson.explanationBg.startsWith(
        normalLesson.explanationBg.replace(TOUCH_SHEET_LOCATOR_BG, ""),
      )).toBe(true);
    }
  });

  it("…and switching INTO the manual is unchanged — he is getting the car back", () => {
    for (const to of ["N", "M"] as const) {
      for (const input of INPUTS) {
        expect(transmissionSwitchHint("manual", to, input, "manual")).toEqual(
          transmissionSwitchHint("manual", to, input, "automatic"),
        );
      }
    }
  });
});

// ── (4) SAME DECISION: blank the controls and the two texts are identical ───

/** Every (keyboard, touch) phrase pair the vocabulary can produce. */
function phrasePairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    [clutchObjBg("keyboard"), clutchObjBg("touch")],
    [clutchHeldObjBg("keyboard"), clutchHeldObjBg("touch")],
    [starterActBg("keyboard"), starterActBg("touch")],
    [starterWithBg("keyboard"), starterWithBg("touch")],
    [parkingBrakeActBg("keyboard"), parkingBrakeActBg("touch")],
    [gearDownWithBg("keyboard"), gearDownWithBg("touch")],
    [gearDownActBg("keyboard"), gearDownActBg("touch")],
    [leverActBg("keyboard"), leverActBg("touch")],
  ];
  for (const box of BOXES) {
    pairs.push([gearUpWithBg("keyboard", box), gearUpWithBg("touch", box)]);
    pairs.push([gearUpActBg("keyboard", box), gearUpActBg("touch", box)]);
  }
  // Sentence-initial forms too — `capBg` is how a phrase opens a clause.
  for (const [k, t] of [...pairs]) pairs.push([capBg(k), capBg(t)]);
  // Longest first: „съединителя натиснат (Z)" contains „съединителя (Z)"'s
  // stem, and a short-first pass would shred it.
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

/** The sentence with every control phrase replaced by one placeholder. */
function skeleton(text: string, which: 0 | 1): string {
  let out = text;
  for (const pair of phrasePairs()) out = out.split(pair[which]).join("⟦⟧");
  return out.replace(TOUCH_SHEET_LOCATOR_BG, "").trim();
}

describe("same decision, not a shorter card", () => {
  it.each(CASES.map((c) => [c.id, c] as const))("%s says the same thing", (_id, c) => {
    expect(skeleton(c.by("touch"), 1)).toBe(skeleton(c.by("keyboard"), 0));
  });

  it("the skeletons are real sentences, not everything blanked to ⟦⟧", () => {
    // Without this, a vocabulary whose phrases were "" would make every
    // assertion above trivially true.
    // 24, not 30: the shortest hint in the corpus is „Нагоре няма повече
    // предавки." (gate-m, 28 chars), which names no control at all.
    for (const c of CASES) {
      const s = skeleton(c.by("keyboard"), 0);
      expect(s.replace(/⟦⟧/g, "").trim().length).toBeGreaterThan(24);
    }
  });

  it("…and the two texts really do DIFFER before blanking", () => {
    const differing = CASES.filter((c) => c.by("touch") !== c.by("keyboard"));
    expect(differing.length).toBeGreaterThan(30);
  });
});

// ── THE LABELS A SCREEN-READER USER CANNOT SEE ARE WRONG ────────────────────

const SHELL_SRC = readFileSync(
  join(process.cwd(), "src/components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);
const SCENE_SRC = readFileSync(
  join(process.cwd(), "src/components/sim/LessonScene.tsx"),
  "utf8",
);

describe("aria — a label that was true when written and is false now", () => {
  it("the stall telltale stops naming Z + I on a device with no Z", () => {
    expect(STALL_RESTART_LABEL_BG.keyboard).toContain("(Z + I)");
    const touch = STALL_RESTART_LABEL_BG.touch;
    for (const token of KEYBOARD_TOKENS) expect(touch).not.toContain(token);
    // …and it names the two controls that DO get the car started again, plus
    // where they live — a screen-reader user cannot see the ⚙ strip either.
    expect(touch).toContain("„ДВИГ“");
    expect(touch).toContain("„СЪЕД“");
    expect(touch).toContain("„Кола“");
  });

  it("the lesson's own gearbox reaches the card, or the sentence is dead code", () => {
    // sc-vp-stall:95df9139. `transmissionSwitchHint` can now say what the DRILL
    // lost, and a hint function that is correct but called with the wrong
    // fourth argument is the dead predicate this project keeps measuring. Two
    // links, both greppable: the shell derives the lesson's box the way the
    // scene seeds the tier, and hands that value to the hint.
    expect(SHELL_SRC).toContain(
      "transmissionModeFor(lesson.openingTier ?? DEFAULT_DIFFICULTY)",
    );
    expect(SHELL_SRC).toContain(
      "transmissionSwitchHint(transmission, movedSelectorTo, hintInput, lessonBox)",
    );
    // …and the scene really does forward the event that triggers it, only for
    // a lever the switch moved.
    expect(SCENE_SRC).toContain(
      'event.kind === "transmissionChanged" && event.movedSelectorTo !== undefined',
    );
  });

  it("…and the shell actually passes the input to the cluster, both mounts", () => {
    // The half a pure unit test cannot see: a correct label function wired to
    // nothing is the defect, not the fix.
    expect(SHELL_SRC.match(/<StatusDashboard/g) ?? []).toHaveLength(2);
    expect(SHELL_SRC.match(/input=\{hintInput\}/g) ?? []).toHaveLength(2);
  });

  it("the drivetrain pad's reverse promise is still WIRED, not just correct", () => {
    // `touchLabels.test.ts` proves `driveAxisLabelBg` picks the right sentence.
    // Nothing proved the flag reaches it — and the prop defaults to `true`, so
    // dropping the attribute would silently restore „пусни и натисни пак
    // надолу за назад" on all 158 exam rungs with every unit test still green.
    expect(SCENE_SRC).toContain("const reverseAssistEnabled = lesson.examMode !== true;");
    expect(SCENE_SRC).toMatch(
      /<TouchControls[\s\S]{0,600}?reverseAssistEnabled=\{reverseAssistEnabled\}/,
    );
    // …and the pad reads the derived sentence rather than a literal.
    expect(TOUCH_CONTROLS_SRC).toContain(
      "aria-label={driveAxisLabelBg(inReverse, gestureLive, transmission)}",
    );
    expect(TOUCH_CONTROLS_SRC).toContain(
      "const gestureLive = reverseGestureLive(reverseAssistEnabled, transmission);",
    );
  });
});

describe("hintInputFor — one predicate, no second convention", () => {
  it("follows hasTouchScreen(), which is what mounts TouchControls", () => {
    expect(hintInputFor(true)).toBe("touch");
    expect(hintInputFor(false)).toBe("keyboard");
  });

  it("the shell reads it from that predicate and freezes it for the session", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("useState<HintInput>(() => hintInputFor(hasTouchScreen()))");
    for (const i of INPUTS) expect(["keyboard", "touch"]).toContain(i);
  });
});
