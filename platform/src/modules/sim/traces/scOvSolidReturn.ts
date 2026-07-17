/**
 * sc-ov-solid-return — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Прибери се преди плътната линия" (doc 72 OV-04 × OV-09
 * × SN-03 — the М2→М1 closing window) on the committed ov-solid2-v1 district,
 * recorded with the template's OWN staged actors (single truth, imported from
 * the template): the ovgLeadCar-mold crawler (matchPlayer ~16 m of bumpers
 * ahead, capped 11.1 m/s ≈ 40 km/h) plus the two-car oncoming stream that eats
 * the first third of the window and then leaves the road empty.
 *
 * THE THREE DRIVES ARE ONE DECISION APART, and that is the whole design: all
 * three trail the same crawler, wait out the same two oncoming cars and execute
 * the same maneuver. The ONLY difference is WHEN they commit — and that alone
 * decides which of the three endings the road still allows:
 *  - shadow: pulls out at y = 112, the moment the oncoming pair is spent, takes
 *    the crawler at 80 (the posted limit is 90 — decisive, not reckless) and is
 *    home in its own lane by y ≈ 248, fifty metres before the wall, with the
 *    crawler whole in the mirror → ZERO violations + CLEAN_DRIVING;
 *  - „Връщане върху вече плътната линия": dawdles 78 m longer, pulls out at
 *    y = 190 and passes at 66 — still legally, still against an empty oncoming
 *    lane — and is STILL on the oncoming bank when the М1 span starts at
 *    y = 300. The return happens INSIDE it → EXACTLY CROSSED_SOLID_LINE. The
 *    return tracker is structurally silent here: `ocArmed` requires
 *    `solidCenterLine !== true`, so the excursion drops out of its arming on the
 *    span boundary with the bank still flipped, `returned` is false and the
 *    episode is discarded (one act, one code — the stage-2b ruling);
 *  - „Отрязване на изпреварения при късното прибиране": the SAME pull-out at
 *    y = 190 and the same 66 km/h pass — identical to the drive above right up
 *    to y = 280 — but this driver reads the wall coming and cuts back onto the
 *    dashed road ~0.6 s in front of the crawler → EXACTLY
 *    OVERTAKE_RETURN_TOO_EARLY. Two demos, one shared mistake, two prices.
 *
 * THE TUNING THAT IS LOAD-BEARING (and was measured, not guessed): the return
 * adjudication needs the mate BEHIND the player's centre by more than 2 m while
 * the excursion is still armed, and convicts under 15.2 m of centres — a 13 m
 * window the pass must END inside. Closing rate sets how long that window lasts:
 * at the shadow's 80 km/h the player crosses it in ~1.2 s (which is exactly why
 * the shadow sails through it to a 2 s+ landing), at the demos' 66 km/h in
 * ~1.8 s. That is why the two late demos pass SLOWER than the shadow: the
 * lesson needs them to still be inside the window when they commit.
 *
 * WHY NO CORRIDOR CODE CAN LEAK INTO ANY OF THEM: the stream is authored to
 * meet the player during the TRAIL phase (instant-cruise model y 150 / y 210 at
 * 12 m/s), so every excursion here runs against an empty oncoming lane. This
 * template is not about the head-on gamble (sc-ov-oncoming-gap / sc-ov-abort own
 * that, one district over) — here the pass is always safe and always legal, and
 * still wrong, because it was late.
 *
 * Geometry pinned to content/world/ov-solid2-v1.json: road on x = 0, own
 * (northbound) lane center x = +4.06, oncoming bank x = −2.5 committed line; М2
 * dashes y ∈ [0, 300], lengthened warning dashes y ∈ [240, 300], М1 solid span
 * y ∈ [300, 500]; returnByY = 270; spawn ovs2-spawn-start (4.06, 15) heading
 * north; 620 m, limit 90.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_SOLID_RETURN } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_SOLID_RETURN_ID = "sc-ov-solid-return";

/** Own (northbound) lane center / committed-pass line on the oncoming bank. */
const X_OWN = 4.06;
const X_OUT = -2.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait the oncoming out, then GO, and be
// home with the margin the marking asked for
// ---------------------------------------------------------------------------

