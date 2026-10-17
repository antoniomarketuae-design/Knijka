/**
 * sc-roundabout-entry:08a0b701 — THE NPC-CONTACT CENSUS: every committed demo
 * that ends in a contact with a road user, at every rung where it does,
 * driven on rapier into NpcColliders' shells at 60 Hz, 30 Hz, 13 fps, 0.37 s
 * frames and the w69 phone deltas (npcContactDrive.ts → rapierContactDrive.ts:
 * @react-three/rapier's stepper, the product's chassis, VehicleRig's contact
 * record and ear, the product's shell pool and LessonScene's own graded
 * statements, executed).
 *
 * WHO IS IN IT, STATED (`NPC_CONTACT_DEMOS`, enumerated by lesson). The replay
 * harness was run over every committed demo × every rung its template authors
 * (2,434 cells, 60 Hz) and every cell whose ledger carries a COLLISION with a
 * vehicle, a pedestrian or a cyclist was listed: 174 cells, 49 demos, 34
 * lessons (no cell carries a static-object collision — the replay has no
 * rapier). The list is pinned; `NPC_CONTACT_ENUMERATE=1` re-derives it from
 * the replay (5 min) and fails if it has moved.
 *
 * RE-DERIVED 2026-10-17 on 1f1536d + posturescross r9 (sc-sig-controller-postures:5ee4301e
 * and :4f446777 — ambient cars obey their OWN approach's lamp and the junction-box protocol,
 * and drive through a box on a connector instead of hopping to the node). Measured, not
 * relaxed: the enumeration above, run on 1f1536d, returns the old list exactly (200 cells,
 * 56 demos, 35 lessons — green); run on the merged tree it returns this one. 30 cells left
 * it and 4 joined:
 *   LEFT — 30 cells whose only road-user contact was an AMBIENT car (report body null) that,
 *   at 1f1536d, either
 *   (a) entered its junction against its OWN approach's lamp while the node's group (what it
 *       read) was green — 18 cells: sc-sig-green-wave shadow-correct and mistake-sleep-at-green
 *       L1–L5 (car 0 over sw-n-tl1's line at step 1350 / car 2 at 1228, own lamp red, into his
 *       lane ahead of him; struck at 1501 at 33 км/ч and 1967 at 42 км/ч), sc-jx-blocked-exit
 *       mistake-enter-full-box L1–L5 (car 0 over sx-n-c's line on its own red at 667–850 into his
 *       exit lane, standing there behind the staged queue when he entered the full box) and
 *       sc-jx-blocked-exit shadow-correct L3–L5 (car 2 over sx-n-c's line on its own red, into
 *       the box at 17 км/ч where he stood: step 3490). On the merged tree car 0 of both demos
 *       stands at its line on its own red (sw-n-tl1 / sx-n-c; the probe's reason for the hold),
 *       car 2 of sc-jx-blocked-exit waits on its red and then for him at the box gate, and car 2
 *       of sc-sig-green-wave L3–L5 is no longer in his lane (the fleet's history differs from the
 *       first red it now obeys; it waits on sw-n-tl2's red far ahead); or
 *   (b) hopped 5.7–5.8 m in one 1/60 s step from its lane's end to the next lane's arc 0 at the
 *       node and stood there inside the drawn box, or entered the box ungated and stood at its
 *       lane's last metre — 12 cells: sc-signal-flashing shadow-correct L1–L5 (car 0 standing
 *       at the node from 1293–1304 to his touch at 2003/2004) and mistake-cut L1, L2, L3, L5,
 *       sc-junction-left shadow-correct L5 (car 1 at (−4.06, −0.9) from 1544), sc-junction-rhr
 *       mistake-barge L3, L4 (car 3 at its lane's last metre, 4.1 m from tj-n-c, from 1055); on
 *       the merged tree each drives the connector or is held at its line by the box gate
 *       («box … for 1000 + student»).
 *   No lost contact is of any other class (pcfloor probe: every car's line crossing read on
 *   1f1536d against the merged tree's own reason for holding it; scratch, not committed).
 *   JOINED — 4 contacts of the lawful world: sc-signal-flashing mistake-barge L1, L2 (he
 *   barges the flashing junction into the staged priority car 1000 at 27.8 км/ч; the rung
 *   list was 3, 5) and sc-signal-redyellow mistake-jump L1, L2 (he jumps the red-yellow into
 *   ambient car 3 crossing on its OWN green — at 1f1536d that car stood on the node's red).
 *
 * WHAT A DRIVEN CELL IS AND IS NOT. The tape is followed by a per-step pursuit
 * driver, not replayed — so the car physically meets the shell. The follower
 * is not the tape: in some cells the physical car misses the road user the
 * kinematic tape overlapped (the list below the census: `NO_PHYSICAL_CONTACT`),
 * and such a cell is counted as driven, NOT as a contact that agreed.
 *
 * THE CLAIM, per cell and cadence, against that cell's own 60 Hz drive: every
 * contact the rig judged (grid point, impact км/ч to the last bit, whom), every
 * collision report from either reporter (the rig's ear and the director's
 * sentinel: grid point, whom, the body's name), every COLLISION bill, the whole
 * sheet, the car after every physics step, and the close of the drive.
 *
 * AND THE TWO REPORTERS (the task's «say for each actor kind which path bills,
 * and prove the two cannot disagree»). A staged road user's contact has two
 * reporters on one wire — the sentinel (boxes overlap on the grid) and the ear
 * (rapier found a contact; the scene names the body from the same cast) — and
 * the rule engine opens ONE episode per body on the first report and treats
 * every later report as its continuation. So the census also holds, on every
 * cell: the first bill for a road user is stamped at the grid point of the
 * FIRST report from either, and who that was is tallied by kind.
 *
 * `NPC_CENSUS_OUT=<file>` writes every row (the lane's base-vs-tree comparison runs
 * this same file on the base and diffs the 60 Hz rows).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { parseScenarioTrace } from "../../../traces/parse";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { driveDemo, rowDiffs, W69, type NpcContactRow } from "./npcContactDrive";
import { initRapier } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";

beforeAll(async () => {
  await initRapier();
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** lesson, demo, the rungs at which its replay ledger carries a COLLISION with
 *  a road user, and with whom. */
