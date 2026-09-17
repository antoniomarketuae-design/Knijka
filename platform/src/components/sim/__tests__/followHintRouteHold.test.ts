/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «СЛЕДВАЙ СИНЯТА ЛИНИЯ» STANDS DOWN UNDER THE ROUTE HOLD —
 * sc-roundabout-entry:8ae6f7a2 (major), repair round 3.
 *
 * `followHintStandsDown` (LessonScene.tsx) carries the frame and the ruling.
 * This file holds four things:
 *
 *   1. THE RULE: either kind of hold stands the pill down, and no hold changes
 *      nothing.
 *   2. THE CONSUMER: the pill's own render condition reads it, off the prop,
 *      and the rank discipline the wind-swing chip depends on survives verbatim.
 *   3. THE FALSE-HOLD DIRECTION, which is worse than the defect: every
 *      sc-park-* / sc-pk-* shadow-correct tape, driven through the production
 *      runtime and the lesson engine, gets NO hold on any frame. The pill's
 *      visibility on those drives is therefore exactly what it is today,
 *      whatever the deviation probe says. And a committed tape that really
 *      does leave the carriageway stands the pill down from the frame the
 *      grader books it.
 *   4. THE PRODUCER — the shell handing `snap.objectiveHold` down through
 *      `SceneSlot` and into the scene. LANDED (this session): the two files
 *      carry the wiring and §4 below proves the value ARRIVES, link by link,
 *      off the TypeScript AST and by invoking the component — not by reading
 *      JSX as text, which is what the tripwire it replaces could only do.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import {
  applyTick,
  compileScenario,
  createLessonSession,
  routeHoldForSession,
  SCENARIO_TEMPLATES,
  type RouteHold,
} from "@/modules/sim/lessons";
import { createWorldRuntime } from "@/modules/sim/runtime";
import { parseScenarioTrace } from "@/modules/sim/traces";
import { followHintStandsDown } from "../LessonScene";
import { objectiveTitleUnderHold } from "../lesson-ui/LessonPlayShell";
import { SceneSlot, type SceneSlotProps } from "../lesson-ui/SceneSlot";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const TRACES = path.join(REPO, "content", "traces");
const WORLD = path.join(REPO, "content", "world");
const SCENE = readFileSync(path.resolve(HERE, "../LessonScene.tsx"), "utf8");
const SHELL = readFileSync(path.resolve(HERE, "../lesson-ui/LessonPlayShell.tsx"), "utf8");
const SLOT = readFileSync(path.resolve(HERE, "../lesson-ui/SceneSlot.tsx"), "utf8");

// ---------------------------------------------------------------------------
// 1 · The rule
// ---------------------------------------------------------------------------

