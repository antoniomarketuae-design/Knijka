/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, round 2) — NpcColliders MOUNTED,
 * and the scene's link to it EXECUTED.
 *
 * Round 1 held this chain by text: «NpcColliders fills `shellsRef` in a layout
 * effect», «the scene hands it `npcShellsRef`». Its verifier showed what text
 * cannot see — a layout effect given the dependency list `[]` (mutant V7)
 * passed all 126 tests, and a scene that handed NpcColliders a ref nobody
 * reads (V8) failed only a `toContain`. Here the component itself is rendered
 * under the reconciler the scene renders under (@react-three/fiber's bundled
 * react-reconciler), and the scene's own lines are cut out of LessonScene.tsx
 * and run around it:
 *
 *   §1  the REAL `NpcColliders` function — its `useMemo`, its `useLayoutEffect`
 *       and their dependency lists as React evaluates them. Only
 *       @react-three/rapier is replaced: `<RigidBody>` becomes a component
 *       that hands the `ref` a recording body carrying the `userData` tag it
 *       was given (no rapier world exists in this process). Re-rendered with
 *       another traffic system, another cast, another ref: the step the scene
 *       finds in the ref drives the NEW pool, on the mounted bodies.
 *   §2  THE SCENE'S LINK: the declaration of `npcShellsRef`, what
 *       `<RuntimeDriver>` is handed under that name, the grid's `shells` hook
 *       as RuntimeDriver spells it, and the `<NpcColliders … />` element — cut
 *       out of the source and executed together. A graded point handed to the
 *       hook must move the mounted bodies and tag them from the director's
 *       cast.
 *
 * NOT CLAIMED: no rapier body is created (scene/__tests__/npc-shells.test.ts
 * and lessons/scenario/__tests__/npc-contact-cadence drive the pool on real
 * rapier); ReadyScene and RuntimeDriver are not mounted whole.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { createElement, useRef, type FunctionComponent } from "react";
import { reconciler } from "@react-three/fiber";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { NpcColliderUserData, NpcShellCast, NpcShellStep, NpcShellTraffic } from "@/modules/sim/scene/npcShells";
import { NPC_SHELL_PARK_Y, PED_SHELL_COUNT, VEHICLE_SHELL_COUNT } from "@/modules/sim/scene/npcShells";

/** What the pool did to a mounted body, and the tag the component gave it. */
interface MountedBody {
  key: string;
  userData: NpcColliderUserData;
  calls: string[];
}
const mounted: MountedBody[] = [];

vi.mock("@react-three/rapier", async () => {
  const { useLayoutEffect: layout } = await import("react");
  /** `<RigidBody ref userData position type>` without a rapier world: a body
   *  that records what the pool does to it, handed to the component's `ref`
   *  the way @react-three/rapier hands its RapierRigidBody. */
  const RigidBody = (props: { ref?: (body: unknown) => void; userData: NpcColliderUserData; position: [number, number, number] }) => {
    layout(() => {
      const body: MountedBody & Record<string, unknown> = {
        key: `${props.position[0]},${props.position[1]}`,
        userData: props.userData,
        calls: [],
        numColliders: () => 1,
        collider: () => ({ setHalfExtents: () => void body.calls.push("fit") }),
        setTranslation: (v: { x: number; y: number; z: number }) => void body.calls.push(`teleport ${v.x},${v.z}`),
        setRotation: () => {},
        setNextKinematicTranslation: (v: { x: number; y: number; z: number }) => void body.calls.push(`next ${v.x},${v.z}`),
        setNextKinematicRotation: () => {},
      };
      mounted.push(body);
      props.ref?.(body);
      return () => {
        props.ref?.(null);
        const i = mounted.indexOf(body);
        if (i >= 0) mounted.splice(i, 1);
      };
    }, []);
    return null;
  };
  return { RigidBody, CuboidCollider: () => null, CapsuleCollider: () => null };
});

