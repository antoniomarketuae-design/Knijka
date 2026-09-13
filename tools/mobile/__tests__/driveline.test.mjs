/**
 * driveline.test.mjs — THE FOUR NEW CAPABILITIES, AND THE PROOF THAT THE DRIVE
 * PATH STILL CALLS THEM.
 *
 * Run: node --test tools/mobile/__tests__/driveline.test.mjs
 * (collected automatically by platform/scripts/tools-tests.mjs — it walks
 * tools/ and claims this file by its `node:test` import. `VITEST_INCLUDE` does
 * not glob tools/mobile/__tests__, so this file is owned by exactly one runner
 * and `auditOwnership()` fails if that ever stops being true.)
 *
 * ═══ WHY §J EXISTS AND IS AS LONG AS THE REST ══════════════════════════════
 *
 * The measured failure mode of this whole repair programme is not a wrong
 * predicate. It is a RIGHT predicate that nothing reads: 51 of 82 audited
 * repairs shipped a measurement wired to no consumer, which is why round after
 * round moved the ledger and not the product. `lib/driveline.mjs` is four such
 * predicates in one file, so §A–§I could all pass with every call site deleted
 * from `lesson-audit.mjs` and every drive would behave exactly as it did
 * before — while `_audit-status.json` grew four new blocks saying so.
 *
 * §J is therefore not decoration and not a style check. It reads the harness
 * as TEXT and asserts, for each capability, that the decision reaches the code
 * that acts on it: the release is called from inside the branch that found the
 * car at zero, the cap gate guards the transition it exists to guard, the
 * boundary check exits, and the repeat series stops recursing. It is the same
 * discipline, and the same argument, as `__tests__/guidance-wiring.test.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CABIN_BLOCKER_SEL,
  cabinActuationSafe,
  CAR_SHEET_LABEL,
  classifyVerdict,
  DRIVELINE_CARD_SEL,
  ERROR_BOUNDARY_RETRIES,
  ERROR_BOUNDARY_RETRY_LABEL,
  errorBoundaryVerdict,
  OVER_CAP_MARGIN_KMH,
  OVER_CAP_MAX_M,
  OVER_CAP_MAX_MS,
  overCapHold,
  PARKING_BRAKE_CARD_RE,
  PARKING_BRAKE_KEY,
  PARKING_BRAKE_LABEL,
  parkingBrakeRoute,
  parkingBrakeVerdict,
  parseTaskCapsKmh,
  passRate,
  RATE_MIN_N,
  rateVerdict,
  RELEASED_MOVING_KMH,
  releaseVerdict,
  SEATBELT_LABEL,
  STUCK_START_OTHER_RE,
  taskCapKmh,
  wilson,
} from "../lib/driveline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8");
/** The harness minus its prose. Half this file's comments QUOTE the code they
 *  explain, so a wiring assertion made against the raw text can be satisfied
 *  by a paragraph about the call it is looking for. Every §J grep runs on
 *  this. (The same trap `platform/scripts/tools-tests.mjs` names when it
 *  strips comments before reading imports.) */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A page read with nothing on it — every field explicitly at its "no witness"
 *  value, so a test that means "the pill is absent" cannot accidentally mean
 *  "the pill said false". */
const BLANK = {
  shell: true, sheetOpen: false, sheetOpener: false, pillPresent: false,
  pill: null, belt: null, card: false, otherBlocker: false,
  hotspotChip: false, chipAt: null, blocker: null,
};
const dom = (over) => ({ ...BLANK, ...over });

// ---------------------------------------------------------------------------
describe("§A the parking brake — is the lever up?", () => {
  it("says HELD on the pill alone, on the card alone, and on both", () => {
    assert.equal(parkingBrakeVerdict(dom({ pill: true })).held, true);
    assert.equal(parkingBrakeVerdict(dom({ card: true })).held, true);
    const both = parkingBrakeVerdict(dom({ pill: true, card: true }));
    assert.equal(both.held, true);
    assert.equal(both.by.length, 2, "both witnesses must be named, not just the first one found");
  });

  it("says DOWN only on the pill, which is one hop from the driveline boolean", () => {
    const v = parkingBrakeVerdict(dom({ pill: false }));
    assert.equal(v.held, false);
    assert.match(v.why, /pill/);
  });

  it("REFUSES when the two witnesses disagree — Space and the cell are TOGGLES", () => {
    // This is the case that immobilises a free car if it resolves either way.
    const v = parkingBrakeVerdict(dom({ pill: false, card: true }));
    assert.equal(v.held, null, "a disagreement must not resolve to a press or to a pass");
    assert.equal(v.conflict, true);
    assert.match(v.why, /toggle/);
  });

  it("REFUSES when a DIFFERENT stuck-start blocker owns the card", () => {
    // stuckStart.ts returns only the FIRST blocker in fix order, so an
    // engine-off car never names the lever — and "no handbrake card" is then
    // not "no handbrake". Getting this wrong reads as `held:false`, i.e. a
    // free car, i.e. the reassuring direction.
    const v = parkingBrakeVerdict(dom({ otherBlocker: true }));
    assert.equal(v.held, null);
    assert.match(v.why, /fix order/);
  });

  it("REFUSES with no witness at all — which is the pc lane before the throttle press", () => {
    assert.equal(parkingBrakeVerdict(dom({})).held, null);
    assert.equal(parkingBrakeVerdict(dom({ shell: false, pill: true })).held, null, "no shell means no reading, whatever else is on the page");
  });

  it("names the product's own sentence and not a paraphrase of it", () => {
    // LessonPlayShell.tsx:499. If this string is ever reworded the witness goes
    // quiet and the verdict falls to `null`, i.e. to a refusal — which is the
    // safe direction, and this assertion is what makes the dependency visible.
    assert.match("Ръчната спирачка е вдигната — колата е задържана", PARKING_BRAKE_CARD_RE);
    assert.doesNotMatch("Лостът е на P — колата е паркирана", PARKING_BRAKE_CARD_RE);
    assert.match("Лостът е на N — двигателят работи, но не е свързан с колелата", STUCK_START_OTHER_RE);
    assert.match("Двигателят е изключен — затова газта не движи колата", STUCK_START_OTHER_RE);
    assert.doesNotMatch("Ръчната спирачка е вдигната — колата е задържана", STUCK_START_OTHER_RE);
  });
});