const NPC_CONTACT_DEMOS: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[], string]> = [
  ["sc-ac-wind-truck-pass", "mistake-clip-truck", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-crossing-child-ball", "mistake-collision", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-crossing-rain-sprint", "mistake-not-yielded", [1], "pedestrian"],
  ["sc-driver-distraction", "mistake-late-react", [1, 2, 3], "pedestrian"],
  ["sc-driver-distraction", "mistake-no-brake", [1, 2, 3], "pedestrian"],
  ["sc-fo-brakelight-chain", "mistake-late-brake", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-fo-motorway-gap", "mistake-bumper-crash", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-brake", "mistake-late-reaction", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-brake", "mistake-no-reaction", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-distance", "mistake-gap-melts", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-distance", "mistake-tailgate", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-rain-gap", "mistake-dry-habit", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-rain-gap", "mistake-gap-melts", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-truck", "mistake-peek", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-follow-truck", "mistake-tailgate", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-hz-accident-scene", "mistake-squeeze", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-hz-brake-dont-swerve", "mistake-blind-swerve", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-hz-emergency-stop", "mistake-late-reaction", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-junction-rhr", "mistake-no-look", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-jx-equal-left", "mistake-cut-oncoming", [3, 4, 5], "vehicle"],
  ["sc-jx-equal-left", "mistake-cut-right", [3, 4, 5], "vehicle"],
  ["sc-jx-equal-left", "shadow-correct", [3, 4, 5], "vehicle"],
  ["sc-jx-giveway-b1", "mistake-barge-priority", [5], "vehicle"],
  ["sc-jx-giveway-b1", "mistake-no-scan", [5], "vehicle"],
  ["sc-jx-giveway-b1", "shadow-correct", [5], "vehicle"],
  ["sc-jx-priority-confidence", "mistake-blind-priority", [5], "vehicle"],
  ["sc-jx-priority-confidence", "shadow-correct", [5], "vehicle"],
  ["sc-lane-control-signal", "mistake-closed-lane", [1, 2, 3], "vehicle"],
  ["sc-ln-obstacle-meeting", "mistake-pull-out", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-merge-from-property", "mistake-walk-through", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-ov-abort", "mistake-head-on", [1, 2, 3, 5], "vehicle"],
  ["sc-ov-narrow", "mistake-barge", [1, 2, 3, 5], "vehicle"],
  ["sc-ov-narrow", "mistake-force", [1, 2, 3, 5], "vehicle"],
  ["sc-pe-jaywalker", "mistake-collision", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-pe-parked-row-scan", "mistake-fast-row", [1, 2, 3, 5], "pedestrian"],
  ["sc-rb-busy-gap", "mistake-short-gap", [1, 2, 3, 5], "vehicle"],
  ["sc-rb-busy-gap", "shadow-correct", [5], "vehicle"],
  ["sc-rb-lane-choice", "mistake-exit-across-outer", [1, 2, 3, 5], "vehicle"],
  ["sc-rb-ped-exit", "mistake-exit-through-ped", [5], "pedestrian"],
  ["sc-rx-tram-stop-doors", "mistake-creep-through", [1, 3], "pedestrian"],
  ["sc-rx-tram-stop-doors", "mistake-thread-doors", [1, 2, 3, 4, 5], "pedestrian"],
  ["sc-sig-green-wave", "mistake-sprint", [1, 2, 3, 4, 5], "vehicle"],
  ["sc-signal-flashing", "mistake-barge", [1, 2, 3, 5], "vehicle"],
  ["sc-signal-redyellow", "mistake-jump", [1, 2], "vehicle"],
  ["sc-turn-left-oncoming", "mistake-cut-gap", [1, 5], "vehicle"],
  ["sc-turn-left-oncoming", "mistake-no-indicator", [5], "vehicle"],
  ["sc-turn-left-oncoming", "shadow-correct", [5], "vehicle"],
  ["sc-vu-bikelane-turn", "mistake-cut-path", [1, 2, 3], "cyclist"],
  ["sc-vu-emergency-junction", "mistake-race", [1, 2, 3, 5], "vehicle"],
];

const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["30 Hz", [1 / 30]],
  ["13 fps", [1 / 13]],
  ["0.37 s", [0.37]],
  ["w69 phone A", W69],
];

