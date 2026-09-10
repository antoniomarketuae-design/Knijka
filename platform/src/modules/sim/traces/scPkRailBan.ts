/**
 * sc-pk-rail-ban — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Никакъв престой около жп прелез" (PK-06 + RX-03, ЗДвП
 * чл. 98) on the committed pk-rail-v1 district. No staged actor, ambient traffic
 * ZERO (the harness law): the trap is the ZONE, not traffic — so the ONLY thing
 * the rule engine can grade is where the driver chooses to rest.
 *
 * THE CROSSING IS EMPTY ON PURPOSE, on both counts:
 *  - no queue tail. A lead within banZoneStopQueueGapM would acquit every rest
 *    in a ban span as queue-shaped (the sc-pk-busstop-ban lesson, verbatim), and
 *    the „спрях зад колоната" drill already exists — it is sc-rx-queue-clear, on
 *    rx-guarded-v1, and it teaches the opposite half of this subject;
 *  - no train. The authored barrier falls at t = 480 s of a 600 s cycle and the
 *    longest drive here ends around t ≈ 60, so every drive lives in the OPEN
 *    window: railBarred is never true, „entered-barred" can never fire, and the
 *    only rail arm in play is the rest-ON-tracks one. That is not a dodge — it
 *    is the template's whole precondition (see the ScenarioSpec header: a lawful
 *    wait at a lowered barrier inside a ban span would convict).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: crosses the whole zone at cruise — no hesitation before the rails,
 *     one unbroken motion over the band (чл. 52 asks no stop of a guarded-open
 *     crossing), no relief stop after them — and rests at the LEGAL bay 74 m past
 *     everything (y = 330) → ZERO violations;
 *   - „Престой на метър от релсите": a casual 6 s rest with the CENTRE at
 *     y = 198 — a nose at 200.02, i.e. 1.19 m from the first rail (201.21) and
 *     inside pkr-z-ban-before by the body test → EXACTLY
 *     ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - „Спиране върху самата прелезна ивица": a 6 s rest at y = 203, mid-band,
 *     where NO ban span reaches → EXACTLY RAIL_CROSSING_VIOLATION (опасна,
 *     detail "stopped-on-track").
 *
 * The two demos are FIVE metres apart and grade DIFFERENT codes — that
 * separation is the template, and five metres is the honest width of it: the
 * law's own line for a standing vehicle is «по-малко от 2 метра от тях», so the
 * основна and the опасна really are about one car length apart. It holds because
 * the map measures those two metres from the RAILS the renderer draws and stops
 * each span at the band edge, never over it (tools/maps/gen_pk_rail.mjs), and
 * because the runtime gives every metre of the band to the rail zone alone; the
 * district battery proves both verdicts — and the one-code-per-metre census —
 * through the real reducer before a single frame is recorded here.
 *
 * Every stop uses the default SCRIPT_DECEL (4.6 m/s², below the
 * harshBrakeDecelMps2 = 7 threshold), so no demo smuggles in a
 * HARSH_BRAKING_NO_CAUSE alongside the fault it is meant to teach. Both demos
 * recover to the legal bay: the fault is the REST, never the route.
 *
 * Geometry pinned to content/world/pk-rail-v1.json: a 1+1 street on x = 0, lane
 * center x = 4.06, чл. 98 spans y ∈ [199.21, 200] and [206, 206.79] (the act's
 * 2 m measured from the rails at 201.21 / 204.79, less the metres the band
 * already owns), guarded track band y ∈ [200, 206] (А34), СТОП line y = 195
 * (legal ground — the lawful waiting position under чл. 51, ал. 4 sits at or
 * before the ban's edge), legal bay y = 330, spawn pkr-spawn-start (4.06, 15)
 * heading north, 400 m, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_RAIL_BAN_ID = "sc-pk-rail-ban";

/** The single northbound lane center of pk-rail-v1. */
const X_LANE = 4.06;
/** Mid-band: the six metres no чл. 98 span reaches — RX-03's ground. */
const Y_RAILS = 203;
/**
 * A NOSE 1.19 m FROM THE FIRST RAIL. The centre rests at 198 and the car is
 * 4.04 m long, so the bumper stands at 200.02 against a first rail at 201.21 —
 * comfortably inside the two metres чл. 51, ал. 4 protects, and comfortably
 * short of the band, so this demo bills the чл. 98 code and never the rail one.
 * (worldRuntime.ts measures a no-stopping span against the vehicle's reach,
 * which is what «на разстояние по-малко от 2 метра» measures too.)
 *
 * THE DEMO MOVED BECAUSE THE OLD ONE WAS INNOCENT: a 6 s rest at y = 175 is a
 * car standing 25 m from a crossing on an empty residential street, and no
 * article in content/law/acts/ forbids that. It was convicted only because the
 * map carried an invented span — the same „50 метра от двете страни" the content
 * bank marks correct: false in q-spirane-i-parkirane-056.
 */
const Y_BAN = 198;
/** The ONE legal mark, 74 m past every span. */
const Y_BAY = 330;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the zone is crossed, never occupied
// ---------------------------------------------------------------------------

