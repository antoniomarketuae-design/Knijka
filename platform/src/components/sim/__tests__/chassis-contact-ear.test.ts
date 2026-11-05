/**
 * sc-hz-brake-dont-swerve:a7d0dd29 — THE RIG'S EAR FOR A CONTACT.
 *
 * `hearChassisContact` is the body of the chassis' old `onCollisionEnter`,
 * every number kept (thump volume, NPC-tag classification, the body-decided
 * threshold, the graded and the nudge branches); what changed is that it is
 * handed a contact from the step record at the contact's own grid point,
 * instead of being called by @react-three/rapier at a frame's drain. This file
 * pins the judge by execution and the wiring by source; the behaviour on rapier
 * at every cadence is lessons/scenario/__tests__/hz-static-contact-cadence.
 *
 * …AND THE EAR'S EFFECT BY EXECUTION (the landing; verifier condition F4). The
 * source pin below reads only the effect's FIRST argument, so a rig that gave
 * the `useLayoutEffect` a dependency array of `[]` passed every test while the
 * ear kept the first render's `onCollision` and `collisionMinKmh` for the life
 * of the mount (the verifier's mutant V1, 162/162 green). The last describe
 * cuts the rig's own `useLayoutEffect(…)` call out of VehicleRig.tsx, deps
 * argument and all, and RUNS it as a component under the reconciler the rig
 * itself renders under (@react-three/fiber's bundled react-reconciler):
 * re-rendered with another callback, then with another threshold, the ear must
 * follow each — React decides whether the effect re-runs, not a pattern match.
 * NOT CLAIMED: VehicleRig as a whole is not mounted (it needs a rapier world
 * and a canvas); what runs is its effect, on the five names it reads.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, useLayoutEffect, type FunctionComponent } from "react";
import { reconciler } from "@react-three/fiber";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { StepContact } from "@/modules/sim/traffic";
import { DISTRICT_SURFACE_USER_DATA } from "@/modules/sim/world";
import { STATIC_ON_CARRIAGEWAY_USER_DATA } from "@/components/sim/ScenarioObstacles";
import {
  COLLISION_MIN_KMH,
  hearChassisContact,
  type ChassisContactListener,
  type CollisionWithWhat,
} from "../VehicleRig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(path.join(HERE, "..", f), "utf-8").replace(/\r\n/g, "\n");

function judge(otherUserData: unknown, impactKmh: number, collisionMinKmh: number) {
  const out = { thumps: [] as number[], graded: [] as Array<[number, CollisionWithWhat]>, nudges: 0 };
  const ret = hearChassisContact({ otherUserData, impactKmh }, collisionMinKmh, {
    thump: (v) => out.thumps.push(v),
    graded: (kmh, w) => out.graded.push([kmh, w]),
    nudge: () => out.nudges++,
  });
  return { ...out, ret };
}

const NPC_VEHICLE = { npcCollider: true, npcId: 12, kind: "vehicle" };
const NPC_PED = { npcCollider: true, npcId: 1004, kind: "pedestrian" };

describe("hearChassisContact — the old onCollisionEnter's judgement, every number kept", () => {
  it("an untagged body (the lesson's block, a wall, a façade) is a static object judged at the lesson's threshold — 0 on a scenario lesson", () => {
    const j = judge(undefined, 6.01, 0);
    expect(j.ret).toBe(true);
    expect(j.graded).toEqual([[6.01, "staticObject"]]);
    expect(j.nudges).toBe(0);
    expect(j.thumps).toEqual([Math.min(1, 6.01 / 50 + 0.15)]);
  });

  it("the district's drive-over surface is judged at the street tolerance whatever the lesson passes: 9.9 is a nudge, 10 is graded", () => {
    expect(judge(DISTRICT_SURFACE_USER_DATA, 9.9, 0)).toMatchObject({ ret: false, graded: [], nudges: 1 });
    expect(judge(DISTRICT_SURFACE_USER_DATA, COLLISION_MIN_KMH, 0)).toMatchObject({
      ret: true,
      graded: [[COLLISION_MIN_KMH, "staticObject"]],
      nudges: 0,
    });
  });

  it("an NPC shell is classified by its tag, at the lesson's threshold", () => {
    expect(judge(NPC_VEHICLE, 3, 0).graded).toEqual([[3, "vehicle"]]);
    expect(judge(NPC_PED, 3, 0).graded).toEqual([[3, "pedestrian"]]);
    // a street lesson (default 10): a 3 km/h shell touch is a nudge
    expect(judge(NPC_VEHICLE, 3, COLLISION_MIN_KMH)).toMatchObject({ ret: false, graded: [], nudges: 1 });
  });

  it("every contact thumps once, at min(1, impact/50 + 0.15)", () => {
    expect(judge(undefined, 80, 0).thumps).toEqual([1]);
    expect(judge(DISTRICT_SURFACE_USER_DATA, 2, 0).thumps).toEqual([2 / 50 + 0.15]);
  });
});

describe("the struck body's carriageway fact (lane staticcardcopy, C1) — read off the collider, never off an NPC shell", () => {
  function judgeAll(otherUserData: unknown, impactKmh: number, collisionMinKmh: number) {
    const graded: unknown[][] = [];
    let nudges = 0;
    const thumps: number[] = [];
    const ret = hearChassisContact({ otherUserData, impactKmh }, collisionMinKmh, {
      thump: (v) => thumps.push(v),
      graded: (...args: unknown[]) => void graded.push(args),
      nudge: () => void nudges++,
    });
    return { ret, graded, nudges, thumps };
  }

  it("a stamped wall or prop is graded as a static object WITH the fact, as a third argument", () => {
    expect(judgeAll(STATIC_ON_CARRIAGEWAY_USER_DATA, 31.29, 0).graded).toEqual([[31.29, "staticObject", true]]);
  });

  it("an unstamped body is graded with TWO arguments, exactly as base", () => {
    expect(judgeAll(undefined, 31.29, 0).graded).toEqual([[31.29, "staticObject"]]);
    expect(judgeAll(DISTRICT_SURFACE_USER_DATA, 31.29, 0).graded).toEqual([[31.29, "staticObject"]]);
  });

  it("an NPC shell never carries it, even if its userData were to say so", () => {
    expect(judgeAll({ ...NPC_VEHICLE, staticOnCarriageway: true }, 31.29, 0).graded).toEqual([[31.29, "vehicle"]]);
  });

  it("the fact moves no threshold, thump or nudge: a stamped body is judged at the lesson's number", () => {
    const flagged = judgeAll(STATIC_ON_CARRIAGEWAY_USER_DATA, 6.01, COLLISION_MIN_KMH);
    const plain = judgeAll(undefined, 6.01, COLLISION_MIN_KMH);
    expect(flagged).toEqual(plain);
    expect(flagged).toMatchObject({ ret: false, graded: [], nudges: 1 });
    expect(judgeAll(STATIC_ON_CARRIAGEWAY_USER_DATA, 80, 0).thumps).toEqual(judgeAll(undefined, 80, 0).thumps);
  });
});

describe("the wiring — a contact reaches the grade ONLY through the step record", () => {
  const rig = read("VehicleRig.tsx");
  const scene = read("LessonScene.tsx");
  const rigSf = ts.createSourceFile("VehicleRig.tsx", rig, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sceneSf = ts.createSourceFile("LessonScene.tsx", scene, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const all = (sf: ts.SourceFile) => {
    const out: ts.Node[] = [];
    const walk = (n: ts.Node) => {
      out.push(n);
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out;
  };
  const rigNodes = all(rigSf);
  const sceneNodes = all(sceneSf);

  it("the chassis <RigidBody> carries NO collision handler: r3r's per-frame drain lost a crash that had rebounded inside a long frame", () => {
    const attrs = rigNodes
      .filter((n): n is ts.JsxAttribute => ts.isJsxAttribute(n))
      .map((a) => a.name.getText(rigSf))
      .filter((n) => /^on(Collision|Contact|Intersection)/.test(n));
    expect(attrs).toEqual([]);
  });

  it("the rig fills its ear in a layout effect with hearChassisContact at ITS threshold, and the graded branch reports the student it was handed", () => {
    const effects = rigNodes.filter(
      (n): n is ts.CallExpression =>
        ts.isCallExpression(n) &&
        n.expression.getText(rigSf) === "useLayoutEffect" &&
        n.arguments[0]?.getText(rigSf).includes("contactListenerRef.current ="),
    );
    expect(effects.length).toBe(1);
    const body = effects[0].arguments[0].getText(rigSf).replace(/\s+/g, " ");
    expect(body).toContain("contactListenerRef.current = (contact, student) => { hearChassisContact(contact, collisionMinKmh, {");
    // RE-TAUGHT (lane staticcardcopy, C1): the graded branch also hands on the
    // struck BODY's carriageway fact, as `hearChassisContact` heard it — the
    // fourth argument. A closure that dropped it would print the off-road copy
    // over a fallen load in the lane; the executed ear below pins it too.
    expect(body).toContain("graded: (impactKmh, withWhat, onCarriageway) => {");
    expect(body).toContain("onCollision?.(impactKmh, withWhat, student, onCarriageway);");
    expect(body).toContain("thump: (volume01) => audioRef.current?.thump(volume01)");
    expect(body).toContain("hapticsRef.current?.collision(impactKmh);");
    expect(body).toContain("nudge: () => hapticsRef.current?.curb()");
    // …and empties it on unmount.
    expect(body).toContain("return () => { contactListenerRef.current = null; };");
    // hearChassisContact is called once in the rig — there.
    expect(rig.split("hearChassisContact(").length - 1).toBe(2); // the declaration + the call
  });

  it("LessonScene makes ONE ear, hands it to VehicleRig and to RuntimeDriver, and names a contact from the student it is handed — never the frame's sample", () => {
    expect(scene.split("useRef<ChassisContactListener | null>(null)").length - 1).toBe(1);
    expect(scene.split("contactListenerRef={contactListenerRef}").length - 1).toBe(2);
    const handle = sceneNodes.find(
      (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && n.name.getText(sceneSf) === "handleCollision",
    );
    expect(handle).toBeDefined();
    const text = handle!.getText(sceneSf).replace(/\s+/g, " ");
    // RE-TAUGHT (lane staticcardcopy, C1): the scene's callback takes the
    // struck body's carriageway fact as its fourth parameter and forwards it to
    // the runtime (executed through the harness cut: static-on-road-chain).
    expect(text).toContain(
      "(impactKmh: number, withWhat: CollisionWithWhat, student: Readonly<VehicleSample>, onCarriageway?: true) =>",
    );
    expect(text).toContain("playerObb(student.position.x, student.position.y, student.headingDeg)");
    expect(text).not.toMatch(/sampleRef|\bsample\./);
  });

  it("LessonScene hands ITS handleCollision to the one <VehicleRig> it mounts — without that prop no rapier contact ever reaches the runtime", () => {
    // The landing's merge verifier (F1): with the prop replaced by
    // `onCollision={undefined}` every test that executes the callback stayed
    // green, because none of them reads how the scene passes it down.
    const rigs = sceneNodes.filter(
      (n): n is ts.JsxSelfClosingElement | ts.JsxOpeningElement =>
        (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sceneSf) === "VehicleRig",
    );
    expect(rigs.length, "LessonScene mounts exactly one <VehicleRig>").toBe(1);
    const handed = rigs[0].attributes.properties
      .filter((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sceneSf) === "onCollision")
      .map((p) =>
        p.initializer && ts.isJsxExpression(p.initializer) ? (p.initializer.expression?.getText(sceneSf) ?? "") : "(not an expression)",
      );
    expect(handed, "the <VehicleRig> element's onCollision attribute").toEqual(["handleCollision"]);
    // …and no spread on the element can replace it after the fact.
    const spreads = rigs[0].attributes.properties.filter((p) => ts.isJsxSpreadAttribute(p)).map((p) => p.getText(sceneSf));
    expect(spreads, "a spread on <VehicleRig> could override onCollision").toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The ear's effect, EXECUTED — the rig's own `useLayoutEffect(…)` call, cut
// out of VehicleRig.tsx with every argument it has, run under R3F's reconciler
// ───────────────────────────────────────────────────────────────────────────

/** What the rig's scope hands the effect — the names it reads from its
 *  component, and nothing else. A rig whose effect reaches for another name
 *  fails here with a ReferenceError naming it (unreadable = red). */
