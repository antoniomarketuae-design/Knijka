/**
 * Trace gate — „Прибери се преди плътната линия" (sc-ov-solid-return on
 * ov-solid2-v1, doc 72 OV-04 × OV-09 × SN-03: the М2→М1 closing window), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW takes the window the moment it opens and is home in its own lane
 *      fifty metres before the wall → ZERO violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their one code each — and the pair's whole
 *      claim is that they are the SAME mistake with two prices, so each is also
 *      gated on NOT carrying the other's code (the late cut never touches the
 *      solid line; the solid return never bills the чл. 42 cut, because the М1
 *      span discards the return episode by construction).
 *   3. NO corridor code in ANY of the three: the oncoming stream is spent
 *      before every excursion by authored timing, so „изпреварването беше
 *      безопасно и пак сгрешено" is a proven property of the drives, not a
 *      claim in the card copy.
 *   4. COMMITTED FILES under content/traces/sc-ov-solid-return/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-solid-return-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_SOLID_RETURN } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvSolidReturnDrive, type ScOvSolidReturnTraceName } from "../scOvSolidReturn";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-solid-return";
const NAMES: ScOvSolidReturnTraceName[] = [
  "shadow-correct",
  "mistake-return-on-solid",
  "mistake-late-cut",
];

/** ov-solid2-v1 pins the drives are authored against (asserted below). */
const SOLID_FROM = 300;
const SOLID_TO = 500;
const RETURN_BY = 270;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-solid2-v1");
const drives = new Map<ScOvSolidReturnTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvSolidReturnDrive(district, n)]),
);