// ---------------------------------------------------------------------------
describe("§B the parking brake — may anything be pressed from here?", () => {
  it("refuses through a modal, and says why in the product's own terms", () => {
    const v = cabinActuationSafe(dom({ blocker: "teach-moment-title" }));
    assert.equal(v.safe, false);
    assert.match(v.why, /capture phase/);
  });
  it("refuses with no shell, and allows a clear glass", () => {
    assert.equal(cabinActuationSafe(dom({ shell: false })).safe, false);
    assert.equal(cabinActuationSafe(dom({})).safe, true);
  });
  it("the blocker selector names the three surfaces that eat the press", () => {
    for (const s of ['[role="dialog"][aria-modal="true"]', '[data-sim-overlay="teach"]', '[data-hud="end-screen"]']) {
      assert.ok(CABIN_BLOCKER_SEL.includes(s), `${s} is not in the blocker list`);
    }
  });
});

// ---------------------------------------------------------------------------
describe("§C the parking brake — which control does this page offer?", () => {
  it("prefers the open sheet's own cell", () => {
    assert.equal(parkingBrakeRoute(dom({ sheetOpen: true, pillPresent: true })).route, "pill");
  });
  it("opens the sheet when only the ⚙«Кола» button is there", () => {
    assert.equal(parkingBrakeRoute(dom({ sheetOpener: true })).route, "sheet");
  });
  it("falls back to the cockpit chip, and explains why clicking a pointer-events:none node works", () => {
    const v = parkingBrakeRoute(dom({ hotspotChip: true }));
    assert.equal(v.route, "hotspot");
    assert.match(v.why, /pointer-events: none/);
  });
  it("returns NO ROUTE on a pc lane and names all three reasons — this is the refusal that keeps a held car honest", () => {
    const v = parkingBrakeRoute(dom({}));
    assert.equal(v.route, null);
    assert.match(v.why, /TouchControls does not mount/);
    assert.match(v.why, /Space key is refused/);
  });
  it("an open sheet with no cell in it is a route of NONE, not the sheet route again", () => {
    // Otherwise the caller opens the sheet, finds nothing, and re-opens it.
    assert.equal(parkingBrakeRoute(dom({ sheetOpen: true, pillPresent: false })).route, null);
  });
});

// ---------------------------------------------------------------------------
describe("§D the parking brake — did it actually come off?", () => {
  const held = { pill: true, card: true, otherBlocker: false };
  const free = { pill: false, card: false, otherBlocker: false };

  it("THE CAR IS THE STRONGEST WITNESS and it outranks the other two", () => {
    // Even with both DOM witnesses still shouting "held", a car that left zero
    // under the identical throttle was released. The DOM can lag; the car
    // cannot.
    const v = releaseVerdict({ before: held, after: held, kmhBefore: 0, kmhAfter: RELEASED_MOVING_KMH });
    assert.equal(v.released, true);
    assert.equal(v.by, "the car itself");
  });

  it("does not credit a car that was already moving", () => {
    const v = releaseVerdict({ before: held, after: held, kmhBefore: 4, kmhAfter: 20 });
    assert.equal(v.released, false, "kmhBefore > 0 means the first press already moved it; this proves nothing");
  });

  it("credits the pill flipping, and CONVICTS a pill that did not", () => {
    assert.equal(releaseVerdict({ before: held, after: free, kmhBefore: 0, kmhAfter: 0 }).released, true);
    const stuck = releaseVerdict({ before: held, after: { pill: true, card: true }, kmhBefore: 0, kmhAfter: 0 });
    assert.equal(stuck.released, false);
    assert.match(stuck.why, /still up/);
  });

  it("REFUSES to credit the card clearing on a car that never moved", () => {
    // THIS TEST ASSERTED THE FALSE POSITIVE UNTIL 2026-09-13. It passes
    // kmhBefore: 0, kmhAfter: 0 — the car did not move — and demanded
    // released === true on the strength of a notification disappearing.
    //
    // A card can clear without the lever moving: its own 8 s TTL expiring, our
    // own opened sheet hiding the notify column (PlayAreaStyles.tsx:1670), or
    // the DOM probe throwing and returning its all-false default
    // (lesson-audit.mjs:4289). And `released === true` is what silences the
    // refusal at lesson-audit.mjs:9053 — "THIS LANE IS A HELD CAR … No speed,
    // route, tracking, objective-credit or grading finding may be filed off
    // this lane." So the false positive did not mis-report a lever; it
    // re-admitted every finding from a drive that never happened.
    //
    // UNVERIFIED is the honest answer, and it keeps the lane inadmissible.
    const v = releaseVerdict({ before: { pill: null, card: true }, after: { pill: null, card: false }, kmhBefore: 0, kmhAfter: 0 });
    assert.equal(v.released, null);
    assert.match(v.why, /did not move|UNVERIFIED/);

    // …but the card clearing WITH the car leaving zero is a release, and the
    // car is why — case 1 answers before this branch is ever reached.
    const moved = releaseVerdict({ before: { pill: null, card: true }, after: { pill: null, card: false }, kmhBefore: 0, kmhAfter: 9 });
    assert.equal(moved.released, true);
    assert.match(moved.by, /car/);
    // …and a card replaced by ANOTHER blocker is not a release: the lever may
    // be down and the engine off, which is a different car and a different
    // sentence.
    const swapped = releaseVerdict({ before: { pill: null, card: true }, after: { pill: null, card: false, otherBlocker: true }, kmhBefore: 0, kmhAfter: 0 });
    assert.notEqual(swapped.released, true);
  });

  it("returns UNKNOWN, not false, when nothing could speak and the car stayed put", () => {
    const v = releaseVerdict({ before: { pill: null, card: false }, after: { pill: null, card: false }, kmhBefore: 0, kmhAfter: 0 });
    assert.equal(v.released, null);
    assert.match(v.why, /cannot tell/);
  });

  it("the moving threshold is the product's own rounded latch, not a number invented here", () => {
    assert.equal(RELEASED_MOVING_KMH, 6, "the dial rounds; 6 is the first displayed value certainly over the product's `> 5`");
    assert.equal(releaseVerdict({ before: held, after: held, kmhBefore: 0, kmhAfter: 5 }).released, false, "5 could be a rounded 4.5 — it is not proof of movement");
  });
});

