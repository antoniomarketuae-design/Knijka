/**
 * THE SCENE'S MOUNTS UNDER THE PERSON HOLD, READ OFF THE RENDERED TREE — lane
 * endings2 at integration: the round-3 verifier's condition C2 (mutant X5) and
 * condition C1's mount (integrator ruling N18).
 *
 * routeGuidanceStandsDown.test.tsx pins the S1 shadow aid's ribbon by a regex
 * over LessonScene's source (`showRibbon={!routeGuidanceStandsDown(…)}`), and
 * the glance-ping mount was pinned the same way. A rewording that keeps the
 * behaviour, or a behaviour change that keeps the text, walks past a regex
 * (rearStaticBodiesSeam.test.tsx, «WHY NOT A SOURCE-TEXT ASSERTION»). Here the
 * REAL ReadyScene is mounted through hookHarness, fed by the shipped recipe
 * over the lesson's own district and its own committed shadow trace, once per
 * hold value, and the props it hands to ShadowCar and to GlanceEdgePings are
 * picked out of the element tree by component identity.
 *
 *   · the shadow ribbon: showRibbon false under "personStruck" ONLY — true
 *     under crashPinned, offRoad and no hold (N14: the recovery there IS the
 *     way back onto the route);
 *   · the ghost is the aid's own setting under every hold (only the ribbon
 *     leaves);
 *   · the glance pings receive the scene's hold, whatever it is.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReadyScene } from "../LessonScene";
import { ShadowCar } from "../ShadowCar";
import { GlanceEdgePings } from "../lesson-ui/GlanceEdgePings";
import { collectProps, mountHook } from "@/modules/sim/hud/__tests__/hookHarness";
import { buildLessonWorldCore } from "@/modules/sim/scene/lessonWorldRecipe";
import { buildMinimapPolylines } from "@/modules/sim/scene/lessonMinimap";
import { createTrafficSystem } from "@/modules/sim/traffic";
import { compileScenario, SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario";
import { lessonDistrictId } from "@/modules/sim/contracts";
import { parseScenarioTrace } from "@/modules/sim/traces/parse";
import type { LessonSpec, RouteHold } from "@/modules/sim/lessons";

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

const TEMPLATE = "sc-merge-from-property";

function mountScene(lesson: LessonSpec, routeHold: RouteHold | null) {
  const root = repoRoot();
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(root, "content", "world", `${lessonDistrictId(lesson)}.json`), "utf8"));
  const shadowTrace = parseScenarioTrace(
    JSON.parse(fs.readFileSync(path.join(root, "content", "traces", TEMPLATE, "shadow-correct.trace.json"), "utf8")),
  );
  expect(shadowTrace, "the committed shadow trace parses").not.toBeNull();
  const core = buildLessonWorldCore(lesson, raw);
  const traffic = createTrafficSystem(raw as Parameters<typeof createTrafficSystem>[0], { vehicleCount: 0, pedestrianCount: 0 });
  const props = {
    lesson,
    quality: "low",
    paused: false,
    driveLocked: false,
    preDriveHighlightStepId: null,
    activeObjectiveIndex: 0,
    onTick: () => {},
    onPreDriveStep: () => {},
    onBlockedDriveAttempt: () => {},
    onMinimapFrame: () => {},
    routeHold,
    built: {
      runtime: core.runtime,
      geometry: core.geometry,
      district: core.district,
      traffic,
      director: null,
      minimapPolylines: buildMinimapPolylines(core.district),
      spawnPoints: core.spawnPoints,
      ghostDemoRaw: null,
      scenarioObstacles: core.scenarioObstacles,
      parkedClearZones: core.parkedClearZones,
      gripPatches: core.gripPatches,
      shadowTrace,
      lessonMaxLegalKmh: undefined,
      lessonRequiredKmh: undefined,
    },
    menuPaused: false,
    setMenuPaused: () => {},
    physicsPaused: false,
    onMinimap: () => {},
    onTickCb: () => {},
  } as unknown as Parameters<typeof ReadyScene>[0];
  const mounted = mountHook(() => ReadyScene(props));
  try {
    const tree = mounted.rerender();
    return {
      shadow: collectProps(tree, (p, type) => type === ShadowCar && p.trace === shadowTrace),
      pings: collectProps(tree, (_p, type) => type === GlanceEdgePings),
    };
  } finally {
    mounted.unmount();
  }
}

const HOLDS: Array<RouteHold | null> = ["personStruck", "crashPinned", "offRoad", null];

describe("the real ReadyScene under each hold (C2 / X5, C1 mount)", () => {
  for (const L of [1, 2] as const) {
    const lesson = compileScenario(SCENARIO_TEMPLATES.find((t) => t.id === TEMPLATE)!, L);
    it(`${TEMPLATE}@L${L}: the S1 shadow ribbon leaves under personStruck only; the ghost keeps the aid's setting`, () => {
      expect(lesson.aids?.shadowCar === true || lesson.aids?.pathRibbon === true, "the rung mounts the S1 aid").toBe(true);
      for (const hold of HOLDS) {
        const { shadow } = mountScene(lesson, hold);
        expect(shadow, `one S1 ShadowCar under ${String(hold)}`).toHaveLength(1);
        expect(shadow[0]!.showRibbon, `showRibbon under ${String(hold)}`).toBe(hold !== "personStruck");
        expect(shadow[0]!.showGhost, `showGhost under ${String(hold)}`).toBe(lesson.aids?.shadowCar === true);
      }
    });
    it(`${TEMPLATE}@L${L}: the glance pings are handed the scene's hold`, () => {
      for (const hold of HOLDS) {
        const { pings } = mountScene(lesson, hold);
        expect(pings, `one GlanceEdgePings under ${String(hold)}`).toHaveLength(1);
        expect(pings[0]!.routeHold ?? null, `routeHold handed to the pings under ${String(hold)}`).toBe(hold);
      }
    });
  }
});