const ROWS: NpcContactRow[] = [];
const REF: NpcContactRow[] = [];
const WRONG: string[] = [];

describe("the NPC-contact census — one drive meets one body at one step, on every display", () => {
  it("the census holds 49 demos of 34 lessons: 174 cells", () => {
    expect(NPC_CONTACT_DEMOS.length).toBe(49);
    expect(new Set(NPC_CONTACT_DEMOS.map((d) => d[0])).size).toBe(34);
    expect(NPC_CONTACT_DEMOS.reduce((n, d) => n + d[2].length, 0)).toBe(174);
    // Every rung listed is one the template authors.
    for (const [id, , levels] of NPC_CONTACT_DEMOS) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
      expect(spec, id).toBeDefined();
      for (const L of levels) expect(spec!.levels.some((l) => l.level === L), `${id} L${L}`).toBe(true);
    }
  });

  for (const [id, demo, levels] of NPC_CONTACT_DEMOS) {
    it(`${id} ${demo} (L${levels.join(", L")}): ${CADENCES.map((c) => c[0]).join(", ")} — the judged contacts, both reporters' reports, the bills, the sheet, the car after every step and the close are 60 Hz's`, () => {
      const wrong: string[] = [];
      const wiring = new Set<string>();
      for (const level of levels) {
        const ref = driveDemo(id, `${demo}.trace.json`, level, "60 Hz", [1 / 60]);
        wiring.add(`${ref.shellClock}, ${ref.sceneShape}, ${ref.maxStepsPerFrame} step(s) per 60 Hz frame`);
        REF.push(ref);
        ROWS.push(ref);
        for (const [label, deltas] of CADENCES) {
          const r = driveDemo(id, `${demo}.trace.json`, level, label, deltas);
          ROWS.push(r);
          wrong.push(...rowDiffs(r, ref));
        }
      }
      WRONG.push(...wrong);
      expect(wrong.slice(0, 8)).toEqual([]);
      // …driven through the repair's own wiring (asserted last, so a tree
      // without it still drives every row and writes them: the base run).
      expect([...wiring]).toEqual(["product, function, 1 step(s) per 60 Hz frame"]);
    }, 900_000);
  }

  it("what the census drove: every cell, the cells that physically struck a road user, and the ones that did not (stated, never counted as agreement)", () => {
    expect(REF.length).toBe(174);
    expect(ROWS.length).toBe(174 * (1 + CADENCES.length));
    expect(WRONG).toEqual([]);
    const struck = REF.filter((r) => r.firstNpcStep > 0);
    const byKind = (k: string) => struck.filter((r) => r.firstNpcKind === k).length;
    const moving = struck.filter((r) => r.firstNpcSpeedKmh > 3).length;
    const noContact = REF.filter((r) => r.firstNpcStep < 0).map((r) => r.cell);
    console.log(
      `[npc-contact census] ${REF.length} cells driven; ${struck.length} physically struck a road user at 60 Hz ` +
        `(vehicle ${byKind("vehicle")}, pedestrian ${byKind("pedestrian")}, cyclist ${byKind("cyclist")}; ${moving} of them moving faster than 3 км/ч at the contact); ` +
        `${noContact.length} did not: ${noContact.join(" ")}`,
    );
    // The census is only worth its name while most of it strikes something, of
    // every kind, most of it MOVING (a standing shell never depended on the
    // frame) — measured at the landing: see the lane's report.
    // RE-DERIVED 2026-10-17 (the posturescross landing on 1f1536d; see the list's
    // note above). Measured at 60 Hz: on 1f1536d's 200 cells 167 struck (vehicle
    // 128, pedestrian 39, cyclist 0; 115 moving) against floors 150/100/30/80. On
    // the merged tree the same 200 cells strike 137 (vehicle 98, pedestrian 36,
    // cyclist 3; 99 moving) — the 30 lost are the ambient defects listed above,
    // and sc-vu-bikelane-turn mistake-cut-path L1–L3 now meet the staged rider
    // first because the ambient pavement walker 1 no longer stands in the junction
    // (:4f446777). The re-derived 174 cells strike 141 (vehicle 102, pedestrian 36,
    // cyclist 3; 103 moving). The struck floor keeps the landing's own proportion
    // (150 of 167 ≈ 0.90 → 0.90 × 141 = 126.9 → 125); the other three floors are
    // unchanged — the four joined cells keep vehicle at 102 ≥ 100. With the shells
    // off (NpcShellPool.step returning at once) this test is red on its first
    // floor: «expected 0 to be greater than or equal to 125».
    expect(struck.length).toBeGreaterThanOrEqual(125);
    expect(byKind("vehicle")).toBeGreaterThanOrEqual(100);
    expect(byKind("pedestrian")).toBeGreaterThanOrEqual(30);
    expect(moving).toBeGreaterThanOrEqual(80);
  });

  it("THE TWO REPORTERS: on every cell the first bill for a road user is stamped at the grid point of the first report from either — the rig's ear or the director's sentinel — and never twice for one touch", () => {
    const wrong: string[] = [];
    const tally: Record<string, Record<string, number>> = {};
    for (const r of REF) {
      if (r.firstReportStep < 0) {
        // Nobody reported a road user: then nobody was billed for one.
        if (r.billStep >= 0) wrong.push(`${r.cell}: a road-user bill at ${r.billStep} with no report`);
        continue;
      }
      // Somebody reported: the bill is at the FIRST report's grid point…
      if (r.billStep !== r.firstReportStep) wrong.push(`${r.cell}: first report at ${r.firstReportStep}, first bill at ${r.billStep}`);
      const kind = r.firstNpcKind || (JSON.parse(r.reports) as Array<[number, string]>)[0][1];
      const who = `${r.billedBy}${r.billedBy === "sentinel" && r.earSpoke ? " (the ear later)" : ""}${r.billedBy === "ear" && r.sentinelSpoke ? " (the sentinel later)" : ""}`;
      (tally[kind] ??= {})[who] = ((tally[kind] ??= {})[who] ?? 0) + 1;
      // …and one touch is one bill: reports that keep arriving for the same
      // named body inside the engine's open episode add no second bill. (A
      // second bill needs a second BODY, or the bodies to have come apart.)
      const reports = JSON.parse(r.reports) as Array<[number, string, string | null]>;
      const bills = JSON.parse(r.bills) as Array<{ t: number; withWhat: string }>;
      const bodies = new Set(reports.map((x) => x[2] ?? `kind:${x[1]}`));
      const npcBills = bills.filter((b) => b.withWhat !== "staticObject");
      if (npcBills.length > bodies.size) {
        // More bills than bodies: every extra one must be a re-strike after
        // more than the engine's 1.2 s of silence.
        const steps = reports.map((x) => x[0]);
        let gaps = 0;
        for (let i = 1; i < steps.length; i++) if (steps[i] - steps[i - 1] > 72) gaps++;
        if (npcBills.length > bodies.size + gaps) wrong.push(`${r.cell}: ${npcBills.length} road-user bills for ${bodies.size} bodies and ${gaps} separations`);
      }
    }
    console.log(`[npc-contact census] who stamped the first road-user bill, by kind: ${JSON.stringify(tally)}`);
    expect(wrong).toEqual([]);
    // Both reporters are alive in the census: each stamps some bills first.
    const firsts = Object.values(tally).flatMap((t) => Object.keys(t));
    expect(firsts.some((w) => w.startsWith("sentinel"))).toBe(true);
    expect(firsts.some((w) => w.startsWith("ear") || w.startsWith("both"))).toBe(true);
  });

  it("writes the rows when asked (NPC_CENSUS_OUT)", () => {
    const out = process.env.NPC_CENSUS_OUT;
    if (out) writeFileSync(out, JSON.stringify(ROWS, null, 1));
    expect(ROWS.length).toBeGreaterThan(0);
  });
});

