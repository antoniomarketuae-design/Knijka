/**
 * sc-roundabout-entry:4ab693eb [critical], clause 2 — THROUGH THE LIVE CHAIN,
 * ON THE GLASS THE SHELL COMPOSES, WITH «Съветник» ON AND OFF.
 *
 * THE DRIVE. rig-w2 `pc-L3-island-b` (43b4109, Level 3): the lesson's own
 * careful approach and entry (the authored shadow up to the ring), then on the
 * ring at φ ≈ 64° the left lamp, and a steer at 14.5 км/ч into the central
 * island; contact at the measured pose — centre r 15.37 at (14.81, −4.13) —
 * then standing there. Replayed pose by pose through `liveChainReplay` (the
 * stack LessonScene builds, the session grid). The island wall's CONTACT is
 * the one thing not in process (rapier): it is reported exactly as
 * LessonScene's handleCollision reports an untagged world body, one
 * `{ kind: "collision", withWhat: "staticObject" }` on the first grid point
 * whose centre is at the measured contact radius. Everything after it — the
 * bill, the pin, the coach, the banner — is the product's.
 *
 * WHAT THE SHELL SHOWS is read off its own pure functions: `snapshotOf` (the
 * poll), `lessonQueueBinding` (the phone queue: task line, advisor row and
 * fold), and the banner's `objectiveTitleUnderHold(bannerObjectiveLineBg(…))`.
 * The roomy desktop card is mounted only when «Съветник» is on and
 * `snap.advisorPrompt` is non-null, so a null prompt is no card.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "@/modules/sim/contracts";
import { ROUTE_HOLD_S, routeHoldAdvisorPrompt } from "@/modules/sim/lessons/advisor";
import { compileScenario } from "@/modules/sim/lessons/scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "@/modules/sim/lessons/scenario/templates-flow";
import { liveChainReplay } from "@/modules/sim/lessons/scenario/__tests__/liveChainReplay";
import { recordScriptedDrive, type DriveScript } from "@/modules/sim/traces/recorder";
import { scRoundaboutEntryShadowScript } from "@/modules/sim/traces/scRoundaboutEntry";
import {
  bannerObjectiveLineBg,
  lessonQueueBinding,
  objectiveTitleUnderHold,
  snapshotOf,
  type HudSnapshot,
} from "../LessonPlayShell";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_ROUNDABOUT_ENTRY.map.districtId}.json`), "utf-8"),
);
const RING_CARD_BG = "Излез от кръговото с десен мигач";
const TASK_BG = "Премини през кръговото и излез с десен мигач";
/** The measured contact (pc-L3-island-b sidecar): centre r and pose. */
const CONTACT_R = 15.37;
const CONTACT = [14.81, -4.13] as const;