export function scOvSolidReturnShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб пълзи бавна кола, осевата е прекъсната — изпреварването е разрешено. Но напред линията става непрекъсната: прозорецът има край." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Насреща идват две коли: докато те минават, прозорецът не е твой — колкото и прекъсната да е линията." },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 112]], targetKmh: 36, stopAtEnd: false },
      // The oncoming pair is spent by ~y 100 (the stream's own „clear" outcome
      // resolves at t ≈ 11.6): the window opens and the drill is to take it
      // IMMEDIATELY — every waited second is metres off the return.
      { kind: "annotation", textBg: "Насрещното платно се изчисти. Не се помайвай: започваш СЕГА, докато прозорецът стига за цялата маневра." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 112], [X_OWN, 119], [0.8, 133], [X_OUT, 147]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The decisive pass: 80 km/h under the posted 90 against the 40 km/h
      // crawler — closing ~11 m/s, which is what BUYS the wide landing below.
      { kind: "drive", points: [[X_OUT, 147], [X_OUT, 222]], targetKmh: 80, stopAtEnd: false },
      { kind: "annotation", textBg: "Подмина я — и се прибираш едва когато я видиш ЦЯЛАТА в огледалото. Дистанцията пред нея е част от маневрата." },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 222], [0.8, 235], [X_OWN, 248]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Изцяло в своята лента на 248-ия метър — петдесетина метра преди плътната линия. Маневрата свърши там, където беше разрешена." },
      { kind: "drive", points: [[X_OWN, 248], [X_OWN, 420]], targetKmh: 70, stopAtEnd: false },
      { kind: "annotation", textBg: "Тук осевата е непрекъсната: сега тя е просто стена вдясно от насрещните — и ти нямаш никаква работа с нея." },
      { kind: "drive", points: [[X_OWN, 420], [X_OWN, 570]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: прочетена маркировка, ранно решение, цяла маневра вътре в прозореца." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Връщане върху вече плътната линия" (CROSSED_SOLID_LINE)
// ---------------------------------------------------------------------------

export function scOvSolidReturnMistakeReturnOnSolidScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът се помайва зад бавната кола и започва изпреварването чак когато прозорецът вече е прегорял." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 190]], targetKmh: 36, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещното е празно от деветдесет метра, а той още се колебае. Излиза едва сега — на 190-ия метър, с 110 метра прекъсната линия пред себе си." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 190], [X_OWN, 197], [0.8, 211], [X_OUT, 225]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The pass itself is clean and lawful — and it ends on the wrong side of
      // y = 300, where the осева is already solid.
      { kind: "drive", points: [[X_OUT, 225], [X_OUT, 330]], targetKmh: 66, stopAtEnd: false },
      { kind: "annotation", textBg: "Прекъсванията свършиха под колелата му: линията е непрекъсната, а той е в насрещното платно." },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 330], [0.8, 344], [X_OWN, 358]], targetKmh: 66, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Прибра се през плътната линия — защото друг избор вече нямаше. Маневрата свърши там, където беше забранена." },
      { kind: "drive", points: [[X_OWN, 358], [X_OWN, 570]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "М1 забранява и прибирането, не само излизането. Удължените прекъсвания на 240-ия метър бяха предупреждението." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Отрязване на изпреварения при късното прибиране"
//                  (OVERTAKE_RETURN_TOO_EARLY)
// ---------------------------------------------------------------------------

export function scOvSolidReturnMistakeLateCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: същото закъсняло излизане — но този водач вижда плътната линия да идва и се хвърля обратно вдясно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 190]], targetKmh: 36, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 190], [X_OWN, 197], [0.8, 211], [X_OUT, 225]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The SAME late pull-out and the SAME 66 km/h pass as the demo above —
      // this drive and that one are identical right up to y = 280, and the
      // whole difference between опасна and основна is what happens next. Here
      // the driver reads the wall coming and takes the other bad exit: back
      // onto the dashed road, NOW, with the crawler's nose barely behind him.
      // Measured: the bank flips home at y ≈ 284 — sixteen metres of dashes to
      // spare, so CROSSED_SOLID_LINE provably cannot attach and the card names
      // the cut alone.
      { kind: "drive", points: [[X_OUT, 225], [X_OUT, 280]], targetKmh: 66, stopAtEnd: false },
      { kind: "annotation", textBg: "Едва подминал предницата ѝ — и вече реже обратно, за да изпревари не колата, а линията." },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 280], [0.8, 287], [X_OWN, 294]], targetKmh: 66, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Прибра се преди линията — но на метри пред носа на изпреварения. Той спира заради чужда маневра." },
      { kind: "drive", points: [[X_OWN, 294], [X_OWN, 420]], targetKmh: 70, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 420], [X_OWN, 570]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Маркировката беше спазена, чл. 42 — не. Прозорецът се мери за ЦЯЛАТА маневра, не за подминаването." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvSolidReturnTraceName =
  | "shadow-correct"
  | "mistake-return-on-solid"
  | "mistake-late-cut";

const SCRIPTS: Record<
  ScOvSolidReturnTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvSolidReturnShadowScript },
  "mistake-return-on-solid": { kind: "mistake", script: scOvSolidReturnMistakeReturnOnSolidScript },
  "mistake-late-cut": { kind: "mistake", script: scOvSolidReturnMistakeLateCutScript },
};

/**
 * Record one of the three drives against a loaded ov-solid2-v1 document — the
 * TEMPLATE's staged actors armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScOvSolidReturnDrive(
  districtRaw: unknown,
  name: ScOvSolidReturnTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_SOLID_RETURN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_SOLID_RETURN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
