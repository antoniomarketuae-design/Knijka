/**
 * `overlayYieldsToSwingCue` — which active row the phone's «втори замах» cue
 * may stand in for. sc-ac-crosswind:a9db1738 clause 4 (the phone half),
 * integrator ruling R-SC1 (A), 2026-11-06:
 *
 *   the cue outranks every active row of overlayPriority ≤ praise that is
 *   neither blocking nor sheet-only (task standby and announcement, legend,
 *   advisor, predrive, praise) and waits for hint and above, every blocking or
 *   sheet-only item, the read sheet, pause modals and the touch hint.
 *
 * T1 — the predicate over every kind × blocking × sheetOnly, against an
 * EXPLICIT table (a table derived from the same comparison would move with a
 * mutated threshold and prove nothing).
 * T6 (hud half) — no builder in this module produces a yielding kind with
 * either flag set; the shell's producers are in
 * components/sim/lesson-ui/__tests__/swingCueYield.test.tsx.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  briefingSheetItem,
  overlayPriority,
  overlayYieldsToSwingCue,
  type SimOverlayItem,
  type SimOverlayKind,
} from "..";

const KINDS: readonly SimOverlayKind[] = [
  "end",
  "teach",
  "violation",
  "warning",
  "hint",
  "praise",
  "predrive",
  "advisor",
  "task",
  "legend",
];
/** R-SC1 (A), written out — NOT derived from overlayPriority. */
const YIELDING_KINDS: ReadonlySet<SimOverlayKind> = new Set(["praise", "predrive", "advisor", "task", "legend"]);

describe("T1 · overlayYieldsToSwingCue", () => {
  it("covers every kind the queue knows (a new kind must be placed on the ladder)", () => {
    for (const k of KINDS) expect(typeof overlayPriority(k)).toBe("number");
    expect(new Set(KINDS).size).toBe(10);
  });

  it("null never yields — no row, nothing to take the place of", () => {
    expect(overlayYieldsToSwingCue(null)).toBe(false);
  });

  for (const kind of KINDS)
    for (const blocking of [true, false, undefined])
      for (const sheetOnly of [true, false, undefined])
        it(`${kind} · blocking ${String(blocking)} · sheetOnly ${String(sheetOnly)}`, () => {
          const item: SimOverlayItem = { id: "x", kind, tone: "neutral", lineBg: "x", blocking, sheetOnly };
          const want = YIELDING_KINDS.has(kind) && blocking !== true && sheetOnly !== true;
          expect(overlayYieldsToSwingCue(item)).toBe(want);
        });

  it("the written table and the priority ladder agree: the cut is between hint (60) and praise (50)", () => {
    for (const k of KINDS) expect(YIELDING_KINDS.has(k), k).toBe(overlayPriority(k) <= overlayPriority("praise"));
    expect(overlayPriority("praise")).toBe(50);
    expect(overlayPriority("hint")).toBe(60);
  });
});

describe("T6 (hud half) · no builder here makes a yielding kind blocking or sheet-only", () => {
  const YIELDING = new Set<string>(YIELDING_KINDS);

  it("the briefing — the one item that sets both flags — is a hint and does not yield", () => {
    const item = briefingSheetItem([{ n: 1, textBg: "Първа стъпка" }, { n: 2, textBg: "Втора" }]);
    expect(item?.kind).toBe("hint");
    expect(item?.sheetOnly).toBe(true);
    expect(item?.blocking).toBe(true);
    expect(overlayYieldsToSwingCue(item)).toBe(false);
  });

  it("every object literal in hud/ that sets `blocking` or `sheetOnly` names a non-yielding kind (or sets the flag false)", () => {
    const dir = resolve(__dirname, "..");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(10);
    const sites: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), "utf8");
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const walk = (n: ts.Node): void => {
        if (ts.isObjectLiteralExpression(n)) {
          const props = new Map<string, string>();
          for (const p of n.properties)
            if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
              props.set(p.name.text, p.initializer.getText(sf).replace(/\s+/g, " "));
          for (const flag of ["blocking", "sheetOnly"]) {
            const v = props.get(flag);
            if (v === undefined || v === "false") continue;
            const kind = /^"([a-z]+)"/.exec(props.get("kind") ?? "")?.[1];
            sites.push(`${f}:${flag}=${v}:kind=${kind ?? "?"}`);
            expect(kind, `${f}: ${flag}: ${v} on an item whose kind cannot be read`).toBeDefined();
            expect(YIELDING.has(kind as string), `${f}: a ${kind} item sets ${flag}: ${v}`).toBe(false);
          }
        }
        ts.forEachChild(n, walk);
      };
      walk(sf);
    }
    // The census of sites, so a silent scan cannot pass: today exactly the briefing.
    expect(sites).toEqual(["overlayQueue.ts:blocking=true:kind=hint", "overlayQueue.ts:sheetOnly=true:kind=hint"]);
  });
});