// After the mock: the component under test.
const { NpcColliders } = await import("../NpcColliders");

const HERE = path.dirname(fileURLToPath(import.meta.url));

function r3fRoot() {
  const r = reconciler as unknown as {
    createContainer(...args: unknown[]): unknown;
    updateContainerSync(element: unknown, container: unknown, parent: null, callback: null): void;
    flushSyncWork(): void;
  };
  const errors: unknown[] = [];
  const onError = (e: unknown) => errors.push(e);
  const container = r.createContainer({}, 1, null, false, null, "", onError, onError, onError, null);
  return {
    errors,
    render(element: unknown) {
      r.updateContainerSync(element, container, null, null);
      r.flushSyncWork();
    },
  };
}

type Veh = NpcShellTraffic["vehicles"][number];
const veh = (id: number, x: number, y: number): Veh => ({ id, x, y, dirX: 0, dirY: 1, speedMps: 0 }) as Veh;

/** A traffic system as far as the pool reads one. `staged`: state id → actor. */
function traffic(vehicles: Veh[], staged: Record<number, string> = {}, cyclists: number[] = []): NpcShellTraffic {
  return {
    vehicles,
    pedestrians: [],
    vehicleCollisionKind: (id: number) => (cyclists.includes(id) ? "cyclist" : "vehicle"),
    stagedActorId: (id: number) => staged[id] ?? null,
  } as unknown as NpcShellTraffic;
}
const at = (x: number, y: number) => ({ position: { x, y } }) as Readonly<VehicleSample>;
const bound = () => mounted.filter((b) => b.userData.npcId >= 0).map((b) => `${b.userData.npcId}:${b.userData.kind}`).sort();
const NO_CAST: NpcShellCast = [];