export function scPkRailBanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: „спри някъде тук за малко“. Напред е железопътен прелез — а около него престоят е забранен от закона, не от знак." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 145]], targetKmh: 40, stopAtEnd: false },
      // NARROWED FROM „законът не мери прелеза в метри". The claim-ledger pin
      // that accepted that sentence reasoned about чл. 98, ал. 1, т. 4 — which
      // really does carry no figure — but the sentence said ЗАКОНЪТ, and ЗДвП
      // measures this crossing in metres three times over (чл. 51, ал. 4;
      // чл. 53, ал. 2; чл. 54, ал. 1). So the shipped sentence was a universal
      // negative its own act refutes, and it contradicted the sister trace in
      // this very scenario, which tells the student the law wants two metres.
      // Narrowed to the BAN, which is what was actually verified.
      { kind: "annotation", textBg: "Напред е прелезът. Табела „не спирай“ няма — тази забрана няма мярка в метри, а пита дали спрялата кола пречи на влака (чл. 98, ал. 1, т. 4)." },
      // Through the WHOLE approach ban at cruise: the drill's first claim is that
      // the decision is made early, not shopped for at the rails.
      { kind: "drive", points: [[X_LANE, 145], [X_LANE, 180], [X_LANE, 196]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Бариерата е вдигната и прелезът е охраняем — не сме длъжни да спираме. Не спираме и „за всеки случай“." },
      // The band in one unbroken motion (чл. 52: guarded + open = no stop duty).
      { kind: "drive", points: [[X_LANE, 196], [X_LANE, 206], [X_LANE, 235]], targetKmh: 38, stopAtEnd: false },
      // The symmetry is the statute's own wording, so it is cited like any
      // other legal claim (ADR-002): чл. 54, ал. 1 reads „…по-малко от 2 метра
      // преди първата ИЛИ СЛЕД ПОСЛЕДНАТА релса".
      //
      // NARROWED WITH THE SISTER CAPTION BELOW, and for the same reason. This
      // read „не спираме веднага: ЗАКОНЪТ МЕРИ еднакво … (чл. 54, ал. 1)" — a
      // colon that hangs a stopping rule on an article that states no
      // prohibition at all. Read to the end, чл. 54, ал. 1 governs a
      // ПРИНУДИТЕЛНО спиране and lists what the driver then owes; the reason
      // not to rest here is still чл. 98, ал. 1, т. 4. What чл. 54, ал. 1 does
      // give — and what this beat is for — is that its two metres run BOTH
      // ways, „преди първата ИЛИ СЛЕД ПОСЛЕДНАТА релса", so the far side is not
      // safe ground the moment the wheels clear the paint.
      { kind: "annotation", textBg: "Коловозът е преминат на едно движение. И от тази страна не спираме веднага: ЗДвП чл. 54, ал. 1 брои същите два метра и след последната релса — спре ли колата там принудително, водачът е длъжен да изведе пътниците и да предупреди машинистите." },
      { kind: "drive", points: [[X_LANE, 235], [X_LANE, 275], [X_LANE, 300]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Прелезът е далеч зад нас и не пречим на никого. Сега — десен мигач и спиране на първото разрешено място." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 300], [X_LANE, Y_BAY]], targetKmh: 20 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: спирането никога не е било забранено — забранено беше МЯСТОТО, а то е там, където пречиш на влака." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „за секунда“ in the approach ban (pkr-z-ban-before)
// ---------------------------------------------------------------------------

export function scPkRailBanMistakeStopBeforeCrossingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „бариерата е вдигната, никого не преча“ — и колата спира с предница на метър и деветнайсет от първата релса." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 150], [X_LANE, Y_BAN]], targetKmh: 30 },
      // A casual 6 s rest inside pkr-z-ban-before (y ∈ [199.21, 200], reached by
      // the nose rather than the centre) — past the 4 s
      // sustain. No lead, no stop line, no crossing anywhere on this map: every
      // structural innocent context is absent, so the authored fault convicts and
      // nothing else. The car is in the rail APPROACH phase here (the window
      // opens 30 m out), but the "on" phase starts at the band — so the rail
      // rest arm cannot arm and the codes stay distinct.
      { kind: "pause", sec: 6, brake: true },
      // THE CITATION MOVED TWICE. Round one: this line read „законът иска поне
      // два метра … (чл. 51, ал. 4; чл. 54, ал. 1)" — чл. 51, ал. 4 is a
      // TWO-BRANCH sentence („…не по-малко от 2 метра преди първата релса,
      // А КОГАТО ИМА БАРИЕРИ - НА 1 МЕТЪР ОТ ТЯХ."), pk-rail-v1 authors
      // guarded: true with the arm at y = 197, so the branch that governs HERE
      // is the one metre from the barriers, and the caption quoted the branch
      // that does not apply.
      //
      // Round two swapped чл. 51, ал. 4 for чл. 53, ал. 2 and kept the
      // ASSERTION: „на по-малко от два метра от релсите НЕ СЕ СПИРА ИЗОБЩО
      // (чл. 53, ал. 2; чл. 54, ал. 1)". Neither article says that, and reading
      // each to the end of its own sentence is what shows it:
      //
      //   чл. 53, ал. 2 — „Водачът … НЕ ТРЯБВА ДА ЗАПОЧВА ПРЕМИНАВАНЕТО на
      //     железопътния прелез, ако не е предварително убеден, че няма да се
      //     наложи спиране върху релсите или на разстояние по-малко от 2 метра
      //     от тях, поради техническите особености на превозното средство,
      //     условията на движение или други предвидими причини." A duty about
      //     ENTERING, conditioned on foresight — not a prohibition on standing.
      //   чл. 54, ал. 1 — „В случай на ПРИНУДИТЕЛНО СПИРАНЕ … водачът е длъжен:
      //     1. да изведе пътниците … 2. да вземе мерки за извеждането на
      //     превозното средство извън обсега на релсовия път, а ако това е
      //     невъзможно, да направи всичко необходимо за предупреждаване на
      //     водачите на релсовите превозни средства от двете посоки." It
      //     PROHIBITS NOTHING; it is written about a forced stop and it imposes
      //     duties once you are already there.
      //
      // So the flat «не се спира изобщо» had no home in either, and a third
      // article was NOT gone looking for. What actually convicts this rest is
      // чл. 98, ал. 1, т. 4 — „върху трамвайни и железопътни линии или в такава
      // близост до тях, която може да затрудни движението на релсовите превозни
      // средства" — a functional test with no metre count. The two metres are
      // real and barrier-independent, but they are the line the act draws
      // elsewhere for a vehicle standing near rails, and the caption now says
      // which duty each of them carries instead of borrowing them as a ban.
      { kind: "annotation", textBg: "Престоят тук е забранен, защото спряла кола в такава близост до релсите може да затрудни движението на релсовите превозни средства (ЗДвП чл. 98, ал. 1, т. 4). Двата метра, които законът пише, са за друго: чл. 53, ал. 2 забранява да ВЛИЗАШ в прелеза, ако не си убеден, че няма да спреш върху релсите или на по-малко от два метра от тях; чл. 54, ал. 1 пък прави спирането там принудителна авария — изведи пътниците и предупреди машинистите. Предницата е на метър и деветнайсет." },
      { kind: "annotation", textBg: "Габаритът на влака е по-широк от релсите. А спрялата тук кола крие идващия влак от всички зад нея." },
      // The transit itself is lawful and must cost nothing — the fault was the
      // rest, and the sheet has to say exactly that.
      { kind: "drive", points: [[X_LANE, Y_BAN], [X_LANE, 206], [X_LANE, 275]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 275], [X_LANE, Y_BAY]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Разрешеното място беше на 130 метра напред — по-малко от петнайсет секунди шофиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — the rest ON the band (pkr-z-railcrossing, RX-03)
// ---------------------------------------------------------------------------

export function scPkRailBanMistakeStopOnRailsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: същото решение, една дължина на кола по-нататък — колата спира между релсите." },
      { kind: "glance", mirror: "rear" },
      // Through the approach ban WITHOUT resting (a stop here would bill the
      // other demo's code and blur the pair) and onto the band, stopping at 203.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 160]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, Y_RAILS]], targetKmh: 18 },
      { kind: "annotation", textBg: "И колата остава там, където никога не се спира: върху коловоза, без изход напред." },
      // Rest ON the band: 6 s ≫ the 2 s sustain — one bill, once. No чл. 98 span
      // reaches these six metres, so the ONLY code here is the опасна one.
      // (The ban span now ends 3 m short of this rest rather than 28, and the
      // runtime refuses to arm it anywhere on the band — the trace gate measures
      // the gap and the district census measures the codes.)
      { kind: "pause", sec: 6, brake: true },
      { kind: "annotation", textBg: "Тук извинение няма — нито „колоната спря“, нито „само за миг“. Влакът спира след километър и не завива." },
      { kind: "drive", points: [[X_LANE, Y_RAILS], [X_LANE, 240], [X_LANE, 275]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 275], [X_LANE, Y_BAY]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Двете грешки са на няколко метра една от друга — и се оценяват различно: основна до прелеза, опасна върху него." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkRailBanTraceName =
  | "shadow-correct"
  | "mistake-stop-before-crossing"
  | "mistake-stop-on-rails";

const SCRIPTS: Record<
  ScPkRailBanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkRailBanShadowScript },
  "mistake-stop-before-crossing": {
    kind: "mistake",
    script: scPkRailBanMistakeStopBeforeCrossingScript,
  },
  "mistake-stop-on-rails": { kind: "mistake", script: scPkRailBanMistakeStopOnRailsScript },
};

/**
 * Record one of the three drives against a loaded pk-rail-v1 document — no
 * staged events (the zone is the trap), ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScPkRailBanDrive(
  districtRaw: unknown,
  name: ScPkRailBanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_RAIL_BAN_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
