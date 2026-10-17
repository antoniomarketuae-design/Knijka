/**
 * sc-sig-controller-postures:5ee4301e [critical] — «ambient cars at the sx-v1 junction obey the WRONG lamp».
 *
 * THE CAUSE. `vehicles.ts` stopped an ambient car at a signalised lane end on `env.signalPhase(lk.endSignalNodeId)`,
 * which every caller bound to `runtime.signalPhase(id)` — the NODE's own axis-group (signals.ts `nodeGroup`: on a
 * single-node junction the axis of its highest-class edge). On sx-v1 that is the N-S boulevard's group, read by all
 * four approaches: east-west traffic stopped on the boulevard's red and drove on its green — the student's green —
 * against its own lamp, and through the регулировчик's halt, which nothing in the ambient code read at all. The
 * district census at base: 11 signalised districts, every one with approaches whose own axis is not the node's.
 *
 * WHAT IS PINNED HERE (the drill-level witnesses are in lessons/scenario/__tests__/controller-cross-traffic.test.ts):
 *   1. the runtime's ambient read is the lamp of the car's OWN approach, every 0.5 s of two cycles, both axes;
 *   2. with an officer posted it is HIS permission for the car's axis, and «внимание» (yellow: stop if you still can)
 *      through his raised-arm window — the window the figure raises the arm on (CONTROLLER_ATTENTION_LEAD_SEC);
 *   3. a link between two members of one signal complex has no line (null) — the stop-line builder's C1 rule;
 *   4. a dark / flashing-amber cluster is UNCHANGED (the node's read): there is no lamp to obey, and the right-hand
 *      rule for ambient cars is reported owed, not built here;
 *   5. stepping the traffic system on sx-v1 at 1/60 s with the live lamps, no ambient car enters the junction box on
 *      its own red (after the amber an already-committed car may still be clearing) — red on base;
 *   6. every production caller of `traffic.update` hands the traffic the RUNTIME's ambient read, by the exact wiring
 *      (a source census), and the render layer is not one of them — its «drop-in» drive mode, which no mount used
 *      and nothing could test, is gone (round 2; the round-1 verifier's surviving mutant V1 lived there);
 *   7. the left-turn gap an ambient turner gives the student is the gap the product teaches him.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTROLLER_ATTENTION_LEAD_SEC, type SignalPhase } from "../../contracts";
import { createWorldRuntime, SIGNAL_TIMING } from "../../runtime";
import { LEFT_TURN_GAP_SAFE_SEC } from "../../runtime/worldRuntime";
import { createTrafficSystem } from "../system";
import { AMBIENT_LEFT_TURN_GAP_SEC } from "../vehicles";
import type { TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const SRC = path.resolve(HERE, "../../../..");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));
const NODE = "sx-n-c";
/** Travel bearings INTO sx-n-c, and the node each approach's lane starts at. */
const APPROACHES = [
  { name: "northbound", bearing: 0, from: "sx-n-s" },
  { name: "eastbound", bearing: 90, from: "sx-n-w" },
  { name: "southbound", bearing: 180, from: "sx-n-n" },
  { name: "westbound", bearing: 270, from: "sx-n-e" },
] as const;