describe("§1 NpcColliders, mounted: the step the scene finds in the ref drives the pool of THIS render", () => {
  const el = (t: NpcShellTraffic, shellsRef: { current: NpcShellStep | null }, cast: NpcShellCast = NO_CAST) =>
    createElement(NpcColliders as unknown as FunctionComponent<Record<string, unknown>>, { traffic: t, shellsRef, cast });

  it("mounts the twelve bodies parked, each with its own tag, and fills the ref in the same commit; a graded point seats the nearest road user's shell on it", () => {
    const root = r3fRoot();
    const shellsRef: { current: NpcShellStep | null } = { current: null };
    root.render(el(traffic([veh(7, 3, 20)]), shellsRef));
    expect(root.errors).toEqual([]);
    expect(mounted.length).toBe(VEHICLE_SHELL_COUNT + PED_SHELL_COUNT);
    expect(mounted.every((b) => b.key.endsWith(`,${NPC_SHELL_PARK_Y}`) && b.userData.npcId === -1)).toBe(true);
    expect(new Set(mounted.map((b) => b.userData)).size).toBe(12);
    expect(typeof shellsRef.current, "the layout effect did not fill shellsRef").toBe("function");
    shellsRef.current!(1, at(0, 0), false);
    expect(bound()).toEqual(["7:vehicle"]);
    const shell = mounted.find((b) => b.userData.npcId === 7)!;
    expect(shell.calls).toEqual(["fit", "teleport 3,-20"]);
    // The next point glides; a respawn point teleports (the third argument is
    // forwarded to the pool).
    shell.calls.length = 0;
    shellsRef.current!(2, at(0, 0), false);
    expect(shell.calls).toEqual(["next 3,-20"]);
    shell.calls.length = 0;
    shellsRef.current!(3, at(0, 0), true);
    expect(shell.calls.filter((c) => c.startsWith("next"))).toEqual([]);
    expect(shell.calls).toContain("teleport 3,-20");
    root.render(null);
    expect(shellsRef.current, "the ref is taken back on unmount").toBeNull();
    expect(mounted.length).toBe(0);
  });

  it("A NEW TRAFFIC SYSTEM (a retry rebuilds the lesson's world): the ref now steps a pool over the NEW system's road users — never the first render's (the verifier's mutant V7 kept the first pool for the life of the mount)", () => {
    const root = r3fRoot();
    const shellsRef: { current: NpcShellStep | null } = { current: null };
    const first = traffic([veh(7, 3, 20)]);
    root.render(el(first, shellsRef));
    shellsRef.current!(30, at(0, 0), false);
    expect(bound()).toEqual(["7:vehicle"]);
    const second = traffic([veh(41, -2, 15), veh(42, 4, 25)]);
    root.render(el(second, shellsRef));
    shellsRef.current!(60, at(0, 0), false);
    expect(bound(), "the scene's ref still steps the pool of a traffic system that is gone").toEqual(["41:vehicle", "42:vehicle"]);
    expect(root.errors).toEqual([]);
    root.render(null);
  });

  it("A NEW CAST (a new director for the same world): a staged rider's shell takes the kind the NEW cast gives it at its next binding", () => {
    const root = r3fRoot();
    const shellsRef: { current: NpcShellStep | null } = { current: null };
    const t = traffic([veh(1000, 0, 12)], { 1000: "rider" });
    root.render(el(t, shellsRef, NO_CAST));
    shellsRef.current!(30, at(0, 0), false);
    expect(bound()).toEqual(["1000:vehicle"]);
    root.render(el(t, shellsRef, [{ actorId: "rider", withWhat: "cyclist" }]));
    shellsRef.current!(60, at(0, 0), false);
    expect(bound()).toEqual(["1000:cyclist"]);
    root.render(null);
  });

  it("A NEW REF from the scene: the old one is emptied and the new one filled — the pool is never stepped through a ref the scene dropped", () => {
    const root = r3fRoot();
    const a: { current: NpcShellStep | null } = { current: null };
    const b: { current: NpcShellStep | null } = { current: null };
    const t = traffic([veh(7, 3, 20)]);
    root.render(el(t, a));
    expect(typeof a.current).toBe("function");
    root.render(el(t, b));
    expect(a.current).toBeNull();
    expect(typeof b.current).toBe("function");
    b.current!(1, at(0, 0), false);
    expect(bound()).toEqual(["7:vehicle"]);
    root.render(null);
    expect(b.current).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 the scene's link
// ───────────────────────────────────────────────────────────────────────────

/**
 * LessonScene's four lines, as trees:
 *   · ReadyScene's `const npcShellsRef = useRef<NpcShellStep | null>(null);`
 *   · what `<RuntimeDriver>` is handed as `npcShellsRef`
 *   · RuntimeDriver's `shells:` hook of the graded call (it reads ITS prop
 *     `npcShellsRef`)
 *   · the `<NpcColliders … />` element
 * compiled into one component: the hook is evaluated with RuntimeDriver's prop
 * name bound to what the scene handed it, the element rendered with the REAL
 * component.
 */
function sceneLink() {
  const source = readFileSync(path.join(HERE, "..", "LessonScene.tsx"), "utf-8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile("LessonScene.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let decl: ts.VariableStatement | null = null;
  let handed: ts.Expression | null = null;
  let hook: ts.Expression | null = null;
  let element: ts.JsxSelfClosingElement | null = null;
  const counts = { decl: 0, handed: 0, hook: 0, element: 0 };
  const walk = (n: ts.Node) => {
    if (ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => d.name.getText(sf) === "npcShellsRef")) {
      decl = n;
      counts.decl++;
    }
    if (ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (tag === "NpcColliders") {
        element = n;
        counts.element++;
      }
      if (tag === "RuntimeDriver") {
        for (const a of n.attributes.properties) {
          if (ts.isJsxAttribute(a) && a.name.getText(sf) === "npcShellsRef" && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) {
            handed = a.initializer.expression;
            counts.handed++;
          }
        }
      }
    }
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "shells" && ts.isArrowFunction(n.initializer)) {
      hook = n.initializer;
      counts.hook++;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (counts.decl !== 1 || counts.handed !== 1 || counts.hook !== 1 || counts.element !== 1) {
    throw new Error(`the scene's link is not where this test reads it: ${JSON.stringify(counts)}`);
  }
  const text = {
    decl: (decl as unknown as ts.Node).getText(sf),
    handed: (handed as unknown as ts.Node).getText(sf),
    hook: (hook as unknown as ts.Node).getText(sf),
    element: (element as unknown as ts.Node).getText(sf),
  };
  const js = ts.transpileModule(
    [
      "return function SceneLink({ traffic, director, out }) {",
      text.decl,
      // RuntimeDriver's hook, with its prop bound to what the scene handed it.
      `out.shells = ((npcShellsRef) => (${text.hook}))(${text.handed});`,
      `return (${text.element});`,
      "};",
    ].join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } },
  ).outputText;
  const make = new Function("React", "useRef", "NpcColliders", "directorContactCast", `"use strict";\n${js}`) as (
    ...scope: unknown[]
  ) => FunctionComponent<{ traffic: NpcShellTraffic; director: unknown; out: { shells?: (k: number, s: Readonly<VehicleSample>, respawned: boolean) => void } }>;
  return { text, make };
}

describe("§2 the scene's link, executed: a graded point handed to RuntimeDriver's `shells` hook moves the bodies NpcColliders mounted", () => {
  const link = sceneLink();
  /** The director's cast, as `directorContactCast` hands it out. */
  const castOf = new Map<unknown, NpcShellCast>();
  const SceneLink = link.make(React, useRef, NpcColliders, (director: unknown) => castOf.get(director) ?? []);

  it("the four lines are the scene's (what is cut, verbatim)", () => {
    expect(link.text.decl).toBe("const npcShellsRef = useRef<NpcShellStep | null>(null);");
    expect(link.text.hook.replace(/\s+/g, " ")).toBe("(k, student, respawned) => npcShellsRef.current?.(k, student, respawned)");
    expect(link.text.element.startsWith("<NpcColliders ")).toBe(true);
  });

  it("the hook reaches the mounted pool: the nearest road user's shell is seated — a scene that hands NpcColliders another ref moves nothing (the verifier's mutant V8)", () => {
    const root = r3fRoot();
    const out: { shells?: (k: number, s: Readonly<VehicleSample>, respawned: boolean) => void } = {};
    const director = {};
    root.render(createElement(SceneLink, { traffic: traffic([veh(7, 3, 20)]), director, out }));
    expect(root.errors).toEqual([]);
    expect(typeof out.shells).toBe("function");
    out.shells!(1, at(0, 0), false);
    expect(bound(), "the grid's shells hook did not reach the pool NpcColliders mounted").toEqual(["7:vehicle"]);
    expect(mounted.find((b) => b.userData.npcId === 7)!.calls).toEqual(["fit", "teleport 3,-20"]);
    root.render(null);
    // Unmounted: the hook finds an empty ref and poses nothing (no throw).
    out.shells!(2, at(0, 0), false);
    expect(mounted.length).toBe(0);
  });

  it("…and NpcColliders is handed the DIRECTOR'S cast: a staged rider the marker calls a vehicle wears «cyclist» because his runner casts him one", () => {
    const root = r3fRoot();
    const out: { shells?: (k: number, s: Readonly<VehicleSample>, respawned: boolean) => void } = {};
    const director = {};
    castOf.set(director, [{ actorId: "sc-vbl-rider-cf", withWhat: "cyclist" }]);
    root.render(createElement(SceneLink, { traffic: traffic([veh(1001, 0, 12), veh(5, 3, 30)], { 1001: "sc-vbl-rider-cf" }), director, out }));
    out.shells!(1, at(0, 0), false);
    expect(bound(), "the shell's kind did not come from the director's cast").toEqual(["1001:cyclist", "5:vehicle"]);
    root.render(null);
  });
});
