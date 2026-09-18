"use client";

/**
 * =============================================================================
 * ?state=adr009 — EVERY SURFACE ADR-009 ADDS OR CHANGES, AT ITS OWN WIDTH,
 * ON A 360 px PHONE. (doc 92 §7 lane P · §8.4 P1 · audit row 17)
 * =============================================================================
 *
 * THE POSITION THIS LANE INHERITED. Four lanes shipped eleven new Bulgarian
 * strings and every one of their reports ends the same way. Lane E: «the new
 * copy is budgeted for two ~24-character lines per sentence, but I looked at no
 * frame». Lane F's verifier, having counted its lane's longest strings at 71,
 * 77 and 92 characters against a ~48-character budget: «Lane P owns the
 * photographs; I looked at no frame and make no claim». Doc 92 §5.3 says it
 * about its own worked example: «Phone fit is measured in lane P. It was not
 * measured here.»
 *
 * A CHARACTER COUNT IS NOT A FIT MEASUREMENT, and this repo has the scar. The
 * compact teach card's header is a `flex items-center gap-2` row with no
 * `flex-wrap`; what a long chip does there is not «wrap to a second line», it
 * is squeeze its neighbours or leave the box, and nothing that counts
 * characters can see either. Nor can it see a `line-clamp-2` eating the second
 * half of an explanation, or an authored briefing step pushed under a card's
 * bottom edge. So this gallery mounts the REAL components with the REAL copy
 * and the measurement is taken off layout.
 *
 * ── AND NOT AGAINST A FIXTURE CHOSEN FOR BEING EASY ─────────────────────────
 *
 * This lane's first round answered §5.10 — «does the rule line push an authored
 * briefing step under the fold?» — on ONE rung, in a bare 320 px box with no
 * stage around it and a cap of 484 px, and reported «no cost». Two things were
 * wrong with that and they pull in opposite directions, which is why the answer
 * had to be re-taken rather than adjusted:
 *
 *   · THE FIXTURE WAS THE EASIEST OF THE FOUR. Compiled over all 808 rungs,
 *     `sc-ac-truck-spray@L3`'s ten steps are 662 characters — 41st by
 *     characters among the 403 rungs that carry a rule line, while the column's
 *     cap is a height in pixels. So all four extremes are below, on both axes.
 *   · AND THE BOX WAS TOO KIND. 484 is where the column's FLOOR sits, not how
 *     tall it may be: anchored at `NOTIFY_COLUMN_TOP_CSS_ROOMY` (~164 px on a
 *     648 px stage) the card and the banner share ~320. Worse, with no
 *     `[data-sim-stage]` of its own the card read the whole scrolling rig page
 *     as its stage, so `briefingRoadCeilingPx` — the rule that stops the list
 *     above the hazard band — resolved against a band thousands of pixels away.
 *
 * Each capped fixture is therefore a REAL column in a REAL 648 px stage, and
 * each is paired with its OWN control — the identical card without the rule
 * line — because the answer is the DIFFERENCE between two fold counters and a
 * single frame cannot show one. Lane P's report carries the table.
 *
 * ── WIDTH IS THE MEASUREMENT, SO EACH SURFACE GETS ITS OWN ──────────────────
 *
 * The page is driven at a 360 × 780 viewport (`small-portrait`), and «360 px»
 * is the PHONE, not the width of every box on it. Three of them, each read off
 * the shell:
 *
 *   `stage` 360 px — the play area is full-bleed, so the compact teach sheet
 *       (`absolute inset-x-0`) and the `SimOverlay` queue get the whole width.
 *   `page`  360 px with `p-4` inside → 328 px of content — the result screen,
 *       the calibration gate (both inside `OVERLAY_SCRIM_CLASS`, which is
 *       `… p-4 sm:p-6`, playArea.ts:110) and the history row (the dashboard
 *       shell's `px-4`, layout.tsx:127).
 *   `column` 320 px — the ROOMY briefing card is the notify column's child and
 *       the column is `min(320px, 30vw)` (`NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX`).
 *       It never has 360 and it is never on a phone; see the briefing block.
 *
 * A rig that drew all three at one width would report a fit nobody has.
 *
 * The teach fixtures additionally set the shell's own two custom properties to
 * the values it publishes mid-drive on a phone — `--sim-vh` = the visual
 * viewport height (shell :7961) and `--sim-dash-h` = `COMPACT_DASH_HEIGHT_PX`
 * = 40 (shell :5851) — because the compact sheet's entire height rule is
 * `max-height: calc(var(--sim-vh, 100dvh) * 0.62)` and its anchor is
 * `bottom: var(--sim-dash-h, 0px)`.
 *
 * ── WHAT THIS RIG MAY NOT DO ────────────────────────────────────────────────
 *
 * It may not shorten a sentence, and it may not write one. Every Bulgarian
 * string on these frames is compiled, scored or retrieved by the product's own
 * functions (see `adr009-fixtures.ts`); the only prose this file contains is
 * its own section headings, which are dev chrome and reach no student. Where
 * something does not fit, the finding goes to the lane that owns the string
 * (D/E/F/G) — see this lane's report.
 */

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { BriefingCard, notifyColumnCapPx } from "@/components/sim/lesson-ui/LessonPlayShell";
import { CalibrationGate } from "@/components/sim/lesson-ui/CalibrationGate";
import { TeachMomentOverlay } from "@/components/sim/lesson-ui/TeachMomentOverlay";
import {
  COMPACT_DASH_HEIGHT_PX,
  ROOMY_HUD_FLOOR_PX,
} from "@/components/sim/lesson-ui/immersive";
import { SessionHistorySection } from "@/app/(dashboard)/simulator/session-history";
import {
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
  ObjectiveBanner,
  SessionEndScreen,
  SimOverlay,
  briefingBodyBg,
  briefingLineBg,
  briefingLineOrdinal,
} from "@/modules/sim/hud";
/**
 * THE VERDICT WORDS, FETCHED AND NOT RETYPED — the same deep import and the
 * same reason `popup-rig-client.tsx:59-77` gives (audit row 17): a rig that
 * hard-codes a verdict photographs a state the product may no longer produce.
 * Here they appear only in this file's own SECTION HEADINGS, which is exactly
 * where a stale word would be hardest to notice — the heading would keep
 * calling a frame «Неиздържан» after the screen under it had stopped. The
 * barrel publishes `SessionEndScreen` but not the label table, and that barrel
 * belongs to no lane in this round; the one-line export is reported, not made.
 */