// ---------------------------------------------------------------------------
describe("§E the task cap, read off the product's own glass", () => {
  it("reads the objective banner's authored form", () => {
    assert.equal(taskCapKmh("Задача 1/2 Мини контролната зона с готов кокпит — дръж под 50 км/ч"), 50);
  });
  it("reads the advisor's, including the decimal comma the shell's own regex allows", () => {
    assert.equal(taskCapKmh("Вдигни крака от газта ПРЕДИ близките устои — дръж под 47,5 км/ч"), 47.5);
  });
  it("takes the HIGHEST when two surfaces show two caps, so beating it beats both", () => {
    assert.deepEqual(parseTaskCapsKmh("… дръж под 36 км/ч …\n… дръж под 80 км/ч …"), [36, 80]);
    assert.equal(taskCapKmh("… дръж под 36 км/ч …\n… дръж под 80 км/ч …"), 80);
  });
  it("does NOT read a cap out of a TRUNCATED banner — the one ObjectiveBanner.tsx:103 records", () => {
    // «… дръж под 63 км/» is the real, documented ellipsis. A regex that
    // accepted it would invent a cap the student was never shown, and the
    // whole point of reading the glass is that the glass is what happened.
    assert.equal(taskCapKmh("… дръж под 63 км/"), null);
  });
  it("answers null on an empty read, which is the probe's own failure value", () => {
    assert.equal(taskCapKmh(""), null);
    assert.equal(taskCapKmh(undefined), null);
  });
  it("is not a stateful global — two calls on the same text give the same answer", () => {
    // A shared `/g` regex carries lastIndex; this is the assertion that fails
    // if the scan ever stops making its own copy.
    const t = "дръж под 40 км/ч";
    assert.equal(taskCapKmh(t), 40);
    assert.equal(taskCapKmh(t), 40);
  });
});

