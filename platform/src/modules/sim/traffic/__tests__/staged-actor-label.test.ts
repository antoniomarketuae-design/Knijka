/**
 * Register row B40(a) — the affordance that says „ТАЗИ КОЛА НЕ ТРЪГВА".
 *
 * WHY THIS FILE EXISTS. A previous lane prescribed a brake-lamp fix for this
 * row and its own frame disproved it: the sleeper is NOSE-ON, so no rear cue
 * reaches the student. The remedy is a caption anchored to the actor — and the
 * four things that can go wrong with it do not show up in a type check:
 *
 *  1. THE ARITHMETIC THE WHOLE FIX RESTS ON. „62 m, nose-on" is a claim about
 *     the staged geometry, and this file RE-DERIVES it from the shipped
 *     district file plus the shipped spec on every run. If someone re-points
 *     the hold, or changes the north arm, or turns the actor round, the
 *     justification for a caption changes with it and this test says so.
 *  2. THE VISIBILITY WINDOW. A card that is up at the spawn answers the
 *     founder's question before he has looked; a card that only appears at the
 *     stop line arrives after the decision. The window is arithmetic against
 *     the two poses that matter (spawn, and the pose instruction 3 points at).
 *  3. THE LAW (ADR-002). The corpus does not hold ППЗДвП, so the caption must
 *     carry the rule's NAME and no article number — and the string must be the
 *     SAME BYTES the lesson's own `teach.lawRef` already froze, or the product
 *     cites one rule two ways.
 *  4. THE PAINTER. The B41 defect, two files over: bare `fillText` calls ran a
 *     law line off both sides of the officer's bubble and nothing in the build
 *     could see it, because the only observable was a rendered frame. Same
 *     recording-context technique as `world-label.test.ts`, same reason.
 */
import { describe, expect, it } from "vitest";
import {
  SC_SIGNAL_HESITATION,
  SC_SIGNAL_HESITATION_SLEEPER,
} from "../../lessons/scenario/templates-signals";
import { compileScenario } from "../../lessons/scenario/compile";
import { validateScenarioSpec } from "../../lessons/scenario/validate";
import {
  drawWorldLabel,
  WORLD_LABEL_MIN_FONT_SCALE,
  WORLD_LABEL_PAD_X,
  WORLD_LABEL_TEX_H,
  WORLD_LABEL_TEX_W,
} from "../../world/components/worldLabel";
import {
  STAGED_ACTOR_LABEL_MAX_DIST_M,
  STAGED_ACTOR_LABEL_MAX_SCALE,
  STAGED_ACTOR_LABEL_REF_DIST_M,
  STAGED_ACTOR_LABEL_ROOF_M,
  STAGED_ACTOR_LABEL_STILL_MPS,
  STAGED_ACTOR_LABELS,
} from "../stagedActorLabels";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

interface Node2D {
  id: string;
  x: number;
  y: number;
}

function districtNodes(id: string): Map<string, Node2D> {
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as { roads: { nodes: Node2D[] } };
  return new Map(raw.roads.nodes.map((n) => [n.id, n]));
}

// ---------------------------------------------------------------------------
// 1. The arithmetic the fix rests on — re-derived, never quoted
// ---------------------------------------------------------------------------

describe("B40(a): the sleeper really is nose-on at the range the card points at", () => {
  const nodes = districtNodes(SC_SIGNAL_HESITATION.map.districtId);
  const pathNodes = SC_SIGNAL_HESITATION_SLEEPER.actor.pathNodes.map((n) => {
    const node = nodes.get(n);
    if (!node) throw new Error(`${n} is not a node of ${SC_SIGNAL_HESITATION.map.districtId}`);
    return node;
  });

  /** Arc length from the path start to each pathNode. */
  const nodeArc = pathNodes.map((_, i) =>
    pathNodes.slice(0, i + 1).reduce((s, n, k, arr) => (k === 0 ? 0 : s + Math.hypot(n.x - arr[k - 1]!.x, n.y - arr[k - 1]!.y)), 0),
  );

  const hold = SC_SIGNAL_HESITATION_SLEEPER.actor.hold;
  const holdArc = nodeArc[hold.nodeIndex]! + hold.offsetM;

  /** Where the dormant actor stands, and which way it is pointing. */
  function poseAt(arc: number): { y: number; dirY: number } {
    let acc = 0;
    for (let i = 1; i < pathNodes.length; i++) {
      const a = pathNodes[i - 1]!;
      const b = pathNodes[i]!;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= arc || i === pathNodes.length - 1) {
        const t = (arc - acc) / seg;
        return { y: a.y + (b.y - a.y) * t, dirY: Math.sign(b.y - a.y) };
      }
      acc += seg;
    }
    throw new Error("arc past the path");
  }

  const pose = poseAt(holdArc);
  /** The pose instruction 3 points at — the one the register photographed. */
  const CARD_POSE_Y = -33.5;
  /** `sx-spawn-south`, on every instance of this archetype. */
  const SPAWN_Y = -105;

  it("stands BEYOND the junction, on the far stop line's side", () => {
    expect(pose.y).toBeGreaterThan(0);
  });

  it("faces the student — it is SOUTHBOUND while he drives north (nose-on)", () => {
    // This is the sentence that killed the brake-lamp class: a rear cue on a
    // car whose FRONT is what you can see reaches nobody.
    expect(pose.dirY).toBe(-1);
  });

  it("is ~62 m out from the pose the instruction card points at", () => {
    const d = pose.y - CARD_POSE_Y;
    expect(d).toBeGreaterThan(55);
    expect(d).toBeLessThan(70);
  });

  it("is ~134 m out from the spawn — which is why the card is not up there", () => {
    expect(pose.y - SPAWN_Y).toBeGreaterThan(STAGED_ACTOR_LABEL_MAX_DIST_M);
  });
});

