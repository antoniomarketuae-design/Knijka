/**
 * L10's invariant on the OTHER red lamp — the hand-over parking-brake state
 * must not falsify the lesson's own lamp sentence.
 *
 * MEASURED, `.audit-frames/w10-3/frames/sc-vp-handbrake__pc-wrong/`. The
 * lesson is „Потегляне с вдигната ръчна". Briefing step 2 reads «Свали ръчната
 * докрай и погледни таблото: червената лампа за ръчна спирачка ТРЯБВА да
 * угасне. Свети ли още — ръчната не е долу.» On 01-arrival.png the car is at
 * 0 км/ч in D with no input yet and the cabin telltale block shows exactly one
 * lit lamp — the belt. `brake` (slot 3 of LAMP_KEYS) is dark there and still
 * dark on 04-t011s.png at 59 км/ч, on the lane whose whole premise is that the
 * handbrake was never lowered; so is the РЪЧНА pill in the PC control strip.
 *
 * TWO CRITICAL ROWS BLAMED InstrumentCluster.tsx AND THE INSTRUMENT IS
 * INNOCENT. `clusterReadout.lampBank` maps `parkingBrakeOn → brake: "warn"`,
 * VitokCockpit's sampler feeds it, TouchControls' РЪЧНА pill takes
 * `active={snap.parkingBrakeOn}` and StatusDashboard paints it `--danger`.
 * Four shipped surfaces render the state; the state was false, because
 * `start.vehicleStart: "ready"` builds `DrivelineState("ready")`, which sets
 * `parkingBrakeOn = false`. The lesson's headline act arrived pre-performed —
 * `sc-park-night`'s defect exactly, on a different switch.
 *
 * WHAT THIS FILE PINS, and why in three independent ways. The lamp gate next
 * door records what a single-source test costs: it derived its expectation
 * from the same constant the implementation read, so a MISSING member was
 * unrepresentable and the suite stayed green for seven rounds with the defect
 * in the frame. So: (1) the partition is typed BY NAME from reading the
 * authored Bulgarian, and the derivation must reproduce it over the real
 * catalogue; (2) the sentences themselves are asserted clause by clause, so an
 * imperative, a participle and a hedge are told apart on their own words; and
 * (3) the two consumers are checked — CabinControls really pulls the lever,
 * and the cluster's lamp law really lights on it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lampBank, createClusterInputs, createClusterReadout } from "../cockpit";
import { SCENARIO_TEMPLATES } from "../lessons/scenario";
import {
  CabinControls,
  briefingOrdersParkingBrakeOff,
  initialParkingBrakeOnFor,
  isParkingBrakeDrillLesson,
  parkingBrakeDrillTemplateIds,
} from "./cabin";

/**
 * READ BY EYE off `templates-cockpit.ts` / `templates-cockpit2.ts`, not from
 * the predicate. These are the only two templates in the catalogue whose
 * briefing tells the student to release the parking brake:
 *   sc-vp-readiness  step 2 «Свали ръчната спирачка докрай — освобождаването ѝ
 *                            е част от процедурата за потегляне.»
 *   sc-vp-handbrake  step 2 «Свали ръчната докрай и погледни таблото: червената
 *                            лампа за ръчна спирачка ТРЯБВА да угасне.»
 * Both are VP-05 templates that author a `HANDBRAKE_LEFT_ON` mistake demo.
 */
const BRAKE_DRILL_BY_NAME = ["sc-vp-handbrake", "sc-vp-readiness"];