// ---------------------------------------------------------------------------
describe("§F the over-cap hold on a `wrong` leg", () => {
  it("IS THE IDENTITY with no cap on the glass — every existing wrong lane is untouched", () => {
    const v = overCapHold({ capKmh: null, topKmh: 62, metres: 45 });
    assert.equal(v.hold, false);
    assert.equal(v.done, "no-cap");
  });
  it("holds while the cap is unbeaten, and lets go the moment the margin is cleared", () => {
    assert.equal(overCapHold({ capKmh: 80, topKmh: 62, metres: 45, ms: 9000 }).hold, true);
    assert.equal(overCapHold({ capKmh: 80, topKmh: 84, metres: 45, ms: 9000 }).hold, true, "84 is inside the margin — one dial unit over is a rounding artefact");
    const done = overCapHold({ capKmh: 80, topKmh: 85, metres: 45, ms: 9000 });
    assert.equal(done.hold, false);
    assert.equal(done.done, "proven");
    assert.equal(OVER_CAP_MARGIN_KMH, 5);
  });
  it("gives up at the distance ceiling and SAYS the antecedent was not exercised", () => {
    const v = overCapHold({ capKmh: 80, topKmh: 62, metres: OVER_CAP_MAX_M, ms: 1000 });
    assert.equal(v.hold, false);
    assert.equal(v.done, "metres");
    assert.match(v.why, /ANTECEDENT WAS NOT EXERCISED/);
  });
  it("gives up at the clock ceiling too — a leg that covers no ground still ends its hold", () => {
    const v = overCapHold({ capKmh: 80, topKmh: 3, metres: 5, ms: OVER_CAP_MAX_MS });
    assert.equal(v.hold, false);
    assert.equal(v.done, "clock");
    assert.match(v.why, /ANTECEDENT WAS NOT EXERCISED/);
  });
  it("cannot hold for ever — one of the three exits is reachable from every state", () => {
    // A hold with no way out is a wrong leg driven into a wall for four
    // minutes. This is the property, asserted rather than argued.
    for (const metres of [0, 100, OVER_CAP_MAX_M, OVER_CAP_MAX_M * 2]) {
      for (const ms of [0, 20_000, OVER_CAP_MAX_MS, OVER_CAP_MAX_MS * 2]) {
        const v = overCapHold({ capKmh: 80, topKmh: 0, metres, ms });
        if (metres >= OVER_CAP_MAX_M || ms >= OVER_CAP_MAX_MS) {
          assert.equal(v.hold, false, `the hold survived metres=${metres} ms=${ms}`);
        }
      }
    }
  });
  it("refuses a nonsense cap rather than holding on one", () => {
    for (const capKmh of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "80"]) {
      assert.equal(overCapHold({ capKmh, topKmh: 1, metres: 0, ms: 0 }).hold, false, `held on cap ${String(capKmh)}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe("§G a rate is not a draw", () => {
  it("«НЕИЗДЪРЖАН» IS NOT A PASS — the substring trap, on the alphabet where it bites", () => {
    // `verdict.includes("ИЗДЪРЖАН")` scores every failure as a pass. On this
    // corpus that would turn 1-in-8 into 8-in-8, in the reassuring direction.
    assert.equal(classifyVerdict("НЕИЗДЪРЖАН"), "fail");
    assert.equal(classifyVerdict("ИЗДЪРЖАН"), "pass");
    assert.equal(classifyVerdict("НЕЗАВЪРШЕН"), "unfinished");
    assert.equal(classifyVerdict(null), "unknown");
    assert.equal(classifyVerdict(""), "unknown");
    assert.equal(classifyVerdict("Издържан"), "pass", "the end bar renders it in title case with no text-transform");
  });

  it("publishes NO rate below two judgeable drives — «1 of 1 = 100%» is the whole thing to prevent", () => {
    const r = passRate([{ exit: 0, verdict: "ИЗДЪРЖАН" }]);
    assert.equal(r.point, null);
    assert.equal(r.n, 1);
    assert.match(r.why, new RegExp(`at least ${RATE_MIN_N}`));
    assert.equal(rateVerdict(r, 1 / 8).verdict, "cannot-say");
  });

  it("counts only judgeable drives — a lane that never started is a draw of the harness", () => {
    const r = passRate([
      { exit: 0, verdict: "ИЗДЪРЖАН" },
      { exit: 0, verdict: "НЕИЗДЪРЖАН" },
      { exit: 7, verdict: null },
      { exit: 4, verdict: null },
    ]);
    assert.equal(r.dispatched, 4);
    assert.equal(r.n, 2);
    assert.equal(r.passes, 1);
    assert.equal(r.point, 0.5);
  });

  it("reproduces the filed series — 6 fail / 1 pass / 1 unfinished — and does not refute 13%", () => {
    const runs = [
      ...Array.from({ length: 6 }, () => ({ exit: 0, verdict: "НЕИЗДЪРЖАН", head: "641a4475c0ac" })),
      { exit: 0, verdict: "ИЗДЪРЖАН", head: "641a4475c0ac" },
      { exit: 0, verdict: "НЕЗАВЪРШЕН", head: "641a4475c0ac" },
    ];
    const r = passRate(runs);
    assert.equal(r.n, 8);
    assert.equal(r.counts.fail, 6);
    assert.equal(r.counts.pass, 1);
    assert.equal(r.counts.unfinished, 1);
    assert.equal(r.passes / r.n, 0.125);
    assert.equal(rateVerdict(r, 1 / 8).verdict, "consistent");
    // …and the interval is WIDE, which is the honest thing about eight draws.
    assert.ok(r.hi95 > 0.4, `eight draws cannot pin a rate; hi95 was ${r.hi95}`);
  });

  it("refutes a claim the interval excludes", () => {
    const runs = Array.from({ length: 20 }, () => ({ exit: 0, verdict: "ИЗДЪРЖАН", head: "a" }));
    const r = passRate(runs);
    assert.equal(rateVerdict(r, 1 / 8).verdict, "refutes");
  });

  it("REFUSES to attribute a rate to a build the series did not stay on", () => {
    const r = passRate([
      { exit: 0, verdict: "ИЗДЪРЖАН", head: "aaa" },
      { exit: 0, verdict: "НЕИЗДЪРЖАН", head: "bbb" },
    ]);
    assert.equal(r.buildStable, false);
    assert.equal(rateVerdict(r, 0.5).verdict, "cannot-say", "a rate spanning two commits is not about either of them");
    assert.match(r.why, /tree moved/);
  });

  it("wilson behaves at the ends, which is exactly where a short series lands", () => {
    const zero = wilson(0, 8);
    assert.equal(zero.lo, 0);
    assert.ok(zero.hi > 0 && zero.hi < 1, "a 0/8 upper bound of 0 would claim certainty from eight draws");
    const all = wilson(8, 8);
    assert.equal(all.hi, 1);
    assert.ok(all.lo > 0 && all.lo < 1);
    assert.deepEqual(wilson(1, 0), { lo: null, hi: null });
    assert.deepEqual(wilson(3, 2), { lo: null, hi: null });
  });
});

// ---------------------------------------------------------------------------
describe("§H the product's error boundary is not a lesson", () => {
  const BOUNDARY =
    "Към съдържанието К Книжка.AI Отвори менюто СИСТЕМЕН ДОКЛАД Нещо се обърка Не е по твоя вина — " +
    "секцията отказа да зареди. Прогресът ти е запазен. Опитай отново или се върни към таблото. " +
    "Код: 1262971832 Опитай отново Към таблото";

  it("recognises the exact page w41 photographed for 200 s, digest and all", () => {
    // Copied verbatim out of
    // `.audit-frames/w41/frames/sc-vu-emergency__mobile-right/run.log`'s
    // «DEBRIEF TEXT >>>» line, i.e. through `innerText` — which is why the
    // label arrives UPPERCASED by `hud-label`'s CSS.
    const v = errorBoundaryVerdict({ text: BOUNDARY, shell: false, retryPresent: true });
    assert.equal(v.boundaried, true);
    assert.equal(v.digest, "1262971832");
  });

  it("…and the SAME page read through textContent, where the CSS transform is not applied", () => {
    // The two readers disagree on casing and agree on nothing else mattering.
    // A predicate that only knew one of them would be blind on the other, and
    // this harness's probe uses the one the recorded log does NOT.
    const v = errorBoundaryVerdict({
      text: "Системен доклад Нещо се обърка Не е по твоя вина — секцията отказа да зареди. Код: 1262971832 Опитай отново",
      shell: false,
      retryPresent: true,
    });
    assert.equal(v.boundaried, true);
    assert.equal(v.digest, "1262971832");
  });

  it("STRUCTURE FIRST — a page with a lesson shell on it is never a boundary", () => {
    // A lesson whose teach copy happened to contain the words must not be
    // condemned, and a boundary REPLACES the segment, so the shell settles it.
    assert.equal(errorBoundaryVerdict({ text: BOUNDARY, shell: true }).boundaried, false);
  });

  it("does not condemn the paywall — the other page that has no shell", () => {
    const paywall = "Шофьорският симулатор те чака · Виж пакета — 21,99 € еднократно";
    assert.equal(errorBoundaryVerdict({ text: paywall, shell: false }).boundaried, false);
  });

  it("needs BOTH sentences — one of them alone is any error copy in the app", () => {
    assert.equal(errorBoundaryVerdict({ text: "Нещо се обърка. Опитай отново.", shell: false }).boundaried, false);
    assert.equal(errorBoundaryVerdict({ text: "Системен доклад", shell: false }).boundaried, false);
  });

  it("survives a boundary with no digest", () => {
    const v = errorBoundaryVerdict({ text: "Системен доклад Нещо се обърка Опитай отново", shell: false });
    assert.equal(v.boundaried, true);
    assert.equal(v.digest, null);
  });

  it("the retry label is the product's own control and the count is bounded", () => {
    assert.equal(ERROR_BOUNDARY_RETRY_LABEL, "Опитай отново");
    assert.ok(ERROR_BOUNDARY_RETRIES >= 1 && ERROR_BOUNDARY_RETRIES <= 3, "a third press is a wait, not a retry");
  });
});

// ---------------------------------------------------------------------------
describe("§I the selectors and labels name real product surfaces", () => {
  it("the card scan looks at overlay/notify surfaces and not at the whole shell", () => {
    // `textContent` over the shell would match a card that is in the DOM and
    // not on the glass, which is a witness that cannot be trusted.
    assert.ok(DRIVELINE_CARD_SEL.includes("[data-sim-overlay]"));
    assert.ok(DRIVELINE_CARD_SEL.includes('[data-hud="notify-column"]'));
    assert.ok(!/data-sim-shell/.test(DRIVELINE_CARD_SEL));
  });
  it("the two «Контроли на автомобила» surfaces share one label, so the constant is one string", () => {
    assert.equal(CAR_SHEET_LABEL, "Контроли на автомобила");
    assert.equal(PARKING_BRAKE_LABEL, "Ръчна спирачка");
    assert.equal(SEATBELT_LABEL, "Предпазен колан");
  });
  it("the key constant still records what the product binds, even though the harness does not press it", () => {
    assert.equal(PARKING_BRAKE_KEY, "Space");
  });
});

// ---------------------------------------------------------------------------
describe("§J the drive path actually calls all of it", () => {
  it("imports the module — without this every assertion above is about dead code", () => {
    assert.match(CODE, /from "\.\/lib\/driveline\.mjs"/, "lesson-audit.mjs no longer imports lib/driveline.mjs");
  });

  // ── 1 · THE PARKING BRAKE ────────────────────────────────────────────────
  it("reads the driveline off the page, with a scoped evaluate and not off read().strings", () => {
    assert.match(CODE, /const readDriveline = \(\) =>/, "the driveline reader is gone");
    assert.match(CODE, /page\s*\n?\s*\.evaluate\(/, "readDriveline no longer evaluates in the page");
    // The 26-string cap in `read()` is exactly why this must be its own probe.
    assert.match(CODE, /strings\.length >= 26/, "read()'s census cap moved; re-check whether readDriveline is still needed");
  });

  it("CALLS the release from inside the branch that found the car at zero", () => {
    assert.match(CODE, /async function releaseParkingBrake\(/, "releaseParkingBrake is gone");
    const branch = CODE.match(/if \(moved <= 0\) \{[\s\S]{0,1200}?\n  \}/);
    assert.ok(branch, "the positive control's `moved <= 0` branch is gone");
    assert.match(
      branch[0],
      /await releaseParkingBrake\(/,
      "the release is DEFINED and not CALLED — every sc-vp-readiness lane is a frozen world again and the log says so in the product's voice",
    );
  });

  it("gates the press on the verdict and on the route, and verifies with a re-press", () => {
    const fn = CODE.match(/async function releaseParkingBrake\([\s\S]*?\n\}/);
    assert.ok(fn, "releaseParkingBrake's body could not be read");
    const body = fn[0];
    // BOTH gate points, named separately. MEASURED by mutation: a bare
    // `/parkingBrakeVerdict\(/` was satisfied by the SECOND call while the
    // first was neutered, i.e. a blind press with a green test — the same
    // "an assertion a second call site keeps alive" escape §J's boundary row
    // records. The two readings answer different questions: `before` is taken
    // with the sheet shut (card only), `at` with it open (card AND pill), and
    // the toggle is pressed on the second.
    assert.match(body, /const verdict = parkingBrakeVerdict\(before\);/, "the press is no longer gated on the pre-press reading — it is blind");
    assert.match(body, /const second = parkingBrakeVerdict\(at\);/, "the verdict is not re-taken once the sheet adds the pill witness — a stale card can now toggle a free car's lever UP");
    assert.match(body, /verdict\.held !== true/, "the refusal on a three-valued answer is gone; `null` will now press");
    assert.match(body, /second\.held !== true/, "the second reading is taken and not acted on — a predicate nothing reads");
    assert.match(body, /cabinActuationSafe\(/, "the modal guard is gone — a press through a teach card acks the card");
    assert.match(body, /parkingBrakeRoute\(/, "the route choice is gone");
    assert.match(body, /releaseVerdict\(/, "the press is no longer verified — this is the reassuring-direction failure by name");
    assert.match(body, /repress\(/, "the verification no longer re-presses the throttle, so the strongest witness is gone");
  });

  it("publishes the whole block, so a judge can see a HELD car without reading the log", () => {
    assert.match(CODE, /saveStatus\(\{ positiveControl, parkingBrake \}\)/, "the parking-brake block is not saved beside the positive control");
    assert.match(CODE, /^\s*parkingBrake,$/m, "the parking-brake block is missing from the final status object");
    assert.match(CODE, /THIS LANE IS A HELD CAR/, "the loud line that voids a held lane's findings is gone");
  });

  it("PRESSES NO KEY — the closed keyboard grammar in platform/src is not this lane's to widen", () => {
    // `reverseAssist-audit-harness.test.ts` §1 censuses every keyboard call in
    // this harness and asserts the grammar as a CLOSED set
    // ["BracketRight","Escape","KeyA","KeyB","KeyD","KeyS","KeyW","KeyZ"],
    // «stated so ANY new key fails here and has to be argued for». Adding
    // "Space" turns that gate red in a file this lane may read and may not
    // write, so the release goes through the product's own controls instead.
    // THIS ASSERTION IS THE HANDOVER: it fails the day somebody adds the key
    // here, which is the day that gate has to be updated in the same change.
    const kb = [...CODE.matchAll(/keyboard\.(?:down|up|press)\(\s*([^),]+)/g)].map((m) => m[1].trim());
    assert.ok(kb.length > 3, "no keyboard calls found — this matcher is broken and the assertion below is vacuous");
    for (const arg of kb) {
      assert.ok(!/Space|PARKING_BRAKE_KEY/.test(arg), `the harness now presses ${arg} — update the closed grammar in platform/src/modules/sim/engine/__tests__/reverseAssist-audit-harness.test.ts in the same change, or that gate goes red`);
    }
    // …and the route it uses instead really is the product's own control.
    assert.match(CODE, /role="toolbar"\]\[aria-label="\$\{CAR_SHEET_LABEL\}"\] button\[aria-label="\$\{PARKING_BRAKE_LABEL\}"\]/, "the «РЪЧНА» cell selector is gone");
    assert.match(CODE, /page\.mouse\.click\(at\.chipAt\.x, at\.chipAt\.y\)/, "the cockpit-hotspot fallback click is gone");
  });

  // ── 2 · THE TASK CAP ─────────────────────────────────────────────────────
  it("reads the cap off the glass on every tick and folds it into the hold", () => {
    assert.match(CODE, /taskCapText:/, "probe() no longer returns the banner/advisor text the cap is read from");
    assert.match(CODE, /taskCapKmh\(p\.taskCapText\)/, "nothing parses a cap out of the probe");
    assert.match(CODE, /overCapHold\(\{/, "the hold decision is gone");
  });

  it("the hold GUARDS the rest transition — a flag nothing reads is the dead-predicate class", () => {
    assert.match(
      CODE,
      /if \(!holdRest && \(flatM >= FLAT_REST_EVERY_M/,
      "`holdRest` no longer guards the flat→flat-rest transition, so the wrong leg still rests at 45 m and still tops out under every task cap",
    );
  });

  it("does not `continue` past the frame block — an antecedent bought with no photographs is not evidence", () => {
    const branch = CODE.match(/if \(!overCap\.proven && overCap\.done === null\) \{[\s\S]*?\n      \}/);
    assert.ok(branch, "the over-cap block could not be read");
    assert.ok(!/\bcontinue;/.test(branch[0]), "the hold branch skips the rest of the tick again — the periodic frames go with it");
  });

  it("is scoped to the `wrong` leg only, and is reported there", () => {
    assert.match(CODE, /overCap: MODE === "right" \? null : overCap/, "the over-cap block is not published, or is published on a right lane where it means nothing");
    assert.match(CODE, /THE WRONG LEG DID NOT BEAT ITS TASK CAP/, "the loud line for a hold that gave up is gone — «we tried» would close the row it was built to open");
  });

  // ── 3 · THE REPEAT SERIES ────────────────────────────────────────────────
  it("reads KNIJKA_REPEAT, and the default is byte-for-byte the old single drive", () => {
    assert.match(CODE, /process\.env\.KNIJKA_REPEAT/, "the repeat count is not read");
    assert.match(CODE, /if \(REPEAT_N >= 2\) \{/, "the series runs on 0 or 1 too — every existing caller's lane just changed shape");
  });

  it("STOPS RECURSING — the child must not inherit the count", () => {
    const block = CODE.match(/if \(REPEAT_N >= 2\) \{[\s\S]*?\n\}/);
    assert.ok(block, "the repeat block could not be read");
    assert.match(block[0], /delete env\.KNIJKA_REPEAT;/, "the child inherits KNIJKA_REPEAT — this forks for ever");
    assert.match(block[0], /spawnSync\(process\.execPath, \[SELF, dir, SCENARIO, PLATFORM, MODE\]/, "the child is not this same harness on the same lane");
  });

  it("publishes the rate through the arithmetic, not by hand", () => {
    assert.match(CODE, /const rate = passRate\(runs\);/, "the series computes its own rate instead of using the tested one");
    assert.match(CODE, /rateVerdict\(rate, 1 \/ 8\)/, "the series no longer compares itself against the 13% the row claims");
    assert.match(CODE, /_audit-repeat\.json/, "the series writes no machine-readable record");
    assert.match(CODE, /phase: "repeat-series"/, "the series folder has no status file — a lane reader will call it «never dispatched»");
  });

  // ── 4 · THE ERROR BOUNDARY ───────────────────────────────────────────────
  it("checks for the boundary at arrival and presses the product's own retry", () => {
    // `let boundary = …`, i.e. the FIRST read, at arrival — not the one inside
    // the retry loop. MEASURED by mutation: neutering only the arrival read
    // left the loop's identical call in the source and this assertion green,
    // while no boundary would ever be detected (the loop is inside the branch
    // the arrival read gates). A wiring assertion satisfied by unreachable
    // code is the same blindness as no assertion at all.
    assert.match(CODE, /let boundary = errorBoundaryVerdict\(await readBoundary\(\)\)/, "nothing checks for the error boundary AT ARRIVAL");
    assert.match(CODE, /ERROR_BOUNDARY_RETRIES/, "the retry loop is gone");
    assert.match(CODE, /button:has-text\("\$\{ERROR_BOUNDARY_RETRY_LABEL\}"\)/, "the product's own «Опитай отново» is never pressed");
  });

  it("STOPS instead of driving a crash page, and keeps exit 7's meaning", () => {
    const bail = CODE.match(/if \(boundary\.boundaried\) \{[\s\S]*?process\.exit\(EXIT_DRIVE_NEVER_STARTED\);/);
    assert.ok(bail, "a boundaried lane is no longer abandoned — it drives 200 s of a crash page again");
    assert.match(bail[0], /DRIVE_CLASSES\["never-started"\]/, "the drive block is hand-rolled instead of taking its shape from DRIVE_CLASSES");
    assert.match(bail[0], /browser\.close\(\)/, "the bail leaks a browser");
  });

  it("names WHICH silence it is — the sentence classifyDrive could not write", () => {
    assert.match(CODE, /This is NOT the paywall/, "the boundary bail no longer distinguishes itself from the paywall, which was the whole point");
  });
});

// ---------------------------------------------------------------------------
/**
 * §K — THE PRODUCT SURFACES THIS READER STANDS ON.
 *
 * Every predicate above fails SAFE: a renamed label or a reworded card makes
 * the witness go quiet, `parkingBrakeVerdict` returns `null`, and the harness
 * refuses to press. That is the right direction and it is also SILENT, and a
 * silent instrument is the thing this whole programme keeps paying for — 51 of
 * 82 audited repairs shipped a predicate nothing read, and nobody found out
 * from a green suite.
 *
 * So the dependency is made loud here. `tools/` may READ platform/src and may
 * not write it, which is exactly the arrangement
 * `lesson-ui/__tests__/touchHintLifetime.test.ts` uses in the other direction
 * («the instrument still asks it the same way — this may go red for a GOOD
 * reason»). A red row here is not necessarily a bug: it is the product having
 * moved, and the instrument finding out on the same commit instead of two
 * sweeps later.
 *
 * NOTE ON WHAT COULD NOT BE VERIFIED. No live drive backs these assertions —
 * there was no dev server up, and starting `next dev` while another lane is
 * mid-edit in platform/src risks poisoning `.next` for them (a measured
 * failure on this box: PostCSS worker timeouts leave 500s that a restart does
 * not clear). What IS recorded, in
 * `.audit-frames/w41/frames/sc-vp-readiness__mobile-right/run.log`, is that the
 * ⚙«Кола» opener was on the glass on that lane — «ИзгледРамоПауза ⇦Мигач
 * ⇨Мигач ⊙Клакс ⚙Кола …» — and that `inputChannel.overlayMounted` was `true`
 * there and `false` on pc-right. The route the release takes exists exactly
 * where this file says it does, and does not exist exactly where it refuses.
 */
describe("§K the product surfaces this reader stands on", () => {
  const REPO = resolve(HERE, "..", "..", "..");
  const src = (p) => readFileSync(resolve(REPO, p), "utf8");

  it("the «РЪЧНА» cell is still a labelled, aria-pressed button in a named toolbar", () => {
    const T = src("platform/src/components/sim/TouchControls.tsx");
    assert.ok(T.includes(`labelBg="${PARKING_BRAKE_LABEL}"`), "TouchControls no longer labels the parking-brake cell «Ръчна спирачка»");
    assert.ok(T.includes("aria-pressed={active}"), "SheetCell no longer publishes its state as aria-pressed — the pill witness is blind");
    assert.ok(T.includes(`aria-label={labelBg}`), "SheetCell no longer publishes its label");
    assert.ok(T.includes(`aria-label="${CAR_SHEET_LABEL}"`), "the driveline sheet's toolbar label moved");
    assert.ok(T.includes(`labelBg="${SEATBELT_LABEL}"`), "the belt cell's label moved");
    assert.ok(/\{sheetOpen \? \(/.test(T), "the sheet is no longer conditional — the `sheet` route may now be unnecessary, or may be broken");
  });

  it("the held-car card still says what the card witness listens for", () => {
    const S = src("platform/src/components/sim/lesson-ui/LessonPlayShell.tsx");
    const m = S.match(/titleBg: "(Ръчната спирачка[^"]*)"/);
    assert.ok(m, "LessonPlayShell no longer prints a «Ръчната спирачка …» stuck-start title");
    assert.match(m[1], PARKING_BRAKE_CARD_RE, `the card now reads «${m[1]}» and the witness regex no longer matches it`);
    // …and the other three titles, which are what keeps "no handbrake card"
    // from being read as "no handbrake".
    for (const other of ["Двигателят е изключен", "Двигателят угасна", "Лостът е на P", "Лостът е на N"]) {
      assert.ok(S.includes(`titleBg: "${other}`), `the «${other}…» stuck-start title moved — a car held by that blocker will now read as UNHELD`);
      assert.match(other, STUCK_START_OTHER_RE);
    }
  });

  it("the cap phrasing is still the one the shell's own regex emits", () => {
    const S = src("platform/src/components/sim/lesson-ui/LessonPlayShell.tsx");
    assert.ok(S.includes("дръж под "), "the «дръж под N км/ч» cap phrasing is gone from the shell");
    assert.ok(/CAP_ONLY_RX = \/\^дръж под \(\\d\+\(\?:\[\.,\]\\d\+\)\?\) км\\\/ч\$\/u/.test(S), "the shell's own cap regex changed shape — re-derive TASK_CAP_RE from it");
  });

  it("Space is still the product's parking-brake key, even though this harness does not press it", () => {
    const C = src("platform/src/modules/sim/scene/cabin.ts");
    assert.ok(C.includes(`parkingBrake: "${PARKING_BRAKE_KEY}"`), "DRIVELINE_KEYS.parkingBrake moved");
    assert.ok(C.includes("case DRIVELINE_KEYS.parkingBrake:"), "the cabin no longer routes that key to the toggle");
    assert.ok(C.includes("toggleParkingBrake()"), "CabinControls.toggleParkingBrake is gone — both routes this harness uses go through it");
  });

  it("THE HANDOVER — the closed keyboard grammar still refuses Space, so the pc half is still blocked", () => {
    // This is the assertion that RETIRES the pc refusal. `parkingBrakeRoute`
    // returns null on a non-touch lane and says the key is refused by this
    // gate; the day somebody adds "Space" to it (with the argument the gate
    // demands — see the note on PARKING_BRAKE_KEY), this row goes red and the
    // next lane is told, in one line, that the pc release can now be built.
    const G = src("platform/src/modules/sim/engine/__tests__/reverseAssist-audit-harness.test.ts");
    const set = G.match(/expect\(keys\)\.toEqual\(\[([\s\S]*?)\]\);/);
    assert.ok(set, "the closed keyboard grammar could not be found — re-check whether Space is still refused before trusting parkingBrakeRoute's refusal text");
    assert.ok(
      !/"Space"/.test(set[1]),
      "the harness's closed keyboard grammar now ALLOWS Space — the pc parking-brake release is no longer blocked, so build it: press DRIVELINE_KEYS.parkingBrake where parkingBrakeRoute returns null, and delete the «Space key is refused» clause from its why",
    );
  });

  it("TouchControls really is touch-only, which is the whole reason the pc lane is refused", () => {
    const L = src("platform/src/components/sim/LessonScene.tsx");
    assert.ok(/touchCapable \? \(?\s*<TouchControls/.test(L), "TouchControls' mount condition changed — a pc lane may now have the «РЪЧНА» cell after all, which would make the refusal wrong");
  });

  it("the cockpit hotspot fallback is still a click-through chip over a real mesh", () => {
    const H = src("platform/src/modules/sim/scene/vitok/hotspots.ts");
    assert.ok(H.includes('name: "hotspot_parking_brake"'), "the parking-brake hotspot is gone");
    assert.ok(H.includes(`shortBg: "${PARKING_BRAKE_LABEL}"`), "the chip's own text is what the fallback aims at, and it moved");
    assert.ok(H.includes('type: "parkingBrakeToggle"'), "the hotspot no longer toggles the brake");
    const V = src("platform/src/components/sim/vitok/VitokCockpit.tsx");
    assert.ok(V.includes('pointerEvents: "none"'), "the chip now swallows pointer events — a click at its centre no longer reaches the mesh, and the fallback is dead");
  });

  it("the error boundary still prints both sentences and carries its own retry", () => {
    const E = src("platform/src/app/(dashboard)/error.tsx");
    assert.match(E, /Системен доклад/u, "the boundary's label moved");
    assert.match(E, /Нещо се обърка/u, "the boundary's title moved");
    assert.ok(E.includes(ERROR_BOUNDARY_RETRY_LABEL), "the boundary's «Опитай отново» control moved — the retry loop presses nothing");
    assert.ok(E.includes("unstable_retry()"), "the retry no longer re-fetches the failed segment, so pressing it cannot recover a transient timeout");
    assert.ok(E.includes("Код: {error.digest}"), "the digest line is gone — a boundaried lane can no longer be joined to a server log");
    assert.ok(!E.includes("data-sim-shell"), "the boundary now mounts a lesson shell, which breaks the structure test that tells it from a lesson");
  });

  it("the two lessons that spawn with the lever up are still exactly two, and still those two", () => {
    // If a third joins them, every lane of it is a frozen world until this
    // release runs there too — and on `pc` it cannot. That is worth knowing
    // from a gate rather than from a sweep.
    const P = src("platform/src/modules/sim/scene/spawnParkingBrake.test.ts");
    const m = P.match(/const BRAKE_DRILL_BY_NAME = \[([^\]]*)\]/);
    assert.ok(m, "the parking-brake drill list could not be read");
    assert.deepEqual(
      m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean).sort(),
      ["sc-vp-handbrake", "sc-vp-readiness"],
      "the set of lessons handed over with the parking brake UP has changed — check that every new one has a touch lane, because a pc lane of one cannot be released",
    );
  });
});