describe("sc-ov-solid-return — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("takes the window early and lands wide: ZERO violations, CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("is HOME on the dashed road before the wall — the drill's whole contract, as geometry", () => {
    // The claim the template makes and the one a re-tune could silently break:
    // the shadow's excursion must be OVER, with the car back on its own bank,
    // before the М1 span starts. Measured from the recording, not asserted in
    // prose: the last sample left of the осева sits well short of y = 300, and
    // by returnByY the car is on its own lane center.
    const samples = shadow.trace.samples;
    const lastLeft = samples.filter((s) => s.x < 0).at(-1)!;
    expect(lastLeft.y).toBeLessThan(SOLID_FROM - 40);
    const atReturnBy = samples.find((s) => s.y >= RETURN_BY)!;
    expect(Math.abs(atReturnBy.x - 4.06)).toBeLessThan(0.5);
    // …and it really did overtake: a genuine excursion onto the oncoming bank.
    expect(samples.some((s) => s.x < -2)).toBe(true);
  });

  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-solid-return — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-return-on-solid", "mistake-late-cut"] as const).entries()) {
    it(`${name}: exactly ${SC_OV_SOLID_RETURN.mistakes[i].codeRefs.join(" + ")}, once`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_SOLID_RETURN.mistakes[i].codeRefs].sort());
      // One late window, one bill: the demo is a single act, not a rattle.
      expect(violationCodes(drive)).toHaveLength(1);
    });
  }

  it("THE PAIR: the same mistake, two prices — neither demo carries the other's code", () => {
    // This is the template's sharpest claim, and the only thing that makes two
    // demos of one fault worth shipping. They are identical drives up to y=280;
    // what separates опасна from основна is purely which exit was taken. If a
    // re-tune ever let the late cut brush the solid span — or the solid return
    // bill the чл. 42 cut — the two cards would name the same faults and teach
    // neither.
    const solid = [...new Set(violationCodes(drives.get("mistake-return-on-solid")!))];
    const cut = [...new Set(violationCodes(drives.get("mistake-late-cut")!))];
    expect(solid).not.toContain("OVERTAKE_RETURN_TOO_EARLY");
    expect(cut).not.toContain("CROSSED_SOLID_LINE");
  });

  it("the solid-return demo is on the WRONG BANK inside the М1 span — the act, as geometry", () => {
    // The conviction's own precondition, pinned: without a sample left of the
    // осева past y = 300, CROSSED_SOLID_LINE would be firing for some other
    // reason and this card would be a lie.
    const samples = drives.get("mistake-return-on-solid")!.trace.samples;
    const inSpanOnWrongBank = samples.filter((s) => s.x < 0 && s.y >= SOLID_FROM && s.y <= SOLID_TO);
    expect(inSpanOnWrongBank.length).toBeGreaterThan(0);
  });

  it("the late-cut demo is home BEFORE the М1 span — with metres to spare, not luck", () => {
    // The other half of the pair's claim: this driver's fault is чл. 42 and
    // nothing else, so his return must provably clear the wall. Measured: the
    // bank flips home around y ≈ 284.
    const samples = drives.get("mistake-late-cut")!.trace.samples;
    const lastLeft = samples.filter((s) => s.x < 0).at(-1)!;
    expect(lastLeft.y).toBeLessThan(SOLID_FROM);
    expect(SOLID_FROM - lastLeft.y).toBeGreaterThan(10);
  });

  it("NO corridor code anywhere: every excursion here runs against an empty oncoming lane", () => {
    // The template's design, proven on all three drives. The stream is authored
    // to be SPENT during the trail phase, so no pass in this lesson is ever a
    // head-on gamble (that drill is sc-ov-oncoming-gap / sc-ov-abort, one
    // district over). „Безопасно и пак сгрешено" is the whole pedagogy: if a
    // corridor bill ever leaked in, the cards would be teaching the wrong law.
    for (const name of NAMES) {
      const codes = [...new Set(violationCodes(drives.get(name)!))];
      expect(codes, name).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
      expect(codes, name).not.toContain("COLLISION");
      // …and no phantom lane machinery on a 1+1 (the bank flip renumbers no
      // lane), no touch double-bill, no speeding on a 90 road passed at 80.
      expect(codes, name).not.toContain("CENTER_LINE_TOUCHED");
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes, name).not.toContain("FOLLOWING_TOO_CLOSE");
      expect(codes, name).not.toContain("SPEEDING_OVER_LIMIT");
      expect(codes, name).not.toContain("WRONG_WAY");
    }
  });

  it("the oncoming stream resolves CLEAR on every drive — the same clockwork, three times", () => {
    // Determinism's own witness: the stream is released by the player's first
    // movement and never interacts again, so all three drives must see the
    // identical staging. A drive whose stream resolved differently would mean
    // the three demos are no longer comparable, and the „one decision apart"
    // claim would be unprovable.
    for (const name of NAMES) {
      expect(
        drives.get(name)!.outcomes.map((o) => [o.kind, o.success, o.detail]),
        name,
      ).toEqual([["oncomingStream", true, "clear"]]);
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);
  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScOvSolidReturnDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_SOLID_RETURN.shadow, ...SC_OV_SOLID_RETURN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_OV_SOLID_RETURN.shadow.path,
      ...SC_OV_SOLID_RETURN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("ov-solid2-v1 meta.scenario mirrors the template recipe (М1 span, warning dashes, returnByY)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          returnByY?: number;
          banZone?: { kind?: string; signRef?: string; fromM?: number; toM?: number };
          warningDashSpanY?: { fromY?: number; toY?: number; graded?: boolean };
          passWindowY?: { fromY?: number; toY?: number; lengthM?: number };
        };
      };
      zones?: Array<{ kind: string; fromM: number; toM: number; signRef: string }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.banZone?.kind).toBe("solidCenterLine");
    expect(d.meta.scenario?.banZone?.signRef).toBe("М1");
    expect(d.meta.scenario?.banZone?.fromM).toBe(SC_OV_SOLID_RETURN.map.params.banFromM);
    expect(d.meta.scenario?.banZone?.toM).toBe(SC_OV_SOLID_RETURN.map.params.banToM);
    expect(d.zones?.[0]?.fromM).toBe(SOLID_FROM);
    expect(d.zones?.[0]?.toM).toBe(SOLID_TO);
    // The warning marking: authored truth, honestly flagged UNGRADED (no
    // ZoneKind carries it; the copy and the gates do the teaching).
    expect(d.meta.scenario?.warningDashSpanY?.fromY).toBe(SC_OV_SOLID_RETURN.map.params.warnFromM);
    expect(d.meta.scenario?.warningDashSpanY?.toY).toBe(SOLID_FROM);
    expect(d.meta.scenario?.warningDashSpanY?.graded).toBe(false);
    // The drill's contract, in the map and in the objective: the same meter.
    expect(d.meta.scenario?.returnByY).toBe(RETURN_BY);
    const home = SC_OV_SOLID_RETURN.success.find((o) => o.id === "sc-ovsr-home")!;
    expect(home.params).toMatchObject({ y: RETURN_BY });
    // The window this whole template is about: 285 m of dashes, and it ends.
    expect(d.meta.scenario?.passWindowY?.lengthM).toBe(285);
  });
});