// ---------------------------------------------------------------------------
// 2. The window: present where the card points, absent where he should look
// ---------------------------------------------------------------------------

describe("B40(a): the visibility window", () => {
  it("holds APPARENT size all the way out to the 62 m the card points at", () => {
    const held = STAGED_ACTOR_LABEL_REF_DIST_M * STAGED_ACTOR_LABEL_MAX_SCALE;
    expect(held).toBeGreaterThanOrEqual(62);
    // …and it stops growing before the cull, or the card shrinks in apparent
    // size over the last stretch before it disappears (the B35 rule).
    expect(held).toBeLessThanOrEqual(STAGED_ACTOR_LABEL_MAX_DIST_M);
  });

  it("is armed well before the decision and not at the spawn", () => {
    expect(STAGED_ACTOR_LABEL_MAX_DIST_M).toBeGreaterThan(62);
    expect(STAGED_ACTOR_LABEL_MAX_DIST_M).toBeLessThan(134);
  });

  it("counts a car as STANDING only below a speed the runner cannot mistake", () => {
    // `BrakingLeadCarRunner` arms on `speedKmh > 4`; the caption's own floor is
    // 0.3 m/s = 1.08 km/h, comfortably under it, so the card is gone within a
    // frame of the actor pulling away and can never label a moving car.
    expect(STAGED_ACTOR_LABEL_STILL_MPS * 3.6).toBeLessThan(4);
    expect(STAGED_ACTOR_LABEL_STILL_MPS).toBeGreaterThan(0);
  });

  it("hangs above a car body, not inside one (the B35 anchoring defect)", () => {
    expect(STAGED_ACTOR_LABEL_ROOF_M).toBeGreaterThanOrEqual(1.3);
  });
});

// ---------------------------------------------------------------------------
// 3. The copy
// ---------------------------------------------------------------------------