describe("the rule", () => {
  it("no hold — absent or null — leaves the pill exactly as it shipped", () => {
    expect(followHintStandsDown(null)).toBe(false);
    expect(followHintStandsDown(undefined)).toBe(false);
  });

  it("either hold stands it down: the lawn, and a car pinned against what it hit", () => {
    const holds: RouteHold[] = ["offRoad", "crashPinned"];
    for (const hold of holds) expect(followHintStandsDown(hold), hold).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 · The consumer
// ---------------------------------------------------------------------------

/** The pill's render condition must read the rule off the prop, and the prop
 *  must reach the component that renders the pill. Anchors that go missing are
 *  faults, not passes. */
function consumerFaults(src: string): string[] {
  const faults: string[] = [];
  const pillAt = src.indexOf('data-hud="follow-hint"');
  if (pillAt < 0) return ['anchor: data-hud="follow-hint" is gone'];
  const condAt = src.lastIndexOf("{followHintOn", pillAt);
  if (condAt < 0 || pillAt - condAt > 400) return ["anchor: the pill's `{followHintOn …` condition is not right above it"];
  const cond = src.slice(condAt, src.indexOf("? (", condAt));
  if (!cond.includes("!followHintStandsDown(routeHold)")) faults.push("the pill does not stand down under the hold");
  // The wind-swing chip's rank discipline, pinned verbatim by secondSwing.test.ts.
  if (!cond.includes("followHintOn && aids?.followHints && !windSwingCueOn")) faults.push("the pill's existing rank condition changed");
  const propsAt = src.indexOf("export interface LessonSceneProps {");
  const propsEnd = src.indexOf("\n}\n", propsAt);
  if (propsAt < 0 || !/\brouteHold\?: RouteHold \| null;/.test(src.slice(propsAt, propsEnd)))
    faults.push("LessonSceneProps does not declare routeHold");
  const readyAt = src.indexOf("export function ReadyScene({");
  const readyEnd = src.indexOf("}: LessonSceneProps & {", readyAt);
  if (readyAt < 0 || readyEnd < 0 || !/\brouteHold = null,/.test(src.slice(readyAt, readyEnd)))
    faults.push("ReadyScene does not take routeHold (defaulting to null)");
  if (!/return routeHold !== null && routeHold !== undefined;/.test(src)) faults.push("the rule's body changed");
  return faults;
}

describe("THE CONSUMER: the pill reads the rule off the prop", () => {
  it("LessonScene.tsx as it is in the tree: no faults", () => {
    expect(consumerFaults(SCENE)).toEqual([]);
  });

  const mutations: ReadonlyArray<[string, string, string]> = [
    ["the pill ignores the hold", " && !followHintStandsDown(routeHold) ? (", " ? ("],
    ["the prop is never destructured", "  routeHold = null,\n}: LessonSceneProps & {", "}: LessonSceneProps & {"],
    ["the prop is undeclared", "  routeHold?: RouteHold | null;\n}", "}"],
    ["the rule inverts", "return routeHold !== null && routeHold !== undefined;", "return routeHold === null;"],
  ];
  for (const [name, from, to] of mutations) {
    it(`MUTATION — ${name}: the guard turns red`, () => {
      const mutated = SCENE.replace(from, to);
      expect(mutated, `«${name}» did not apply — re-anchor it`).not.toBe(SCENE);
      expect(consumerFaults(mutated).length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 3 · The corpus, through the production runtime and the lesson engine
// ---------------------------------------------------------------------------

const districts = new Map<string, unknown>();
function district(id: string): unknown {
  let d = districts.get(id);
  if (d === undefined) {
    d = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    districts.set(id, d);
  }
  return d;
}

type Sample = { tSec: number; x: number; y: number; headingDeg: number; speedKmh: number; gear: number; indicator?: string };

function vehicleFrom(s: Sample): VehicleSample {
  return {
    position: { x: s.x, y: s.y },
    headingDeg: s.headingDeg,
    speedKmh: s.speedKmh,
    indicator: (s.indicator ?? "off") as VehicleSample["indicator"],
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: s.gear,
    mirrorGlance: null,
  };
}

/** Every frame of one committed tape: the hold the shell would hand the scene. */
function driveTape(templateId: string, file: string): Array<{ t: number; hold: RouteHold | null; answered: boolean }> {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === templateId);
  if (spec === undefined) throw new Error(`no template ${templateId}`);
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(TRACES, templateId, file), "utf-8")));
  if (trace === null) throw new Error(`unparseable ${templateId}/${file}`);
  const rt = createWorldRuntime(district(spec.map.districtId));
  let s = createLessonSession(compileScenario(spec, 1));
  const frames: Array<{ t: number; hold: RouteHold | null; answered: boolean }> = [];
  for (const smp of trace.samples as unknown as Sample[]) {
    const tick = rt.sample(vehicleFrom(smp), smp.tSec, false);
    s = applyTick(s, tick).state;
    frames.push({ t: smp.tSec, hold: routeHoldForSession(s), answered: tick.edgeId !== undefined });
    if (s.phase === "completed" || s.phase === "aborted") break;
  }
  return frames;
}

const PARKING = SCENARIO_TEMPLATES.map((s) => s.id).filter((id) => /^sc-(park|pk)-/u.test(id));

describe("THE FALSE-HOLD DIRECTION: a bay or a kerbside band never silences the pill", () => {
  it("every sc-park-* / sc-pk-* shadow-correct tape: no frame on which the pill would stand down", () => {
    let tapes = 0;
    let frames = 0;
    const stoodDown: string[] = [];
    const unanswered: string[] = [];
    for (const id of PARKING) {
      let tape: ReturnType<typeof driveTape>;
      try {
        tape = driveTape(id, "shadow-correct.trace.json");
      } catch (e) {
        if (String(e).includes("ENOENT")) continue; // no recorded tape to replay
        throw e;
      }
      tapes++;
      for (const f of tape) {
        frames++;
        if (!f.answered) unanswered.push(`${id}@${f.t}`);
        if (followHintStandsDown(f.hold)) stoodDown.push(`${id}@${f.t.toFixed(2)}:${f.hold}`);
      }
    }
    // The sweep ran on the corpus, not on nothing: 26 templates carry a tape.
    expect(tapes).toBeGreaterThanOrEqual(26);
    expect(frames).toBeGreaterThan(10_000);
    // The runtime answered every frame, so the zero is an acquittal and not a
    // channel that was never read.
    expect(unanswered).toEqual([]);
    expect(stoodDown).toEqual([]);
  }, 600_000);

  it("…and a committed tape that DOES leave the carriageway stands the pill down, from the booked frame on", () => {
    // sc-sign-warning/mistake-hold-speed: the round-2 corpus replay moved this
    // drive's off-road hold to 23.25 s, the frame the grader's own episode
    // reaches its sustain. Before it the pill is untouched.
    const tape = driveTape("sc-sign-warning", "mistake-hold-speed.trace.json");
    const first = tape.findIndex((f) => f.hold !== null);
    expect(first, "this tape must reach a hold").toBeGreaterThan(0);
    expect(tape[first].hold).toBe("offRoad");
    expect(tape.slice(0, first).some((f) => followHintStandsDown(f.hold))).toBe(false);
    expect(followHintStandsDown(tape[first].hold)).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 4 · The producer — the prop really ARRIVES
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS NOT A GREP, and why the round-3 tripwire above had to be one.
 *
 * `8ae6f7a2` cannot close on a predicate nothing live reads, and until this
 * session it was exactly that: `LessonScene.tsx` had both the rule and the
 * prop, `SceneSlot.tsx` had zero occurrences of `routeHold`, and the shell's
 * `<SceneSlot>` mount passed none — so the pill never stood down and the only
 * thing green was a matcher reading JSX as text. This repo has shipped three
 * green-and-blind source scanners (`districtWorldEdge`, `whyIsReachable`,
 * `touchHintShouldHide`), and a fourth would have been the defect, not the fix.
 *
 * So the chain is proved LINK BY LINK, and no link is a substring test:
 *   1. the shell's snapshot field `objectiveHold` is `routeHoldForSession(s)` —
 *      read off the TypeScript AST as a property assignment, then confirmed
 *      against a real driven session;
 *   2. the `<SceneSlot>` mount carries a JSX attribute `routeHold` whose
 *      expression, EVALUATED against a snapshot object, returns that field;
 *   3. `SceneSlotProps` declares it, so step 2 is type-checked rather than
 *      accidental (`tsc --noEmit` is the other half of this assertion);
 *   4. `SceneSlot` INVOKED as a function hands the value to the element it
 *      renders for the scene — the real component, real props, no text;
 *   5. `followHintStandsDown` on the value that arrived says „stand down".
 *
 * A browser rig for the R3F scene is out of scope for this lane; step 5 is the
 * same function the pill's own render condition calls (§2 pins that verbatim,
 * with four mutations), so the remaining gap is React rendering the condition
 * it was handed — and the w49 pose replay below says what the frames show.
 */

/** Every JSX attribute of the ONE `<tag …>` element in `src`, off the AST. */
function jsxAttrsOf(src: string, file: string, tag: string): Map<string, string> {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<Map<string, string>> = [];
  const visit = (n: ts.Node): void => {
    const open = ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n) ? n : null;
    if (open !== null && open.tagName.getText(sf) === tag) {
      const attrs = new Map<string, string>();
      for (const a of open.attributes.properties) {
        if (ts.isJsxSpreadAttribute(a)) {
          attrs.set("...", a.expression.getText(sf));
          continue;
        }
        if (!ts.isJsxAttribute(a)) continue;
        const init = a.initializer;
        attrs.set(
          a.name.getText(sf),
          init === undefined
            ? "true"
            : ts.isJsxExpression(init)
              ? (init.expression?.getText(sf) ?? "")
              : init.getText(sf),
        );
      }
      found.push(attrs);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // A MATCHER MUST REPORT WHAT IT CANNOT READ. Zero elements (renamed, moved,
  // deleted) and two elements (which one is the drive?) are both „I do not
  // know", and „I do not know" may never read as a pass.
  if (found.length !== 1) throw new Error(`UNRESOLVED: ${file} has ${found.length} <${tag}> elements, expected 1`);
  return found[0];
}

/** The members of `interface <name>` in `src`, off the AST: name → [type, optional]. */
function interfaceMembersOf(src: string, file: string, name: string): Map<string, { type: string; optional: boolean }> {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<Map<string, { type: string; optional: boolean }>> = [];
  const visit = (n: ts.Node): void => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === name) {
      const members = new Map<string, { type: string; optional: boolean }>();
      for (const m of n.members) {
        if (!ts.isPropertySignature(m) || m.name === undefined) continue;
        members.set(m.name.getText(sf), {
          type: m.type?.getText(sf) ?? "",
          optional: m.questionToken !== undefined,
        });
      }
      found.push(members);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found.length !== 1) throw new Error(`UNRESOLVED: ${file} has ${found.length} \`interface ${name}\`, expected 1`);
  return found[0];
}

/** The named type/value bindings `src` imports from `from`, off the AST. */
function importedNamesFrom(src: string, file: string, from: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== from) continue;
    const b = st.importClause?.namedBindings;
    if (b !== undefined && ts.isNamedImports(b)) for (const e of b.elements) names.push(e.name.text);
  }
  return names;
}

/** The argument list of every call to `fn(...)` in `src`, off the AST. */
function callArgsOf(src: string, file: string, fn: string): string[][] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[][] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === fn) out.push(n.arguments.map((a) => a.getText(sf)));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The initializer of object-literal property `prop` wherever it is assigned in `src`. */
function objectPropInitializers(src: string, file: string, prop: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === prop) out.push(n.initializer.getText(sf));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("THE PRODUCER · 1 — the shell's snapshot field is the route hold", () => {
  it("`objectiveHold` is assigned `routeHoldForSession(s)`, once, off the AST", () => {
    expect(objectPropInitializers(SHELL, "LessonPlayShell.tsx", "objectiveHold")).toEqual([
      "routeHoldForSession(s)",
    ]);
  });

  it("…and that function really returns a hold on a drive that leaves the carriageway", () => {
    // The same committed tape §3 uses, so the field is proved against a driven
    // session and not against its own type.
    const tape = driveTape("sc-sign-warning", "mistake-hold-speed.trace.json");
    expect(tape.some((f) => f.hold === "offRoad")).toBe(true);
  }, 120_000);
});

describe("THE PRODUCER · 2 — the <SceneSlot> mount passes it", () => {
  const attrs = (): Map<string, string> => jsxAttrsOf(SHELL, "LessonPlayShell.tsx", "SceneSlot");

  it("the attribute exists and its EXPRESSION reads snap.objectiveHold — evaluated, not matched", () => {
    const expr = attrs().get("routeHold");
    expect(expr, "the <SceneSlot> mount does not pass routeHold at all").toBeDefined();
    // Evaluate what the JSX actually hands down. A misspelt field, a stale
    // alias or a hard-coded null cannot survive this; a text compare could.
    const read = new Function("snap", `return (${expr!});`) as (snap: unknown) => unknown;
    for (const hold of [null, "offRoad", "crashPinned"] as Array<RouteHold | null>) {
      expect(read({ objectiveHold: hold, objectiveTitle: "х", speedKmh: 40 }), String(hold)).toBe(hold);
    }
  });

  it("the mount is still the mount — its other props are untouched", () => {
    // The lane may not widen into the shell, so the rest of the mount is pinned.
    const a = attrs();
    for (const k of ["key", "lesson", "quality", "paused", "onTick", "dashboardStatusRef"]) {
      expect(a.has(k), k).toBe(true);
    }
    expect(a.has("..."), "the mount must not have grown a spread").toBe(false);
  });

  it("MUTATION — the attribute removed: this block turns red", () => {
    const mutated = SHELL.replace(/\n +routeHold=\{snap\.objectiveHold\}/u, "");
    expect(mutated).not.toBe(SHELL);
    expect(jsxAttrsOf(mutated, "mutated", "SceneSlot").get("routeHold")).toBeUndefined();
  });

  it("MUTATION — the attribute reads the wrong field: the evaluation catches it", () => {
    const mutated = SHELL.replace("routeHold={snap.objectiveHold}", "routeHold={snap.objectiveTitle}");
    expect(mutated).not.toBe(SHELL);
    const expr = jsxAttrsOf(mutated, "mutated", "SceneSlot").get("routeHold")!;
    const read = new Function("snap", `return (${expr});`) as (snap: unknown) => unknown;
    expect(read({ objectiveHold: "offRoad", objectiveTitle: "х" })).not.toBe("offRoad");
  });

  it("the AST reader is not a substring test — five synthetic sources it must NOT be fooled by", () => {
    const wrap = (body: string) => `const x = () => (\n  <div>\n${body}\n  </div>\n);\n`;
    // (a) the words, in a comment.
    expect(
      jsxAttrsOf(wrap("    {/* routeHold={snap.objectiveHold} */}\n    <SceneSlot lesson={l} />"), "a", "SceneSlot").has(
        "routeHold",
      ),
    ).toBe(false);
    // (b) the words, in a string.
    expect(
      jsxAttrsOf(wrap('    <SceneSlot lesson={l} title="routeHold={snap.objectiveHold}" />'), "b", "SceneSlot").has(
        "routeHold",
      ),
    ).toBe(false);
    // (c) the attribute on a DIFFERENT element, right next to it.
    expect(
      jsxAttrsOf(
        wrap("    <OtherThing routeHold={snap.objectiveHold} />\n    <SceneSlot lesson={l} />"),
        "c",
        "SceneSlot",
      ).has("routeHold"),
    ).toBe(false);
    // (d) no such element → UNRESOLVED, never a pass.
    expect(() => jsxAttrsOf(wrap("    <SceneSlotX routeHold={h} />"), "d", "SceneSlot")).toThrow(/UNRESOLVED/u);
    // (e) two of them → UNRESOLVED too: „which one drives?" is not knowledge.
    expect(() =>
      jsxAttrsOf(wrap("    <SceneSlot routeHold={h} />\n    <SceneSlot />"), "e", "SceneSlot"),
    ).toThrow(/UNRESOLVED/u);
    // …and it DOES read the real thing when it is really there.
    expect(jsxAttrsOf(wrap("    <SceneSlot routeHold={snap.objectiveHold} />"), "f", "SceneSlot").get("routeHold")).toBe(
      "snap.objectiveHold",
    );
  });
});

describe("THE PRODUCER · 3 — SceneSlotProps declares it, so the mount is type-checked", () => {
  it("`routeHold?: RouteHold | null`, and `RouteHold` is imported from the lessons module", () => {
    const member = interfaceMembersOf(SLOT, "SceneSlot.tsx", "SceneSlotProps").get("routeHold");
    expect(member, "SceneSlotProps does not declare routeHold").toBeDefined();
    expect(member!.type.replace(/\s+/gu, " ")).toBe("RouteHold | null");
    expect(member!.optional, "it must stay optional — every other caller is unchanged").toBe(true);
    expect(importedNamesFrom(SLOT, "SceneSlot.tsx", "@/modules/sim/lessons")).toContain("RouteHold");
  });

  it("MUTATION — the declaration removed: this block turns red", () => {
    const mutated = SLOT.replace(/\r?\n {2}routeHold\?: RouteHold \| null;/u, "");
    expect(mutated).not.toBe(SLOT);
    expect(interfaceMembersOf(mutated, "mutated", "SceneSlotProps").has("routeHold")).toBe(false);
  });

  it("the interface reader is not a substring test either", () => {
    const src = 'export interface SceneSlotProps {\n  lesson: L;\n  // routeHold?: RouteHold | null;\n}\n';
    expect(interfaceMembersOf(src, "g", "SceneSlotProps").has("routeHold")).toBe(false);
    expect(() => interfaceMembersOf("export interface Other { a: 1 }", "h", "SceneSlotProps")).toThrow(/UNRESOLVED/u);
  });
});

describe("THE PRODUCER · 4 — SceneSlot, invoked, hands the value to the scene", () => {
  /** The memo's inner component — the function React would call. */
  const inner = (SceneSlot as unknown as { type: (p: SceneSlotProps) => ReactElement }).type;

  function sceneElementFor(routeHold: RouteHold | null | undefined): ReactElement {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-roundabout-entry")!;
    const props: SceneSlotProps = {
      lesson: compileScenario(spec, 1),
      quality: "low",
      paused: false,
      driveLocked: false,
      preDriveHighlightStepId: null,
      activeObjectiveIndex: 0,
      onTick: () => {},
      onPreDriveStep: () => {},
      onBlockedDriveAttempt: () => {},
      onMinimapFrame: () => {},
      ...(routeHold === undefined ? {} : { routeHold }),
    };
    return inner(props);
  }

  it("the prop reaches the element SceneSlot renders for the scene, for every value", () => {
    for (const hold of [null, "offRoad", "crashPinned"] as Array<RouteHold | null>) {
      const el = sceneElementFor(hold);
      expect((el.props as { routeHold?: RouteHold | null }).routeHold, String(hold)).toBe(hold);
    }
    // …and a caller that passes none still reaches it as absent, which is the
    // pill exactly as it shipped (§1: `followHintStandsDown(undefined) === false`).
    expect((sceneElementFor(undefined).props as { routeHold?: RouteHold | null }).routeHold).toBeUndefined();
  });

  it("…and it is the SCENE it reaches, not some sibling — one element, the lazy LessonScene", () => {
    const el = sceneElementFor("offRoad");
    expect(typeof el.type === "function" || typeof el.type === "object").toBe(true);
    // Every other prop rides along, so the spread was not narrowed to make this pass.
    expect(Object.keys(el.props as object).sort()).toEqual(
      [
        "activeObjectiveIndex",
        "driveLocked",
        "lesson",
        "onBlockedDriveAttempt",
        "onMinimapFrame",
        "onPreDriveStep",
        "onTick",
        "paused",
        "preDriveHighlightStepId",
        "quality",
        "routeHold",
      ].sort(),
    );
  });

  it("THE LAST LINK: the value that arrived is the one the pill's condition stands down on", () => {
    const arrived = (h: RouteHold | null | undefined) =>
      (sceneElementFor(h).props as { routeHold?: RouteHold | null }).routeHold;
    expect(followHintStandsDown(arrived("offRoad"))).toBe(true);
    expect(followHintStandsDown(arrived("crashPinned"))).toBe(true);
    expect(followHintStandsDown(arrived(null))).toBe(false);
    expect(followHintStandsDown(arrived(undefined))).toBe(false);
  });
});

describe("THE PRODUCER · 5 — the w49 frames, replayed as poses", () => {
  /**
   * `.audit-frames/w49/frames/sc-roundabout-entry__pc-right/04-t080s.png`,
   * `04-t085s.png` and `04-t090s.png` paint the pill while the banner says
   * «Колата е извън пътя». No browser rig for the R3F scene in this lane, so
   * what is proved here is the three ingredients of those frames: at that
   * moment the session's hold is `offRoad`, the value the shell now hands down
   * is that hold, and the rule on it says STAND DOWN. The pixels are the
   * integrator's canary; this is everything upstream of them.
   */
  it("ONE FIELD, TWO SURFACES: the banner's «Колата е извън пътя» reads what the pill now reads", () => {
    // What made the w49 frames a defect is that the banner already SAID the car
    // was off the road on the same frame the pill was still inviting him to
    // follow the line. Both surfaces of that frame are fed by `snap.objectiveHold`
    // — the banner through `objectiveTitleUnderHold`, the pill through the
    // attribute §2 evaluated — so they can no longer disagree about one car.
    const banners = callArgsOf(SHELL, "LessonPlayShell.tsx", "objectiveTitleUnderHold");
    expect(banners.length, "the banner call is gone — re-anchor this").toBeGreaterThan(0);
    // Two call sites, two receivers for the same snapshot (`snap` in the render,
    // `s.snap` in the overlay fold) — what matters is the FIELD, both times.
    for (const args of banners) expect(args[1], JSON.stringify(args)).toMatch(/(?:^|\.)snap\.objectiveHold$/u);
    expect(jsxAttrsOf(SHELL, "LessonPlayShell.tsx", "SceneSlot").get("routeHold")).toBe("snap.objectiveHold");
    // …and that is the line the frames show.
    expect(objectiveTitleUnderHold("Спри на линията", "offRoad")).toContain("Колата е извън пътя");
    expect(followHintStandsDown("offRoad")).toBe(true);
  });

  it("a drive that is off the carriageway hands the scene a hold the pill stands down on", () => {
    const tape = driveTape("sc-sign-warning", "mistake-hold-speed.trace.json");
    const off = tape.filter((f) => f.hold === "offRoad");
    expect(off.length, "this tape must reach the lawn").toBeGreaterThan(0);
    const expr = jsxAttrsOf(SHELL, "LessonPlayShell.tsx", "SceneSlot").get("routeHold")!;
    const read = new Function("snap", `return (${expr});`) as (snap: unknown) => RouteHold | null;
    for (const f of off) {
      const handedDown = read({ objectiveHold: f.hold });
      expect(handedDown, `${f.t}`).toBe("offRoad");
      const arrived = (sceneElementFor2(handedDown).props as { routeHold?: RouteHold | null }).routeHold;
      expect(followHintStandsDown(arrived), `${f.t}`).toBe(true);
    }
  }, 120_000);
});

/** §5's copy of §4's invoker — kept local so neither block depends on the other's scope. */
function sceneElementFor2(routeHold: RouteHold | null): ReactElement {
  const inner = (SceneSlot as unknown as { type: (p: SceneSlotProps) => ReactElement }).type;
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-roundabout-entry")!;
  return inner({
    lesson: compileScenario(spec, 1),
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
  });
}