function ringAt(phiDeg: number, r: number): [number, number] {
  const a = (phiDeg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

/** The shadow up to and including its ring entry, then drive b's act. */
function islandScript(): DriveScript {
  const shadow = scRoundaboutEntryShadowScript().steps;
  const entryIdx = shadow.findIndex((s) => s.kind === "drive" && s.points.length === 6 && s.targetKmh === 17);
  if (entryIdx < 0) throw new Error("islandScript: the shadow's flat-chord entry moved");
  return {
    steps: [
      ...shadow.slice(0, entryIdx + 1),
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        // nose2 of drive b (15.34, −7.3) at 13.7 км/ч, then the contact pose.
        points: [ringAt(55, 18), ringAt(60, 17.2), [15.34, -7.3], [CONTACT[0], CONTACT[1]]],
        targetKmh: 14.5,
      },
      { kind: "pause", sec: ROUTE_HOLD_S + 3, brake: true },
    ],
  };
}

interface Glass {
  t: number;
  /** The coach as the roomy card would carry it (null: no card). */
  card: { on: string | null; off: string | null };
  /** The phone queue's advisor row key and the task row's detail. */
  phone: { onKey: string | null; offKey: string | null; onDetail: string | null };
  /** The banner (and phone task line) — advisor on and off. */
  banner: { on: string | null; off: string | null };
  collisionBilled: boolean;
}

function drive() {
  const lesson = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
  const { trace } = recordScriptedDrive(RAW, islandScript(), {
    scenarioId: SC_ROUNDABOUT_ENTRY.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  let impactT: number | null = null;
  let prev: HudSnapshot | null = null;
  const glass: Glass[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace,
    beforeApply: ({ t, tick }) => {
      if (impactT === null && Math.hypot(tick.position.x, tick.position.y) <= CONTACT_R + 0.03) {
        tick.events.push({ kind: "collision", withWhat: "staticObject" });
        impactT = t;
      }
    },
    afterApply: ({ t, tick, step }) => {
      const s = step.state;
      const snap = snapshotOf(s, tick, null, prev);
      prev = snap;
      const q = (advisorOn: boolean, compact: boolean) =>
        lessonQueueBinding({
          snap,
          advisorOn,
          examMode: false,
          mistakeMode: false,
          ended: s.phase === "completed" || s.phase === "aborted",
          compact,
          taskPing: 0,
          lessonDescriptionBg: lesson.descriptionBg,
          governorCapKmh: null,
        });
      const banner = objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold);
      glass.push({
        t,
        card: {
          on: snap.advisorPrompt?.textBg ?? null,
          // «Съветник» off: the roomy card is not mounted at all.
          off: null,
        },
        phone: {
          onKey: q(true, true).advisorKey,
          offKey: q(false, true).advisorKey,
          onDetail: q(true, true).fold.taskDetailBg,
        },
        banner: { on: banner, off: q(false, true).taskLineBg },
        collisionBilled: s.events.some((e) => e.kind === "violation" && e.code === "COLLISION"),
      });
    },
  });
  return { out, glass, impactT: impactT as number | null };
}

const RUN = drive();

describe("sc-roundabout-entry L3 — the island contact of drive b, through the live chain", () => {
  it("the drive is the photographed one: on the ring the coach says the exit sentence, then the contact is billed −10 COLLISION", () => {
    expect(RUN.impactT, "the drive must reach the island").not.toBeNull();
    expect(RUN.out.violationCodes).toContain("COLLISION");
    const before = RUN.glass.filter((g) => g.t < RUN.impactT!);
    expect(before.at(-1)?.card.on, "the frame before the contact").toBe(RING_CARD_BG);
    expect(RUN.glass.find((g) => g.t === RUN.impactT)?.collisionBilled, "billed on the contact tick").toBe(true);
  });

  it("advisor ON: from the contact tick to ROUTE_HOLD_S, no frame carries «Излез от кръговото с десен мигач» — not the card, not the phone row", () => {
    const window = RUN.glass.filter((g) => g.t >= RUN.impactT! && g.t < RUN.impactT! + ROUTE_HOLD_S);
    expect(window.length).toBeGreaterThan(250);
    for (const g of window) {
      const at = `+${(g.t - RUN.impactT!).toFixed(3)} s`;
      expect(g.card.on, at).toBeNull();
      expect(g.phone.onKey, at).toBeNull();
      expect(g.phone.onDetail ?? "", at).not.toContain(RING_CARD_BG);
      expect(g.collisionBilled, at).toBe(true);
    }
  });

  it("the banner states the task, bare, through that window — unchanged, advisor on or off — and is qualified from ROUTE_HOLD_S as before", () => {
    for (const g of RUN.glass.filter((g) => g.t >= RUN.impactT! && g.t < RUN.impactT! + ROUTE_HOLD_S - 0.02)) {
      expect(g.banner.on).toContain(TASK_BG);
      expect(g.banner.on?.startsWith(TASK_BG), `+${(g.t - RUN.impactT!).toFixed(3)} s`).toBe(true);
      expect(g.banner.off).toBe(g.banner.on);
    }
    const late = RUN.glass.find((g) => g.t >= RUN.impactT! + ROUTE_HOLD_S + 0.05)!;
    expect(late.banner.on).toMatch(/^Колата е притисната след удара/);
    expect(late.banner.off).toBe(late.banner.on);
  });

  it("…and from ROUTE_HOLD_S the coach is the recovery card, as before", () => {
    const first = RUN.glass.find((g) => g.t >= RUN.impactT! && g.card.on !== null);
    expect(first?.card.on).toBe(routeHoldAdvisorPrompt("crashPinned").textBg);
    expect(first!.t - RUN.impactT!).toBeGreaterThanOrEqual(ROUTE_HOLD_S - 1e-9);
    expect(first!.t - RUN.impactT!).toBeLessThanOrEqual(ROUTE_HOLD_S + 1 / 60 + 1e-9);
  });

  it("advisor OFF: no coach anywhere on any frame (the switch is the shell's, and this change does not reach past it)", () => {
    for (const g of RUN.glass) {
      expect(g.card.off).toBeNull();
      expect(g.phone.offKey).toBeNull();
    }
  });
});