describe("the parking brake at hand-over", () => {
  it("arms exactly the two templates whose briefing orders the release", () => {
    expect([...parkingBrakeDrillTemplateIds()].sort()).toEqual(BRAKE_DRILL_BY_NAME);
  });

  it("leaves every other template's hand-over untouched", () => {
    const moved = SCENARIO_TEMPLATES.filter(
      (spec) =>
        initialParkingBrakeOnFor({
          vehicleStart: "ready",
          preDrive: false,
          lessonId: spec.id,
        }) && !BRAKE_DRILL_BY_NAME.includes(spec.id),
    ).map((s) => s.id);
    // 167 templates today; the two above are the whole of the change.
    expect(moved).toEqual([]);
  });

  it("hands the drill's car over with the brake pulled, at every rung", () => {
    for (const templateId of BRAKE_DRILL_BY_NAME) {
      for (const level of [1, 2, 3, 4, 5]) {
        expect({
          lessonId: `${templateId}@L${level}`,
          brakeOn: initialParkingBrakeOnFor({
            vehicleStart: "ready",
            preDrive: false,
            lessonId: `${templateId}@L${level}`,
          }),
        }).toEqual({ lessonId: `${templateId}@L${level}`, brakeOn: true });
      }
    }
  });

  it("never second-guesses a spawn policy that already owns the lever", () => {
    // A cold start IS brake-on (DrivelineState's constructor) and a pre-drive
    // lesson GRADES the release as a step. Returning true in either case would
    // be a second source of truth for one field.
    expect(
      initialParkingBrakeOnFor({
        vehicleStart: "cold",
        preDrive: false,
        lessonId: "sc-vp-handbrake@L1",
      }),
    ).toBe(false);
    expect(
      initialParkingBrakeOnFor({
        vehicleStart: "ready",
        preDrive: true,
        lessonId: "sc-vp-handbrake@L1",
      }),
    ).toBe(false);
  });

  it("does not know the lesson from a hand-typed id", () => {
    // The override exists so the rule can be exercised without the catalogue —
    // and so a curriculum lesson, an exam or a test id keeps the old hand-over.
    expect(
      initialParkingBrakeOnFor({
        vehicleStart: "ready",
        preDrive: false,
        lessonId: "lex-exam-1",
      }),
    ).toBe(false);
    expect(isParkingBrakeDrillLesson("nope-not-a-template")).toBe(false);
  });
});

describe("the sentence, clause by clause", () => {
  it("reads an unconditional imperative as an order", () => {
    expect(
      briefingOrdersParkingBrakeOff([
        "Свали ръчната докрай и погледни таблото: червената лампа за ръчна спирачка ТРЯБВА да угасне. Свети ли още — ръчната не е долу.",
      ]),
    ).toBe(true);
    expect(briefingOrdersParkingBrakeOff(["Освободи ръчната спирачка и потегли плавно."])).toBe(
      true,
    );
  });

  it("does not read a PARTICIPLE as an order", () => {
    // sc-vp-readiness step 5 — «свалена» describes the state the student is
    // already in. Treating it as an order would be harmless here (the same
    // template is armed by step 2) and wrong on the next template that says it.
    expect(
      briefingOrdersParkingBrakeOff([
        "Продължи с поставен колан и свалена ръчна до края на отсечката.",
      ]),
    ).toBe(false);
  });

  it("does not read a CHECK as an order", () => {
    // sc-vp-handbrake step 5 / sc-vp-readiness step 4 — a contingency, not the
    // act. If this armed the spawn, every lesson that merely mentions the lever
    // in a hedge would hand its student a locked car.
    expect(
      briefingOrdersParkingBrakeOff([
        "Ако колата тегли тежко и не набира скорост или лампата свети в движение — спри и провери ръчната, вместо да натискаш газта.",
      ]),
    ).toBe(false);
  });

  it("does not read the FOOT brake as the parking brake", () => {
    expect(briefingOrdersParkingBrakeOff(["Отпусни спирачката и остави колата да се приплъзне."])).toBe(
      false,
    );
  });

  it("keeps the hedge bound to its own clause", () => {
    // The lamp predicate's split, and the same reason: an explanation after the
    // dash must not make the order in front of it conditional.
    expect(
      briefingOrdersParkingBrakeOff([
        "Свали ръчната спирачка докрай — ако колата тегли, не давай повече газ.",
      ]),
    ).toBe(true);
    expect(
      briefingOrdersParkingBrakeOff(["Ако си на наклон, свали ръчната чак след като дадеш газ."]),
    ).toBe(false);
  });
});