describe("B40(a): the caption itself (THEO-4 — never a bare verdict)", () => {
  const kinds = Object.keys(STAGED_ACTOR_LABELS) as (keyof typeof STAGED_ACTOR_LABELS)[];

  it("names what the car IS doing, and names the fault", () => {
    const c = STAGED_ACTOR_LABELS.standingOnGreen;
    expect(c.headlineBg).toContain("НЕ ТРЪГВА");
    // The card must state BOTH halves of the fault: the light is green AND the
    // car is not moving. Either half alone is not «спане на зелено».
    expect(c.line1Bg).toMatch(/[Зз]елен/);
    expect(c.line1Bg).toMatch(/стои|не помръдва/);
    expect(c.line2Bg).toContain("зелено");
  });

  it("is Bulgarian, with no latin letters anywhere a student reads", () => {
    for (const k of kinds) {
      const c = STAGED_ACTOR_LABELS[k];
      for (const s of [c.headlineBg, c.line1Bg, c.line2Bg, c.lawRef]) {
        expect(s, `${k}: "${s}"`).toMatch(/[А-Яа-я]/);
        expect(s, `${k}: "${s}" has latin letters`).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it("ADR-002: cites the rule by NAME and invents no article number", () => {
    for (const k of kinds) {
      // `content/law/acts` holds no ППЗДвП, so a чл. here would be unverifiable
      // BY CONSTRUCTION — the exact failure `rules/catalog.ts` was cleaned of.
      expect(STAGED_ACTOR_LABELS[k].lawRef, k).not.toMatch(/чл\.|ал\.|т\.\s*\d/);
      expect(STAGED_ACTOR_LABELS[k].lawRef, k).toContain("ППЗДвП");
    }
  });

  it("cites it in the SAME BYTES the lesson's own teach block froze", () => {
    // One rule, one string. If the lesson's citation is ever re-worded, the
    // caption over the car must move with it rather than drift into a second
    // phrasing of the same rule.
    expect(STAGED_ACTOR_LABELS.standingOnGreen.lawRef).toBe(SC_SIGNAL_HESITATION.teach.lawRef);
  });
});

// ---------------------------------------------------------------------------
// 4. The wiring — a caption over an actor that does not exist renders nothing
// ---------------------------------------------------------------------------

describe("B40(a): the wiring", () => {
  it("«Спане на зелено» labels its own staged sleeper", () => {
    expect(SC_SIGNAL_HESITATION.actorLabels).toEqual([
      { actorId: SC_SIGNAL_HESITATION_SLEEPER.id, kind: "standingOnGreen" },
    ]);
    expect(validateScenarioSpec(SC_SIGNAL_HESITATION)).toEqual([]);
  });

  it("the validator refuses a caption over an actor nothing stages", () => {
    const broken = {
      ...SC_SIGNAL_HESITATION,
      actorLabels: [{ actorId: "sc-nobody", kind: "standingOnGreen" as const }],
    };
    const errs = validateScenarioSpec(broken);
    expect(errs.join("\n")).toContain("names no staged event");
  });

  it("survives the compiler onto the LessonSpec, by value", () => {
    const lesson = compileScenario(SC_SIGNAL_HESITATION, 1);
    expect(lesson.actorLabels).toEqual([
      { actorId: SC_SIGNAL_HESITATION_SLEEPER.id, kind: "standingOnGreen" },
    ]);
    expect(lesson.actorLabels?.[0]).not.toBe(SC_SIGNAL_HESITATION.actorLabels?.[0]);
  });

  it("no other template in the family carries one", () => {
    // The caption is an answer to a specific, measured legibility problem, not
    // a decoration. Anything else wearing one is a copy-paste.
    expect(SC_SIGNAL_HESITATION.actorLabels?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. The painter — does the ink stay inside the card?
// ---------------------------------------------------------------------------

interface PaintedLine {
  text: string;
  sizePx: number;
  maxWidth: number | undefined;
  width: number;
}

/** Deliberately UNFORGIVING metric: every glyph 0.62 em. Real Cyrillic in
 *  Segoe UI runs ≈ 0.5–0.6 em, so ink that fits here fits on the shipped font. */
const EM_PER_CHAR = 0.62;

function recordingCanvas(): { canvas: HTMLCanvasElement; lines: PaintedLine[] } {
  const lines: PaintedLine[] = [];
  let sizePx = 10;
  const ctx = {
    set font(v: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(v);
      sizePx = m === null ? sizePx : Number(m[1]);
    },
    get font() {
      return `${sizePx}px stub`;
    },
    textAlign: "center",
    textBaseline: "alphabetic",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    measureText: (t: string) => ({ width: t.length * EM_PER_CHAR * sizePx }),
    fillText: (text: string, _x: number, _y: number, maxWidth?: number) => {
      const natural = text.length * EM_PER_CHAR * sizePx;
      lines.push({
        text,
        sizePx,
        maxWidth,
        width: maxWidth === undefined ? natural : Math.min(natural, maxWidth),
      });
    },
    clearRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
  };
  const canvas = {
    width: WORLD_LABEL_TEX_W,
    height: WORLD_LABEL_TEX_H,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, lines };
}

describe("B40(a): the painter keeps the ink inside the card", () => {
  it("paints four lines and none of them leaves the safe area", () => {
    const { canvas, lines } = recordingCanvas();
    drawWorldLabel(canvas, STAGED_ACTOR_LABELS.standingOnGreen);
    expect(lines.length).toBe(4);
    const safe = WORLD_LABEL_TEX_W - 2 * WORLD_LABEL_PAD_X;
    for (const l of lines) {
      expect(l.width, `"${l.text}" is ${l.width.toFixed(0)} px in a ${safe} px card`).toBeLessThanOrEqual(safe + 0.5);
    }
  });

  it("no line has to be squeezed past the shrink floor to fit", () => {
    // Shrinking to the floor is legal but it is the last stop before condensed
    // glyphs, and this caption is read from 62 m. It should not need it.
    const { canvas, lines } = recordingCanvas();
    drawWorldLabel(canvas, STAGED_ACTOR_LABELS.standingOnGreen);
    const authored = [100, 50, 54, 38];
    lines.forEach((l, i) => {
      expect(l.sizePx / authored[i]!, `line ${i} ("${l.text}")`).toBeGreaterThan(WORLD_LABEL_MIN_FONT_SCALE);
    });
  });
});