describe("an ambient car obeys the signal of its OWN approach (5ee4301e)", () => {
  it("sx-v1, live lamps: the ambient read is each approach's own lamp, every 0.5 s over two cycles", () => {
    const rt = createWorldRuntime(sx());
    let nodeReadDiffersForWestbound = 0;
    for (let k = 0; k < 2 * SIGNAL_TIMING.cycleSec * 2; k++) {
      for (const a of APPROACHES) {
        expect(rt.ambientSignalPhase(NODE, a.bearing, a.from), `${a.name} t=${k / 2}`).toBe(
          rt.signalPhaseForApproach(NODE, a.bearing),
        );
      }
      if (rt.signalPhase(NODE) !== rt.signalPhaseForApproach(NODE, 270)) nodeReadDiffersForWestbound++;
      rt.update(0.5);
    }
    // The old read: the node's own group, which the westbound approach does not share (192 of 200 at base).
    expect(nodeReadDiffersForWestbound).toBeGreaterThan(150);
  });

  it("an officer posted: his permission for the car's axis, «внимание» through his raised-arm window, then the flip", () => {
    const rt = createWorldRuntime(sx());
    const flipAt = 30;
    rt.setSignalClusterController(NODE, { haltedGroup: "ns", flipAtSec: flipAt });
    const at = (t: number): Record<string, SignalPhase | null> => {
      const out: Record<string, SignalPhase | null> = {};
      for (const a of APPROACHES) out[a.name] = rt.ambientSignalPhase(NODE, a.bearing, a.from);
      return out;
    };
    let t = 0;
    const step = 0.25;
    while (t < 60) {
      const p = at(t);
      if (t < flipAt - CONTROLLER_ATTENTION_LEAD_SEC) {
        expect(p, `t=${t}`).toEqual({ northbound: "red", southbound: "red", eastbound: "green", westbound: "green" });
      } else if (t < flipAt) {
        expect(p, `t=${t}`).toEqual({ northbound: "yellow", southbound: "yellow", eastbound: "yellow", westbound: "yellow" });
      } else {
        expect(p, `t=${t}`).toEqual({ northbound: "green", southbound: "green", eastbound: "red", westbound: "red" });
      }
      rt.update(step);
      t += step;
    }
  });

  it("a link inside one signal complex has no line (null); unknown nodes fail safe (red)", () => {
    const raw = JSON.parse(readFileSync(path.join(WORLD, "district-v1.json"), "utf-8"));
    const rt = createWorldRuntime(raw);
    // e1313239475.0: n12155370035 → n148570715, both members of one signal complex (district census, base).
    expect(rt.ambientSignalPhase("n148570715", 0, "n12155370035")).toBeNull();
    expect(rt.ambientSignalPhase("n148570715", 0, "not-a-signal-node")).not.toBeNull();
    expect(rt.ambientSignalPhase("no-such-node", 0, "x")).toBe("red");
  });

  it("a dark or flashing-amber cluster keeps the node's read (no lamp to obey — the right-hand rule is owed)", () => {
    for (const mode of ["dark", "flashingAmber"] as const) {
      const rt = createWorldRuntime(sx());
      rt.setSignalClusterMode(NODE, mode);
      for (let k = 0; k < SIGNAL_TIMING.cycleSec * 2; k++) {
        for (const a of APPROACHES) {
          expect(rt.ambientSignalPhase(NODE, a.bearing, a.from), `${mode} ${a.name}`).toBe(rt.signalPhase(NODE));
        }
        rt.update(0.5);
      }
    }
  });

  it("stepping sx-v1's traffic at 1/60 s, live lamps: no ambient car enters the box on its own red", () => {
    const raw = sx();
    const rt = createWorldRuntime(raw);
    const traffic = createTrafficSystem(raw, {
      anchor: { x: 0, y: -105 },
      anchorRadiusM: 400,
      vehicleCount: 8,
      pedestrianCount: 0,
      sidewalkPedestrianCount: 0,
    } as never);
    const BOX = 26; // past the junction mouth (the drawn radius 27.1 m less the stop line's half-car) — into the box
    const prev = new Map<number, { x: number; y: number }>();
    /** Each approach's lamp, per grid point, for the «was it amber a moment ago» allowance. */
    const lampLog: Array<Record<number, SignalPhase>> = [];
    const entries: Array<{ t: number; id: number; bearing: number; lamp: SignalPhase; amberWithin: boolean }> = [];
    const H = 1 / 60;
    for (let k = 1; k <= 200 * 60; k++) {
      rt.update(H);
      traffic.update(H, {
        signalPhase: (id) => rt.signalPhase(id),
        ambientSignal: (id, b, f) => rt.ambientSignalPhase(id, b, f),
        playerPos: null,
      });
      const lamps: Record<number, SignalPhase> = {};
      for (const a of APPROACHES) lamps[a.bearing] = rt.signalPhaseForApproach(NODE, a.bearing);
      lampLog.push(lamps);
      for (const v of traffic.vehicles) {
        const p = prev.get(v.id);
        prev.set(v.id, { x: v.x, y: v.y });
        if (!p) continue;
        const ewEntry = Math.abs(v.y) < 12 && Math.abs(p.x) > BOX && Math.abs(v.x) <= BOX;
        const nsEntry = Math.abs(v.x) < 12 && Math.abs(p.y) > BOX && Math.abs(v.y) <= BOX;
        if (!ewEntry && !nsEntry) continue;
        const bearing = ewEntry ? (p.x > 0 ? 270 : 90) : p.y > 0 ? 180 : 0;
        // A car that saw amber and could not stop clears the junction: it reaches the box within one amber of it.
        const back = Math.round((SIGNAL_TIMING.yellowSec + SIGNAL_TIMING.allRedSec) / H);
        const window = lampLog.slice(Math.max(0, lampLog.length - 1 - back));
        const amberWithin = window.some((l) => l[bearing] === "yellow" || l[bearing] === "green");
        entries.push({ t: k * H, id: v.id, bearing, lamp: lamps[bearing], amberWithin });
      }
    }
    expect(entries.filter((e) => e.bearing === 90 || e.bearing === 270).length).toBeGreaterThan(3);
    expect(entries.filter((e) => e.bearing === 0 || e.bearing === 180).length).toBeGreaterThan(3);
    const onRed = entries.filter((e) => (e.lamp === "red" || e.lamp === "redYellow") && !e.amberWithin);
    expect(onRed, JSON.stringify(onRed.slice(0, 5))).toEqual([]);
  }, 120_000);

  it("every production caller of traffic.update hands it the ambient read", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) {
          if (f === "__tests__" || f === "node_modules") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(SRC);
    const feeders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf-8");
      // An update context built for the traffic system: `signalPhase: (id) => <runtime>.signalPhase(id)` in an
      // object literal.
      const re = /signalPhase: \(id\) => \w+\.signalPhase\(id\)/g;
      for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        const rel = path.relative(SRC, f).replace(/\\/g, "/");
        feeders.push(rel);
        // The very next property is the ambient read, wired to the runtime's own method — not merely mentioned.
        const next = src.slice(m.index + m[0].length, m.index + m[0].length + 140);
        expect(next, `${rel}: the ambient read is not the runtime's`).toMatch(
          /^,\s*ambientSignal(: \(id, bearing, from\) => runtime\.ambientSignalPhase\(id, bearing, from\))?,/,
        );
        // …and so is what the student is signalling (round 4: an ambient car that must give way to him predicts him
        // by what he can do next, and his indicator is part of that — vehicles.ts `studentHoldsBox`).
        expect(src.slice(m.index, m.index + 700), `${rel}: the student's indicator is not handed over`).toMatch(
          /playerHeadingDeg: [\w.]+,\s*playerIndicator: [\w.]+,/,
        );
      }
    }
    expect([...new Set(feeders)].sort()).toEqual([
      "modules/clips/capture/captureGhostFeed.ts",
      "modules/sim/scene/gradeGrid.ts",
      "modules/sim/traces/recorder.ts",
    ]);
    // gradeGrid's shorthand `ambientSignal,` is this binding and nothing else.
    const grid = readFileSync(path.join(SRC, "modules/sim/scene/gradeGrid.ts"), "utf-8");
    expect(grid).toContain(
      "const ambientSignal = runtime.ambientSignalPhase ? runtime.ambientSignalPhase.bind(runtime) : null;",
    );
    expect(grid.match(/\bambientSignal = /g)).toHaveLength(1);
    // The render layer only renders: it never steps the traffic system and takes no runtime to step it with.
    const layer = readFileSync(path.join(SRC, "modules/sim/traffic/TrafficLayer.tsx"), "utf-8");
    expect(layer).not.toMatch(/\.update\(/);
    expect(layer).not.toMatch(/\bruntime\??:/);
    expect(layer).not.toMatch(/ambientSignal|signalPhase\(/);
  });

  it("the left-turn gap an ambient turner leaves the student is the one the product teaches him", () => {
    expect(AMBIENT_LEFT_TURN_GAP_SEC).toBe(LEFT_TURN_GAP_SAFE_SEC);
  });
});