describe.runIf(process.env.NPC_CONTACT_ENUMERATE === "1")("the census's list, re-derived (NPC_CONTACT_ENUMERATE=1, ~5 min)", () => {
  it("every committed demo × rung through the replay at 60 Hz: the cells whose ledger carries a COLLISION with a road user are exactly NPC_CONTACT_DEMOS", () => {
    const found = new Map<string, { levels: number[]; kinds: Set<string> }>();
    let cells = 0;
    let digest = createHash("sha256");
    for (const spec of SCENARIO_TEMPLATES) {
      const dir = path.join(REPO_ROOT, "content", "traces", spec.id);
      if (!existsSync(dir)) continue;
      const raw = loadDistrict(spec.map.districtId);
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".trace.json")).sort()) {
        const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(dir, file), "utf-8")));
        if (!trace) continue;
        for (const level of spec.levels.map((l) => l.level)) {
          cells++;
          const out = liveChainReplay({ lesson: compileScenario(spec, level), districtRaw: raw, trace, frameDeltas: [1 / 60] });
          digest = digest.update(JSON.stringify([spec.id, file, level, out.result, out.violationCodes]));
          const kinds = out.session.events
            .filter((e) => (e as { kind?: string; code?: string }).kind === "violation" && (e as { code?: string }).code === "COLLISION")
            .map((e) => String((e as { detail?: string }).detail));
          if (kinds.some((k) => k !== "staticObject")) {
            const key = `${spec.id}|${file.replace(".trace.json", "")}`;
            const e = found.get(key) ?? { levels: [], kinds: new Set<string>() };
            e.levels.push(level);
            for (const k of kinds) e.kinds.add(k);
            found.set(key, e);
          }
        }
      }
    }
    expect(cells).toBe(2434);
    const got = [...found.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, e]) => [...k.split("|"), e.levels.sort(), [...e.kinds].sort().join("+")]);
    expect(got).toEqual([...NPC_CONTACT_DEMOS].sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`)).map((d) => [d[0], d[1], [...d[2]], d[3]]));
    console.log(`[npc-contact census] replay catalogue digest over ${cells} cells: ${digest.digest("hex")}`);
  }, 3_600_000);
});