interface EarScope {
  contactListenerRef: { current: ChassisContactListener | null } | undefined;
  collisionMinKmh: number;
  // RE-TAUGHT (lane staticcardcopy, C1): the rig's prop carries the struck
  // body's carriageway fact as a fourth argument.
  onCollision:
    | ((impactKmh: number, withWhat: CollisionWithWhat, student: Readonly<VehicleSample>, onCarriageway?: true) => void)
    | undefined;
  audioRef: { current: { thump(volume01: number): void } | null };
  hapticsRef: { current: { collision(impactKmh: number): void; curb(): void } | null };
}

/** VehicleRig's ear effect as a component: the `useLayoutEffect(…)` call
 *  expression exactly as the source spells it — callback AND dependency
 *  argument, if it has one — and `return null`. */
function earEffectComponent(): { text: string; Ear: FunctionComponent<EarScope> } {
  const rig = read("VehicleRig.tsx");
  const sf = ts.createSourceFile("VehicleRig.tsx", rig, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.CallExpression[] = [];
  const walk = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "useLayoutEffect" &&
      n.arguments[0]?.getText(sf).includes("contactListenerRef.current =")
    ) {
      found.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (found.length !== 1) throw new Error(`expected one ear effect in VehicleRig, found ${found.length}`);
  const text = found[0].getText(sf);
  const js = ts.transpileModule(
    `return function Ear({ contactListenerRef, collisionMinKmh, onCollision, audioRef, hapticsRef }) {\n${text};\nreturn null;\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  const make = new Function("useLayoutEffect", "hearChassisContact", `"use strict";\n${js}`) as (
    ...scope: unknown[]
  ) => FunctionComponent<EarScope>;
  // The module-scope names the effect reads: React's hook and the rig's judge.
  return { text, Ear: make(useLayoutEffect, hearChassisContact) };
}

/** A root of the reconciler VehicleRig renders under (R3F bundles its own
 *  react-reconciler). The ear component renders `null`, so the host config is
 *  never asked for an instance and the container can be a bare object. */
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
    /** One commit, layout effects included (they run inside the commit). */
    render(element: unknown) {
      r.updateContainerSync(element, container, null, null);
      r.flushSyncWork();
    },
  };
}

const contactAt = (step: number, impactKmh: number, otherUserData?: unknown): StepContact => ({
  step,
  otherUserData,
  impactKmh,
});
const studentAt = (x: number) => ({ position: { x, y: 0 }, headingDeg: 0 }) as unknown as Readonly<VehicleSample>;

describe("the ear follows the render — the rig's own layout effect, executed", () => {
  const { text, Ear } = earEffectComponent();

  function mount() {
    const root = r3fRoot();
    const ear: { current: ChassisContactListener | null } = { current: null };
    const heard = { thumps: 0, collisionHaptics: [] as number[], curbs: 0 };
    const audioRef = { current: { thump: () => void heard.thumps++ } };
    const hapticsRef = {
      current: { collision: (kmh: number) => void heard.collisionHaptics.push(kmh), curb: () => void heard.curbs++ },
    };
    const render = (collisionMinKmh: number, onCollision: EarScope["onCollision"]) =>
      root.render(createElement(Ear, { contactListenerRef: ear, collisionMinKmh, onCollision, audioRef, hapticsRef }));
    return { root, ear, heard, render };
  }

  it("the cut is the rig's whole effect call, and running it fills the ear", () => {
    expect(text.startsWith("useLayoutEffect(")).toBe(true);
    const m = mount();
    const first: string[] = [];
    m.render(0, (kmh, what, student) => first.push(`${kmh} ${what} @${student.position.x}`));
    expect(m.root.errors).toEqual([]);
    expect(typeof m.ear.current, "the layout effect did not fill the ear").toBe("function");
    m.ear.current!(contactAt(852, 6.01), studentAt(1));
    expect(first).toEqual(["6.01 staticObject @1"]);
    expect(m.heard).toEqual({ thumps: 1, collisionHaptics: [6.01], curbs: 0 });
    m.root.render(null);
    expect(m.ear.current, "the ear is emptied on unmount").toBeNull();
  });

  it("a re-render with ANOTHER onCollision: the next contact reaches the new callback, never the first render's", () => {
    const m = mount();
    const first: string[] = [];
    const second: string[] = [];
    m.render(0, (kmh, what, student) => first.push(`${kmh} ${what} @${student.position.x}`));
    m.ear.current!(contactAt(10, 6.01), studentAt(1));
    // LessonScene's handleCollision is a useCallback over [runtime, director,
    // traffic, built.scenarioObstacles]: it IS replaced during a mount.
    m.render(0, (kmh, what, student) => second.push(`${kmh} ${what} @${student.position.x}`));
    m.ear.current!(contactAt(20, 7.5), studentAt(2));
    expect(
      { first, second },
      "the ear kept the first render's onCollision — a contact would be pushed through a callback the scene has replaced",
    ).toEqual({ first: ["6.01 staticObject @1"], second: ["7.5 staticObject @2"] });
    expect(m.root.errors).toEqual([]);
  });

  it("a re-render with ANOTHER collisionMinKmh: the next contact is judged at the new threshold, never the first render's", () => {
    const m = mount();
    const graded: string[] = [];
    const onCollision: EarScope["onCollision"] = (kmh, what) => graded.push(`${kmh} ${what}`);
    // a scenario lesson's 0 → every contact graded
    m.render(0, onCollision);
    m.ear.current!(contactAt(10, 6.01), studentAt(1));
    expect(graded).toEqual(["6.01 staticObject"]);
    // the SAME callback, the street tolerance now: a 6 км/ч touch is a nudge,
    // a 12 км/ч one is graded
    m.render(COLLISION_MIN_KMH, onCollision);
    m.ear.current!(contactAt(20, 6.01), studentAt(2));
    expect(
      { graded, curbs: m.heard.curbs },
      "the ear kept the first render's collisionMinKmh — a sub-threshold touch was graded as a collision",
    ).toEqual({ graded: ["6.01 staticObject"], curbs: 1 });
    m.ear.current!(contactAt(30, 12), studentAt(3));
    expect(graded).toEqual(["6.01 staticObject", "12 staticObject"]);
    // …and back down: the threshold falls with the render too.
    m.render(0, onCollision);
    m.ear.current!(contactAt(40, 3), studentAt(4));
    expect(graded).toEqual(["6.01 staticObject", "12 staticObject", "3 staticObject"]);
    expect(m.root.errors).toEqual([]);
  });

  it("a contact with a body STAMPED as standing on the carriageway reaches onCollision with the fact; every other contact without it (lane staticcardcopy, C1)", () => {
    const m = mount();
    const heard: unknown[][] = [];
    m.render(0, (...args) => heard.push([args[0], args[1], (args[2] as { position: { x: number } }).position.x, ...args.slice(3)]));
    m.ear.current!(contactAt(10, 31.29, STATIC_ON_CARRIAGEWAY_USER_DATA), studentAt(1));
    m.ear.current!(contactAt(20, 31.29, undefined), studentAt(2));
    m.ear.current!(contactAt(30, 31.29, NPC_VEHICLE), studentAt(3));
    expect(
      heard,
      "the ear's graded closure must forward the struck body's carriageway fact as onCollision's 4th argument",
    ).toEqual([
      [31.29, "staticObject", 1, true],
      [31.29, "staticObject", 2, undefined],
      [31.29, "vehicle", 3, undefined],
    ]);
    // The fact moves no other channel: one thump and one haptic per contact.
    expect(m.heard).toEqual({ thumps: 3, collisionHaptics: [31.29, 31.29, 31.29], curbs: 0 });
    expect(m.root.errors).toEqual([]);
  });

  it("a rig mounted without an ear (no contactListenerRef) runs the effect and touches nothing", () => {
    const root = r3fRoot();
    root.render(
      createElement(Ear, {
        contactListenerRef: undefined,
        collisionMinKmh: 0,
        onCollision: undefined,
        audioRef: { current: null },
        hapticsRef: { current: null },
      }),
    );
    root.render(null);
    expect(root.errors).toEqual([]);
  });
});
