/**
 * NO-INVENTED-TERRAIN caption gate — the sc-ov-crest-curve:d8834e1d class,
 * swept corpus-wide (audit W16, 2026-08-28).
 *
 * THE DEFECT. `annotation.textBg` travels inside every committed trace JSON and
 * is painted on the glass by the demonstration deck (TraceTimeline.tsx:779 /
 * :794, data-hud="deck-caption") while the student watches the shadow drive. It
 * is therefore product COPY, and it is the one kind of copy no template review
 * ever reads, because it does not live in a template. Two of its sentences were
 * narrating a landscape this product cannot build:
 *
 *   .audit-frames/w10-1/frames/sc-ov-crest-curve__mobile-right/04-t172s.png —
 *   «Ето ги насрещните — изскачат ИЗЗАД СКЛОНА» over a flat plain, with the box
 *   truck, the bend and the horizon all plainly in view from the driving seat.
 *
 * THE PREMISE IS COMPUTED HERE, NOT ASSERTED. §1 reads all 105 committed
 * districts and proves the world format carries NO terrain elevation channel at
 * all — the top-level key set across the whole corpus is exactly
 * {format, meta, roads, intersections, crossings, roundabouts, buildings,
 * spawnPoints, zones}, and none of them has a z / elevation / grade field. So a
 * slope is not "missing from one map"; it is not expressible, on any map, in any
 * build. A caption that puts a hazard behind one is describing a world the
 * student is not in, and doc 66 R0's whole ruling is that the frame wins.
 *
 * §2 then scans every committed caption (content/traces AND the byte-identical
 * platform/public copies) for that claim, and for the OVERCLAIM the same row
 * carried beside it: calling a bend itself «сляп». The bend on ov-crest-v1 is
 * occluded — by one 18 × 18 m block inside the arc — and the sight distance it
 * leaves is measured, not adjectival: 229 m at the В24, 157 m entering the arc,
 * 141 m at the worst station (lessons/scenario/__tests__/lanes2-rebase-actor-
 * truth.test.ts §2). templates-lanes2.ts settled the wording in wave 7 —
 * «ограничена, not нулева, видимост», with the numbers handed to the student so
 * he can do the subtraction — and this keeps the adjective from coming back
 * through a re-record, which is the one door a template review cannot watch.
 *
 * WHAT IS DELIBERATELY NOT FLAGGED. «на сляпо» describes the DRIVER acting
 * without looking («не свивай на сляпо», «престрояване на сляпо») and is true,
 * taught and ratified; only «сляп/сляпа/слепия» attached to a piece of ROAD is.
 * Mutation-proven on the pre-repair corpus: exactly the four sc-ov-crest-curve
 * captions and the two sc-merge-lane-end/sc-ov-crest-curve slope lines flagged,
 * and nothing else in 167 scenarios.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");
const TRACE_ROOTS = [
  path.join(REPO_ROOT, "content", "traces"),
  path.join(REPO_ROOT, "platform", "public", "traces"),
];

/** Terrain-height fields the format would need before a slope could exist. */
const ELEVATION_KEYS = ["elevation", "altitude", "terrain", "slopeDeg", "gradePct"];

/** «склон» in any inflection — unambiguous in Bulgarian: hillside/slope only. */
const SLOPE_RE = /склон/i;
/**
 * «сляп/сляпа/сляпо/слепия/слепите …» attached to a piece of ROAD. The road
 * nouns are listed rather than matched loosely so «на сляпо» (the driver acting
 * blind — ratified copy in eight templates) can never be caught by this.
 */
const BLIND_ROAD_RE =
  /(сляп|сляпа|сляпо|слепи|слепия|слепият|слепите)\s+(завой|завоя|дъга|дъгата|участък|участъка|било|билото|връх|върха|отсечка|отсечката)/i;
/**
 * …and the PREDICATIVE form, which the attributive pattern above misses and
 * which is the one the audit actually photographed («завоят е сляп»). Both are
 * needed: dropping either lets the claim back in wearing the other word order,
 * and this whole gate exists because a wording repair can be undone by a
 * re-record nobody reviews.
 */
const BLIND_PRED_RE =
  /(завоят|завоя|дъгата|участъкът|участъка|отсечката|билото|върхът)\s+е\s+(сляп|сляпа|сляпо)/i;

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else if (p.endsWith(".trace.json")) out.push(p);
  }
  return out;
}

function captionsOf(file: string): string[] {
  const raw = JSON.parse(readFileSync(file, "utf-8")) as {
    events?: Array<{ kind?: string; textBg?: string }>;
  };
  return (raw.events ?? [])
    .filter((e) => e.kind === "annotation" && typeof e.textBg === "string")
    .map((e) => e.textBg as string);
}

describe("§1 — the premise: this product has no terrain elevation to hide anything behind", () => {
  it("no committed district carries any elevation channel", () => {
    const files = readdirSync(WORLD_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length, "no districts found — check WORLD_DIR").toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(path.join(WORLD_DIR, f), "utf-8");
      for (const key of ELEVATION_KEYS) {
        if (text.includes(`"${key}"`)) offenders.push(`${f}: "${key}"`);
      }
    }
    // If this ever goes red the gate below must be REVISITED, not deleted: a
    // district that really has a slope may narrate one.
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("§2 — no committed caption narrates terrain the world cannot build", () => {
  it("scans every committed trace caption", () => {
    const files = TRACE_ROOTS.flatMap(walkFiles);
    expect(files.length, "no committed traces found — check TRACE_ROOTS").toBeGreaterThan(100);
    const offenders: string[] = [];
    let captions = 0;
    for (const file of files) {
      for (const text of captionsOf(file)) {
        captions++;
        const rel = path.relative(REPO_ROOT, file);
        if (SLOPE_RE.test(text)) offenders.push(`SLOPE  ${rel}\n       «${text}»`);
        if (BLIND_ROAD_RE.test(text) || BLIND_PRED_RE.test(text)) {
          offenders.push(`BLIND  ${rel}\n       «${text}»`);
        }
      }
    }
    expect(captions, "no captions scanned — the walk found nothing").toBeGreaterThan(200);
    expect(
      offenders,
      `${offenders.length} caption(s) narrate terrain this world has no channel for:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