describe("the two consumers", () => {
  it("CabinControls really pulls the lever, without forging a performed step", () => {
    // CabinControls binds window listeners; the node env has no window, so give
    // it the two methods it touches and take them away again.
    const events: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    try {
      const cabin = new CabinControls({}, "ready", "off", true);
      const unsubscribe = cabin.driveline.subscribe((e) => events.push(e));
      expect(cabin.driveline.parkingBrakeOn).toBe(true);
      // A `parkingBrakeChanged` at t = 0 would be read by the A2 procedure
      // observer as a step the student performed. Nobody performed anything.
      expect(events).toEqual([]);
      unsubscribe();
      cabin.dispose();

      const plain = new CabinControls({}, "ready", "off");
      expect(plain.driveline.parkingBrakeOn).toBe(false);
      plain.dispose();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("the cluster's lamp law lights `brake` red on exactly that state", () => {
    const inputs = createClusterInputs();
    const readout = createClusterReadout();
    inputs.parkingBrakeOn = true;
    expect(lampBank(inputs, readout.lamps).brake).toEqual({ tone: "warn", pulse: false });
    inputs.parkingBrakeOn = false;
    expect(lampBank(inputs, readout.lamps).brake).toEqual({ tone: "off", pulse: false });
  });

  /**
   * THE BINDING IS MEASURED BY MOUNTING THE SCENE, NOT HERE.
   * `components/sim/__tests__/spawnParkingBrakeSeam.test.tsx` runs `ReadyScene`
   * through the hook harness and reads the `CabinControls` its own effect
   * constructed. That file carries the mutation that overturned the first
   * version of the test below, and the reason a source scan could not catch it.
   *
   * What survives here is the SHAPE of the call — a second, independent
   * detector, and the one that speaks when the argument is not neutralised but
   * simply gone. It is kept because the two fail differently: the seam test
   * says „the lever is down", this one says „the argument stopped being the
   * rule", and a future refactor that swaps the arguments' ORDER would be
   * caught by this one first, with a message about the call site.
   */
  it("…and the call site still hands it the rule, in the fourth position", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../../components/sim/LessonScene.tsx"),
      "utf8",
    );
    const open = source.indexOf("new CabinControls(");
    const close = source.indexOf("cabinRef.current = cabin;", open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);

    // COMMENTS STRIPPED FIRST, and that is not tidiness. The wave-2 sweep
    // found two gates a COMMENTED-OUT line satisfied — a regex over raw file
    // text that a commented-out interval still matched, 43 tests green while
    // the card froze. Prose about the rule must never be able to satisfy the
    // rule, so the argument list below is parsed out of code only.
    const code = source
      .slice(open + "new CabinControls(".length, close)
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/[^\n]*/gu, "");

    // Split the argument list on top-level commas — a real parse, not a regex.
    // `}) && false,` (the mutation that walked past the first version of this
    // test) leaves tokens AFTER the closing paren of the call, and the anchored
    // match below refuses them; commenting the argument out leaves three
    // arguments, and the length assertion refuses that.
    const args: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i]!;
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") {
        if (depth === 0) {
          args.push(code.slice(start, i));
          break; // the call's own closing paren
        }
        depth--;
      } else if (ch === "," && depth === 0) {
        args.push(code.slice(start, i));
        start = i + 1;
      }
    }
    const trimmed = args.map((a) => a.trim()).filter((a) => a.length > 0);
    expect(trimmed).toHaveLength(4);
    // Anchored at BOTH ends: nothing may precede the call and nothing may
    // follow it. And the object must still be built from the lesson, not from
    // a literal that would make the rule answer about a different car.
    expect(trimmed[3]).toMatch(/^initialParkingBrakeOnFor\(\{[\s\S]*\}\)$/u);
    expect(trimmed[3]).toContain("vehicleStart");
    expect(trimmed[3]).toContain("preDrive: lesson.preDrive");
    expect(trimmed[3]).toContain("lessonId: lesson.id");
  });
});