import { SESSION_VERDICT_LABEL_BG as V } from "@/modules/sim/hud/SessionEndScreen";
import { lessonMistakeRuleBg } from "@/modules/sim/lessons";
import type { LessonSpec } from "@/modules/sim/lessons";
import {
  CREST_CURVE_L5,
  FOUR_CODES,
  LANE_CHOICE_L3,
  LANE_CHOICE_L5,
  LANE_CHOICE_RUBRIC_SPEC,
  PASS_CLEARANCE_L3,
  ROADWORKS_SHIFT_L5,
  ROADWORKS_SHIFT_RUBRIC_SPEC,
  TRUCK_SPRAY_L3,
  calibrationNamesFor,
  calibrationRevealFor,
  debriefTextFor,
  notTakenHistoryEntry,
  notTakenResult,
  rubricFor,
  teachMoments,
  teachNotificationItems,
} from "./adr009-fixtures";

/** The driven viewport, and what the shell publishes as `--sim-vh`. */
const PHONE_W_PX = 360;
/**
 * `?stageH=` — the play area's height, i.e. what the shell publishes as
 * `--sim-vh` on this device.
 *
 * IT IS A PARAMETER BECAUSE THE ANSWER DEPENDS ON IT. The compact teach sheet's
 * only height rule is `calc(var(--sim-vh, 100dvh) * 0.62)`, so «does the card
 * fit» is a different question at 780 px (the harness's `small-portrait`, the
 * 360-wide Android class doc `tools/mobile/lib/devices.mjs` calls the hardest
 * viewport in the set) than at 852 (the founder's iPhone 16). The default is
 * 780: a rig should ask its question at the harder end.
 */
const DEFAULT_STAGE_H_PX = 780;
const ROAD_BG =
  "linear-gradient(180deg, #2b3a4d 0%, #4a5b6e 46%, #6b6f6a 47%, #3c3f3b 100%)";

/**
 * One measured surface. `data-fit` is what the probe walks; `data-fit-surface`
 * records which of the three widths it was drawn at, so the report cannot
 * quietly compare a 320 px card against a 360 px budget.
 */
function Fit({
  id,
  surface,
  titleBg,
  noteBg,
  children,
}: {
  id: string;
  surface: "stage" | "stage-roomy" | "page" | "column";
  titleBg: string;
  noteBg?: string;
  children: React.ReactNode;
}) {
  /**
   * `stage-roomy` TAKES THE VIEWPORT, and that is the whole point of it.
   *
   * The roomy teach card is a DESKTOP surface — the shell renders it only on
   * the `!compact` branch — so drawing it in a 360 px box would photograph a
   * frame the product never paints and file its overflow as a defect. It is
   * full-width here so one page answers the question honestly at whatever
   * viewport it is driven at: at 360 it shows what a phone would get if it ever
   * got this card, at 1440 it shows what the desktop actually gets. Lane P runs
   * both and reports them as two rows, not one.
   *
   * `column` TAKES THE VIEWPORT TOO, and for the same reason. The 320 px is
   * still the card's width — it comes from `NOTIFY_COLUMN_WIDTH_CSS_ROOMY`
   * inside the fixture — but the box around it is a 648 px DESKTOP STAGE with
   * the column anchored in it, because that geometry is what
   * `briefingRoadCeilingPx` reads. Drawing the card in a bare 320 px div, as
   * this rig did, left the ceiling reading the whole scrolling page as its
   * stage. On a 360 px viewport the column's own `min(20rem, 30vw)` resolves to
   * 108 px, so these fixtures are READ FROM THE DESKTOP PASS; the phone pass
   * still draws them, and what it draws there is not a surface the product has.
   */
  const width = surface === "column" || surface === "stage-roomy" ? "100%" : PHONE_W_PX;
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-2 text-[10px] font-black uppercase tracking-widest text-accent">
        {titleBg}
      </h2>
      {noteBg === undefined ? null : (
        <p className="px-2 text-[10px] leading-snug text-muted">{noteBg}</p>
      )}
      <div
        data-fit={id}
        data-fit-surface={surface}
        className="border-y border-accent/40"
        style={{ width }}
      >
        {children}
      </div>
    </section>
  );
}

/** A stage-shaped box with the shell's two custom properties published on it. */
function Stage({
  stageHPx,
  compact,
  children,
}: {
  stageHPx: number;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: stageHPx,
        ["--sim-vh" as string]: `${stageHPx}px`,
        ["--sim-dash-h" as string]: `${compact ? COMPACT_DASH_HEIGHT_PX : 0}px`,
        background: ROAD_BG,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A teach card in the box the product draws it in.
 *
 * `overflow-hidden` IS THE MEASUREMENT, not a convenience: the stage clips, so
 * a card taller than the stage loses its bottom in the product too. A rig that
 * let the box grow would photograph the whole card and report «fits» about a
 * frame the student never sees.
 */
function TeachStage({
  id,
  titleBg,
  moment,
  compact,
  stageHPx,
}: {
  id: string;
  titleBg: string;
  moment: Parameters<typeof TeachMomentOverlay>[0]["moment"];
  compact: boolean;
  stageHPx: number;
}) {
  return (
    <Fit id={id} surface={compact ? "stage" : "stage-roomy"} titleBg={titleBg}>
      <Stage stageHPx={stageHPx} compact={compact}>
        <TeachMomentOverlay
          moment={moment}
          remaining={0}
          onAcknowledge={() => undefined}
          compact={compact}
        />
      </Stage>
    </Fit>
  );
}

/** The `p-4` a `page` surface sits inside (`OVERLAY_SCRIM_CLASS`, layout.tsx). */
function PageBox({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 bg-background p-4">{children}</div>;
}

/**
 * THE ROOMY STAGE, AND WHY THE COLUMN HAS TO BE INSIDE ONE.
 *
 * `BriefingCard` computes its list's `max-height` from the box it is standing
 * in: `measure()` does `ol.closest("[data-sim-stage]")` and feeds that rect to
 * `briefingRoadCeilingPx`, which stops the list above the hazard band
 * (`stageTop + 0.53 × stageHeight`). Its own header names the failure mode —
 * «a popup rig with no `[data-sim-stage]` ancestor … resolves to today's
 * behaviour exactly» — but the rig HAS one: the whole page is inside the
 * shell's stage div, so a card two thousand pixels down the scroll was handed a
 * band far above itself and the ceiling floored at `BRIEFING_ROAD_MIN_LIST_PX`.
 * MEASURED before this repair: `sc-rb-lane-choice`'s list came out **38 px** of
 * a 334 px briefing — a fixture that would have reported the rule line costing
 * nothing because there was nothing left to cost.
 *
 * So each column fixture gets its OWN stage, 648 px tall: the shipped
 * 1440 × 900 desktop's 16:9 letterbox, which is the geometry `BriefingCard`'s
 * header does its arithmetic against. Only the stage's TOP and HEIGHT enter
 * `briefingRoadCeilingPx`, so the answer is the same in the phone run and the
 * desktop run — which is the point: §5.10's question is about a DESKTOP card
 * and must not change with the width of the browser the probe happens to use.
 *
 * ── AND THE CAP IS 320 px OF CARD, NOT 484 ──────────────────────────────────
 *
 * 484 is where the column's FLOOR sits (648 − 108 roomy HUD floor − 56 band
 * gutter), which is what `BriefingCard`'s header means by it. The column does
 * not start at 0: it is anchored at `NOTIFY_COLUMN_TOP_CSS_ROOMY`, the interior
 * mirror's lane, which resolves to ~164 px on a 648 px stage. The HEIGHT the
 * card and the banner share is therefore `notifyColumnCapPx(648, 164) ≈ 320`.
 * This lane's first round capped the fixture at 484 and measured a card with
 * 164 px more room than the product gives it. Both numbers come out of the
 * shell's own exported arithmetic below; neither is written here.
 */
const ROOMY_STAGE_H_PX = 648;

/**
 * `NOTIFY_COLUMN_BAND_GUTTER_PX` read back out of the function that spends it.
 *
 * The constant is module-private in `LessonPlayShell.tsx:1732` while
 * `notifyColumnCapPx` — which subtracts it — is exported. Inverting the
 * exported function is exact and cannot drift; retyping `56` here would be a
 * hand-copied constant of exactly the kind this rig exists to stop measuring
 * against. (A one-line export would be better and is reported, not made: this
 * lane owns `app/dev/popup-rig/**` and nothing else.)
 */
const COLUMN_BAND_GUTTER_PX = 1000 - ROOMY_HUD_FLOOR_PX - notifyColumnCapPx(1000, 0);

/**
 * The briefing card with the rule line under it, in the column, in the stage.
 *
 * THE RULE LINE IS A SIBLING, NOT A CHILD, AND THAT IS A MODEL OF THE YIELD
 * ORDER RATHER THAN A SHORTCUT. Lane G will put it inside the card (§5.10 says
 * «after the numbered briefing»), and `BriefingCard` takes no children, so it
 * cannot be put there from here. What matters for fit is which element gives
 * way when the column runs out, and that is identical either way: the card
 * carries `min-h-0 [flex-shrink:20]` and its `<ol>` is the only scroller, so a
 * `shrink-0` line below it takes its height off the list exactly as a
 * `shrink-0` footer inside the card would. The FOLD COUNTER is therefore the
 * real reading: «↓ още N стъпки» appearing, or its N going up, is a step pushed
 * under the fold.
 *
 * The objective banner is the column's first child in the product
 * (`LessonPlayShell.tsx:7986`) and it is `shrink-0` while the card is the one
 * element carrying `min-h-0`, so whatever the banner takes comes off the LIST.
 * It is mounted here with the rung's own first objective on it rather than
 * subtracted as an estimate.
 */
function ColumnBriefing({
  lesson,
  ruleBg,
  capped,
}: {
  lesson: LessonSpec;
  ruleBg: string | null;
  capped: boolean;
}) {
  const steps = lesson.briefingBg ?? [];
  return (
    <div
      data-sim-stage=""
      className="relative overflow-hidden"
      style={{ height: ROOMY_STAGE_H_PX, background: ROAD_BG }}
    >
      <div
        className="absolute flex min-h-0 flex-col items-stretch gap-1.5 overflow-hidden"
        style={{
          right: NOTIFY_COLUMN_RIGHT_CSS,
          top: NOTIFY_COLUMN_TOP_CSS_ROOMY,
          width: NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
          // The shell's own expression (`LessonPlayShell.tsx:7961`), with its
          // two trailing subtractions folded into one — see the block above.
          ...(capped
            ? {
                maxHeight: `calc(100% - ${NOTIFY_COLUMN_TOP_CSS_ROOMY} - ${
                  ROOMY_HUD_FLOOR_PX + COLUMN_BAND_GUTTER_PX
                }px)`,
              }
            : null),
        }}
      >
        <ObjectiveBanner
          titleBg={lesson.objectives[0]?.titleBg ?? null}
          index={1}
          total={Math.max(1, lesson.objectives.length)}
          progress={null}
          flash={null}
        />
        <BriefingCard steps={steps} onClose={() => undefined} speedKmh={0} />
        {ruleBg === null ? null : (
          <div
            data-rig-rule-line=""
            className="shrink-0 rounded-2xl border border-warning/40 bg-background/85 px-3 py-1 text-[11px] leading-tight text-warning"
          >
            {ruleBg}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The result screen, mounted the way the shell mounts it.
 *
 * NOT inside a clipping box: in the product this screen is the page and it
 * scrolls (`overflow-y-auto` on the scrim), so «taller than the phone» is not
 * a defect here — clamped, overlapping or off the side is. The probe's scan
 * therefore runs on the descendants, not on the wrapper's own height.
 *
 * `rubric` AND `debriefText` ARE REAL, and that is this fixture's whole repair.
 * Passing `null` for both — which this rig did until 2026-09-18 — switched off
 * three ADR-009 texts at once: `manoeuvreGradeReasonBg` renders only inside the
 * `rubric !== null` block (`SessionEndScreen.tsx:1901`), `scoreRubric`'s
 * `NO_QUALITY_MEASURED_LESSON_MISTAKE_BG` needs a rubric with a quality
 * component to abstain, and §5.6's debrief branch needs a debrief. All three
 * were absent from every frame while the report said «every surface».
 */
function EndFixture({
  id,
  titleBg,
  noteBg,
  lesson,
  rubricSpec,
  result,
}: {
  id: string;
  titleBg: string;
  noteBg: string;
  lesson: LessonSpec;
  rubricSpec: typeof LANE_CHOICE_RUBRIC_SPEC;
  result: Parameters<typeof SessionEndScreen>[0]["result"];
}) {
  return (
    <Fit id={id} surface="page" titleBg={titleBg} noteBg={noteBg}>
      <PageBox>
        <SessionEndScreen
          lessonTitleBg={lesson.titleBg}
          result={result}
          debriefText={debriefTextFor(lesson, result)}
          concepts={[]}
          xpEarned={null}
          onRetry={() => undefined}
          onExit={() => undefined}
          nextLessonTitleBg={null}
          onNextLesson={null}
          rubric={rubricFor(result, rubricSpec)}
          compact
          onSkip={() => undefined}
          autoOpen
          onAutoOpenChange={() => undefined}
        />
      </PageBox>
    </Fit>
  );
}

export function Adr009Gallery() {
  const params = useSearchParams();
  const stageHRaw = Number(params.get("stageH") ?? "");
  const stageHPx =
    Number.isFinite(stageHRaw) && stageHRaw >= 320 && stageHRaw <= 1400
      ? Math.round(stageHRaw)
      : DEFAULT_STAGE_H_PX;
  const moments = useMemo(() => teachMoments(), []);
  const notifications = useMemo(() => teachNotificationItems(), []);
  /**
   * The rule line, and on the roomy card it is still a STAND-IN — said here
   * beside the frame rather than only in a report.
   *
   * Doc 92 §5.10 gives this line to lane G at two anchors: after the numbered
   * briefing, and in the folded pill. `lessonMistakeRuleBg` is imported by
   * `LessonPlayShell.tsx:124` and called NOWHERE, and `BriefingCard` still
   * takes `steps` and nothing else — so the string comes from the REAL
   * `lessonMistakeRuleBg` (lane A, catalogue titles retrieved) and is drawn as
   * the card's `shrink-0` sibling, which is where §5.10 puts it in the yield
   * order. What that buys: the width, the font, the wrap and the fold counter
   * are real. What it cannot answer is whether lane G's own element inherits
   * some other margin.
   */
  const ruleBg4 = lessonMistakeRuleBg(LANE_CHOICE_L3);
  const ruleBg1 = lessonMistakeRuleBg(PASS_CLEARANCE_L3);
  const ruleCrest = lessonMistakeRuleBg(CREST_CURVE_L5);
  const ruleRoadworks = lessonMistakeRuleBg(ROADWORKS_SHIFT_L5);
  const ruleTruck = lessonMistakeRuleBg(TRUCK_SPRAY_L3);

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-background">
      <div className="flex w-full flex-col gap-5 pb-16 pt-3">
        <p className="mx-2 rounded-xl border border-accent/50 bg-accent/10 p-3 text-xs leading-relaxed">
          <strong>ADR-009 · телефонът.</strong> Всяка повърхност, която правилото
          добавя или променя, в реалния компонент и с реалния текст. Нищо тук не е
          скъсено: ако не се побира, това е находка за екипа, който притежава
          изречението.
        </p>

        {/* ── 1. THE LIVE TEACH CARD — four kinds × two grammars ──────────────
            The compact sheet is the ONLY teach surface a phone gets (the roomy
            card is desktop; the shell's `compact` branch is the wire). The
            roomy four are photographed all the same, because doc 92 §5.5
            changes the header and the subline on both. */}
        <TeachStage
          id="teach-compact-free-first"
          titleBg="1a · free-first · компактен (телефон)"
          moment={moments.freeFirst}
          compact
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-compact-lesson-first"
          titleBg="1b · lesson-first · компактен (телефон)"
          moment={moments.lessonFirst}
          compact
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-compact-lesson-charged"
          titleBg="1c · lesson-charged · компактен (телефон)"
          moment={moments.lessonCharged}
          compact
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-compact-charged"
          titleBg="1d · charged · компактен (телефон)"
          moment={moments.charged}
          compact
          stageHPx={stageHPx}
        />

        <TeachStage
          id="teach-roomy-free-first"
          titleBg="2a · free-first · широк"
          moment={moments.freeFirst}
          compact={false}
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-roomy-lesson-first"
          titleBg="2b · lesson-first · широк"
          moment={moments.lessonFirst}
          compact={false}
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-roomy-lesson-charged"
          titleBg="2c · lesson-charged · широк"
          moment={moments.lessonCharged}
          compact={false}
          stageHPx={stageHPx}
        />
        <TeachStage
          id="teach-roomy-charged"
          titleBg="2d · charged · широк"
          moment={moments.charged}
          compact={false}
          stageHPx={stageHPx}
        />

        {/* ── 1bis. THE PHONE'S ACTUAL TEACH SURFACE ──────────────────────────
            `TeachMomentOverlay` above is the ROOMY card; on a phone the shell
            renders it behind `{!compact && …}` and the student meets the
            moment as THIS notification instead (shell :6289-6336). It is the
            surface that printed «Първа среща — не се брои в резултата» over
            the lesson's own mistake, lane G rewired it while this lane's first
            frames were being taken, and until now nobody had photographed the
            repair. Four kinds again, because `teachChipBg` and `teachStakeBg`
            both branch on all four. */}
        {(
          [
            ["notify-teach-free-first", "1e · free-first · известието на телефона", notifications.freeFirst],
            ["notify-teach-lesson-first", "1f · lesson-first · известието на телефона", notifications.lessonFirst],
            ["notify-teach-lesson-charged", "1g · lesson-charged · известието на телефона", notifications.lessonCharged],
            ["notify-teach-charged", "1h · charged · известието на телефона", notifications.charged],
          ] as const
        ).map(([id, titleBg, item]) => (
          <Fit key={id} id={id} surface="stage" titleBg={titleBg}>
            <Stage stageHPx={stageHPx} compact>
              <SimOverlay
                item={item}
                queued={0}
                frozen={false}
                onOpenChange={() => undefined}
                onDismiss={() => undefined}
              />
            </Stage>
          </Fit>
        ))}

        {/* ── 2. THE RESULT SCREEN — «Не е взет», its note, the reason block,
            the star note and the debrief. Six states, and the four that are new
            here are the ones the previous set could not reach: a FINISHED route
            with four hits (§5.7's single-floor sentence at its longest), a
            CHARGED repeat (§5.3's repeat stake and §5.2's second sheet clause),
            a FAILED изпитен лист with a hit (the 96 drives — «Неиздържан» with
            the reason block still under it), and a rung whose rubric measures
            something and abstains (§5.6's no-quality row). */}
        <EndFixture
          id="end-notaken-1"
          titleBg={`3a · «${V.lessonMistake}» · 1 грешка · завършен маршрут`}
          noteBg="Чист изпитен лист (0 т.), завършен маршрут — и урокът е отказан. §5.7 е в най-късата си форма."
          lesson={PASS_CLEARANCE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(PASS_CLEARANCE_L3, { completedAll: true })}
        />
        <EndFixture
          id="end-notaken-4"
          titleBg={`3b · «${V.lessonMistake}» · 4 грешки · незавършен маршрут`}
          noteBg="Най-дългата бележка и другият ѝ завършек; §5.7 минава през общата форма, защото подовете са два."
          lesson={LANE_CHOICE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(LANE_CHOICE_L3, { completedAll: false })}
        />
        <EndFixture
          id="end-notaken-4-done"
          titleBg={`3c · «${V.lessonMistake}» · 4 грешки · ЗАВЪРШЕН маршрут`}
          noteBg="Единственият под е самото правило — тук §5.7 казва «Звездите не могат да кажат „взето“»."
          lesson={LANE_CHOICE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(LANE_CHOICE_L3, { completedAll: true })}
        />
        <EndFixture
          id="end-notaken-charged"
          titleBg={`3d · «${V.lessonMistake}» с повторение в листа`}
          noteBg="Повторението стига до листа: листът стои на точки, но в допустимото — втората половина на §5.2."
          lesson={LANE_CHOICE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(LANE_CHOICE_L3, { completedAll: true, sheet: "charged" })}
        />
        <EndFixture
          id="end-failed-sheet"
          titleBg={`3e · «${V.failed}» + грешката на урока (96-те карания)`}
          noteBg="Паднал лист (сблъсък) и грешка на урока на едно каране — единственото място, където двете повърхности можеха да си противоречат."
          lesson={LANE_CHOICE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(LANE_CHOICE_L3, { completedAll: true, sheet: "failed" })}
        />
        <EndFixture
          id="end-aborted-1"
          titleBg={`3f · «${V.unfinished}» · прекъснат урок с грешка`}
          noteBg={`Прекъснат урок, в който грешката все пак се е случила — значката остава «${V.unfinished}».`}
          lesson={PASS_CLEARANCE_L3}
          rubricSpec={LANE_CHOICE_RUBRIC_SPEC}
          result={notTakenResult(PASS_CLEARANCE_L3, { completedAll: false, sheet: "aborted" })}
        />
        <EndFixture
          id="end-no-quality"
          titleBg={`3g · «${V.lessonMistake}» · рубрика, която мери и не е измерила`}
          noteBg="sc-merge-roadworks-shift — единственото от четирите с показател за качество. Редът «Наблюдение» носи текста на §5.6."
          lesson={ROADWORKS_SHIFT_L5}
          rubricSpec={ROADWORKS_SHIFT_RUBRIC_SPEC}
          result={notTakenResult(ROADWORKS_SHIFT_L5, { completedAll: true })}
        />

        {/* ── 3. HISTORY — the row the student comes back to. `initialOpenId`
            is the component's own rig/test door: this repo's vitest has no DOM,
            so the expanded panel has no other reader. The third row is the one
            lane F's verifier asked for: a row whose изпитен лист FAILED, where
            «Не е взет» would contradict the end screen. */}
        <Fit
          id="history-notaken"
          surface="page"
          titleBg={`4a · История · «${V.lessonMistake}», разгънат ред`}
          noteBg="Без точки: първата поява не носи наказателни точки."
        >
          <PageBox>
            <SessionHistorySection
              entries={[notTakenHistoryEntry(LANE_CHOICE_L3, { sheet: "clean" })]}
              initialOpenId="rig-adr009-row"
            />
          </PageBox>
        </Fit>
        <Fit
          id="history-notaken-charged"
          surface="page"
          titleBg={`4b · История · «${V.lessonMistake}» с повторение в листа`}
          noteBg="Същият ред, когато повторението е стигнало до изпитния лист."
        >
          <PageBox>
            <SessionHistorySection
              entries={[notTakenHistoryEntry(LANE_CHOICE_L3, { sheet: "charged" })]}
              initialOpenId="rig-adr009-row"
            />
          </PageBox>
        </Fit>
        <Fit
          id="history-failed-sheet"
          surface="page"
          titleBg="4c · История · паднал лист + грешка на урока"
          noteBg={`96-те карания: редът казва «${V.failed}», ъгълът носи таксуваната грешка, а грешката на урока е в панела.`}
        >
          <PageBox>
            <SessionHistorySection
              entries={[notTakenHistoryEntry(LANE_CHOICE_L3, { sheet: "failed" })]}
              initialOpenId="rig-adr009-row"
            />
          </PageBox>
        </Fit>

        {/* ── 4. CALIBRATION — the hint before the answer, and the reveal line
            in BOTH sheet states (doc 92 §5.9 authors a different opening for
            each). Title and body are `calibrationRevealCopy`'s, not typed. */}
        <Fit
          id="calib-hint"
          surface="page"
          titleBg="5a · «Позна ли се?» · подсказката преди отговора"
          noteBg={`Показва се само когато урокът изобщо може да завърши «${V.lessonMistake}».`}
        >
          <PageBox>
            <CalibrationGate
              lessonTitleBg={LANE_CHOICE_L3.titleBg}
              lessonHasTargets
              onSubmit={async () => null}
              onResolved={() => undefined}
            />
          </PageBox>
        </Fit>
        <Fit
          id="calib-reveal-sheet-passed"
          surface="page"
          titleBg="5b · Разкриването · чист лист + «Урокът обаче не е взет»"
          noteBg="Едно име в изречението — най-късата форма на §5.9."
        >
          <PageBox>
            <CalibrationGate
              lessonTitleBg={LANE_CHOICE_L3.titleBg}
              lessonHasTargets
              lessonMistake={calibrationNamesFor([FOUR_CODES[0]])}
              initialReveal={calibrationRevealFor({
                predictedPoints: 4,
                predictedPass: true,
                actualPoints: 0,
                actualPass: true,
              })}
              onSubmit={async () => null}
              onResolved={() => undefined}
            />
          </PageBox>
        </Fit>
        <Fit
          id="calib-reveal-sheet-failed"
          surface="page"
          titleBg="5c · Разкриването · паднал лист + «Урокът също не е взет»"
          noteBg="И четирите цели: «…, … и още 2» — формата, която досегашният макет никога не стигаше."
        >
          <PageBox>
            <CalibrationGate
              lessonTitleBg={LANE_CHOICE_L3.titleBg}
              lessonHasTargets
              lessonMistake={calibrationNamesFor(FOUR_CODES)}
              initialReveal={calibrationRevealFor({
                predictedPoints: 6,
                predictedPass: true,
                actualPoints: 20,
                actualPass: false,
              })}
              onSubmit={async () => null}
              onResolved={() => undefined}
            />
          </PageBox>
        </Fit>

        {/* ── 5. THE RULE BEFORE THE DRIVE (doc 92 §5.10) — BOTH SURFACES, and
            they are not the same one.
            §5.10's two anchors are the roomy briefing card and its folded pill.
            On a PHONE neither exists: the shell mounts `BriefingCard` under a
            comment reading «Roomy only; compact feeds the same list through the
            queue below, one line with the whole thing a tap behind it» (:7982),
            and the phone's briefing is a `SimOverlay` item whose sheet carries
            `briefingBodyBg`. So the rule line has a phone home §5.10 does not
            name, and this rig measures it there too. */}
        <Fit
          id="briefing-rule-4"
          surface="column"
          titleBg="6a · Широката карта «Инструкции» + правилото · 4 цели, 5 стъпки"
          noteBg="ЗАМЕСТИТЕЛ: lane G още не е построил реда. Колоната е в реалния стадий 648 px, но БЕЗ тавана — колко е целият инструктаж."
        >
          <ColumnBriefing lesson={LANE_CHOICE_L3} ruleBg={ruleBg4} capped={false} />
        </Fit>
        <Fit
          id="briefing-rule-1"
          surface="column"
          titleBg="6b · Широката карта «Инструкции» + правилото · 1 цел"
          noteBg="ЗАМЕСТИТЕЛ, както по-горе. Обичайният случай: 260 от 403 упражнения с правило имат точно една цел."
        >
          <ColumnBriefing lesson={PASS_CLEARANCE_L3} ruleBg={ruleBg1} capped={false} />
        </Fit>

        {/* ── THE CASE §5.10 ACTUALLY RULES ON, ON THE PRODUCT'S OWN WORST
            RUNGS. «Authored briefing steps are not shortened to make room» — so
            the question is what the rule line costs inside the column's REAL
            cap, with the objective banner above it as in the product. Each pair
            is the same rung with the line and without it; the difference
            between the two fold counters is the price, and it is a reading
            rather than an opinion. The four rungs are the corpus's extremes on
            both axes (characters and steps) among the 403 that carry a line. */}
        {(
          [
            [
              "l5-lane-choice",
              "6c · sc-rb-lane-choice@L5 · 6 стъпки / 1 347 зн. + правило от 178 зн.",
              LANE_CHOICE_L5,
              ruleBg4,
            ],
            [
              "l5-crest-curve",
              "6d · sc-ov-crest-curve@L5 · 8 стъпки / 1 739 зн. — най-дългият инструктаж в корпуса",
              CREST_CURVE_L5,
              ruleCrest,
            ],
            [
              "l5-roadworks",
              "6e · sc-merge-roadworks-shift@L5 · 8 стъпки / 1 520 зн.",
              ROADWORKS_SHIFT_L5,
              ruleRoadworks,
            ],
            [
              "l3-truck-spray",
              "6f · sc-ac-truck-spray@L3 · 10 стъпки / 662 зн. — най-много СТЪПКИ",
              TRUCK_SPRAY_L3,
              ruleTruck,
            ],
          ] as const
        ).flatMap(([slug, titleBg, lesson, ruleBg]) => [
          <Fit
            key={`${slug}-rule`}
            id={`briefing-cap-${slug}-rule`}
            surface="column"
            titleBg={`${titleBg} · С ПРАВИЛОТО`}
            noteBg="Стадий 648 px, колоната на реалния си връх (~164 px) и с реалния си таван — ~320 px за банера, картата и реда."
          >
            <ColumnBriefing lesson={lesson} ruleBg={ruleBg} capped />
          </Fit>,
          <Fit
            key={`${slug}-control`}
            id={`briefing-cap-${slug}-control`}
            surface="column"
            titleBg={`${titleBg} · КОНТРОЛАТА, без правилото`}
            noteBg="Същият стадий, същият таван, същият банер, без новия ред. Разликата между двата брояча е цената."
          >
            <ColumnBriefing lesson={lesson} ruleBg={null} capped />
          </Fit>,
        ])}

        {/* The PHONE's briefing. The probe taps the line to open the sheet —
            the item is the shell's own (`briefingLineBg` / `briefingBodyBg` /
            `briefingLineOrdinal`, the same three helpers the shell passes at
            :6529-6550) and the rule line is appended to the body the way lane G
            would have to append it, since that is the only place on this
            surface a sentence can go. The steps are `sc-rb-lane-choice@L3`'s
            authored five — 920 characters, not the 247 this rig used to draw. */}
        <Fit
          id="briefing-phone"
          surface="stage"
          titleBg="6g · Телефонът · листът «Инструкции» + правилото"
          noteBg="ЗАМЕСТИТЕЛ. §5.10 не назовава тази повърхност — тук е, защото на телефон широката карта изобщо не се монтира."
        >
          <Stage stageHPx={stageHPx} compact>
            <SimOverlay
              item={{
                id: "briefing",
                kind: "hint",
                tone: "neutral",
                chipBg: "Инструкции",
                lineBg: briefingLineBg(LANE_CHOICE_L3.briefingBg ?? []),
                lineOrdinal: briefingLineOrdinal(LANE_CHOICE_L3.briefingBg ?? []),
                detailBg:
                  ruleBg4 === null
                    ? briefingBodyBg(LANE_CHOICE_L3.briefingBg ?? [])
                    : `${briefingBodyBg(LANE_CHOICE_L3.briefingBg ?? []) ?? ""}\n\n${ruleBg4}`,
              }}
              queued={0}
              frozen={false}
              onOpenChange={() => undefined}
              onDismiss={() => undefined}
            />
          </Stage>
        </Fit>

        <p className="mx-2 pb-10 text-[10px] leading-snug text-muted">
          Измерено при 360 × 780. Резултатният екран се скролва в продукта, затова
          „по-висок от екрана“ не е дефект там; отрязан, слепен или излязъл встрани
          текст е.
        </p>
      </div>
    </div>
  );
}
