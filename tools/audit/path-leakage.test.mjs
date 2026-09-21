// Run: node --test tools/audit/path-leakage.test.mjs
//
// A pc-path leg IS ON ITS LINE BY CONSTRUCTION (DESIGN-v2 §8.5, F-M8). The day
// one of its legs is counted by a judge-side reader as "a leg that stayed on its
// route", a guidance row closes on a drive nobody guided. Every reader that
// turns legs into route or credit claims is pinned here to exclude it BEFORE it
// derives anything, and every dispatcher to hand it out only where a canary
// passed. Source-scan pins carry their own mutation beside them.
import { strict as assert } from "node:assert";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legEvidence, renderEvidence } from "./leg-evidence.mjs";
import { redriveSet, routedPathLessons, withPathLeg } from "./build-redrive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, rel), "utf8");

test("route-fidelity-open filters path legs BEFORE measured / onRoute / best / noLine are derived", () => {
  const src = read("route-fidelity-open.mjs");
  const from = src.indexOf("byLesson.get(f.scenario)");
  const to = src.indexOf("return {", from);
  assert.ok(from > 0 && to > from, "unresolved: the per-lesson block moved");
  const block = src.slice(from, to);
  const filter = block.search(/\.filter\(\(l\) => l\.mode !== "path"\)/);
  const firstDev = block.search(/\.filter\(\(l\) => l\.dev\)/);
  assert.ok(filter >= 0, "no path filter in the per-lesson block");
  assert.ok(firstDev > filter, "the path filter must precede `.filter((l) => l.dev)`");
  // MUTATION (S-7): filter only onRoute — the pin goes red
  const mutated = block.replace(/const legs = all\.filter\(\(l\) => l\.mode !== "path"\);/, "const legs = all;").replace(/const onRoute = measured\.filter\(\(l\) => l\.dev\.droveIt\);/, 'const onRoute = measured.filter((l) => l.dev.droveIt && l.mode !== "path");');
  assert.ok(!(mutated.search(/\.filter\(\(l\) => l\.mode !== "path"\)/) >= 0 && mutated.search(/\.filter\(\(l\) => l\.dev\)/) > mutated.search(/\.filter\(\(l\) => l\.mode !== "path"\)/)));
});

test("route-fidelity summarise excludes mode === \"path\"; stale-claims still keys on mode === \"right\"", () => {
  const rf = read("route-fidelity.mjs");
  const body = rf.slice(rf.indexOf("export function summarise"), rf.indexOf("export function summarise") + 1500);
  assert.match(body, /allRows\.filter\(\(r\) => r\.mode !== "path"\)|r\.mode === "path"/);
  assert.match(read("stale-claims.mjs"), /legs\.filter\(\(l\) => l\.mode === "right" && l\.verdict\)/);
});

test("make-verdicts2's brief carries the -path paragraph's key sentence", () => {
  const src = read("make-verdicts2.mjs");
  assert.match(src, /A `-path` LEG IS GRADING EVIDENCE ONLY/);
  assert.match(src, /guidance ribbon, legibility, lane choice, route-keeping, a wrong drive, parity or determinism is UNJUDGED/);
  assert.match(src, /A `-path` leg's sidecars carry `route: null`/);
  assert.match(src, /do not read `droveIt` \/ `onRoute` from a `-path` folder/);
});

/* CODE-REVIEW-2 M5: a path leg's `_audit-debrief.json` / `_audit-status.json` carried
 * routeDeviation's whole-drive object (onRoute, droveIt) — exactly what the brief tells
 * every judge to parse as "this leg stayed on its route". It is `harnessRoute` now. */
test("lesson-audit writes route: null and harnessRoute on a path leg, BEFORE both sidecar writers", () => {
  const la = fs.readFileSync(path.join(HERE, "..", "mobile", "lesson-audit.mjs"), "utf8").replace(/\r\n/g, "\n");
  const block = la.indexOf("guidance.routeRefusal = pathRouteLine(pathEvidence, guidance.routeRefusal);");
  const nulled = la.indexOf("    guidance.route = null;", block);
  const harness = la.indexOf("guidance.harnessRoute = guidance.route", block);
  const debriefWriter = la.indexOf("`${OUT}/_audit-debrief.json`");
  const debriefRoute = la.indexOf("route: guidance.route ?? null,", debriefWriter);
  const statusWriter = la.lastIndexOf("  guidance,\n");
  assert.ok(block > 0 && nulled > 0 && harness > 0 && debriefWriter > 0 && debriefRoute > 0 && statusWriter > 0, "unresolved anchor");
  assert.ok(harness < nulled, "harnessRoute is copied before route is nulled");
  assert.ok(nulled - block < 1200, "route is nulled inside the path evidence block");
  assert.ok(nulled < debriefWriter && nulled < statusWriter, "route is null before _audit-debrief.json and the final status are written");
  // the null is on the path leg only: the enclosing block is the path-evidence guard
  const guardAt = la.lastIndexOf('if (STEER_BY === "authored-path") {', block);
  assert.ok(guardAt > 0 && block - guardAt < 600, "the null sits inside `if (STEER_BY === \"authored-path\")`");
  // MUTATION: the v1 shape (route kept, byConstruction added) is gone and would be caught
  assert.doesNotMatch(la, /guidance\.route = guidance\.route \? \{ \.\.\.guidance\.route, byConstruction: true \}/);
  const v1 = la.replace("    guidance.route = null;", "    guidance.route = guidance.harnessRoute;");
  assert.equal(v1.indexOf("    guidance.route = null;", block), -1, "the pin can fail");
});

test("legEvidence gives a path leg NO route, even from a sidecar that still carries one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "path-leak-"));
  const dir = path.join(root, "sc-no-such-lesson__pc-path");
  fs.mkdirSync(dir);
  const route = { onRoute: true, droveIt: true, maxM: 0.1, medianM: 0.05, n: 40, coveredFrac: 0.95, routeLengthM: 125 };
  fs.writeFileSync(path.join(dir, "_audit-status.json"), JSON.stringify({ scenario: "sc-no-such-lesson", mode: "path", guidance: { samples: [], route } }));
  fs.writeFileSync(path.join(dir, "_audit-debrief.json"), JSON.stringify({ scenario: "sc-no-such-lesson", mode: "path", route }));
  const e = legEvidence(dir);
  assert.equal(e.route, null, "a path leg must never surface onRoute / droveIt");
  const rdir = path.join(root, "sc-no-such-lesson__pc-right");
  fs.mkdirSync(rdir);
  fs.writeFileSync(path.join(rdir, "_audit-debrief.json"), JSON.stringify({ scenario: "sc-no-such-lesson", mode: "right", route }));
  assert.equal(legEvidence(rdir).route.droveIt, true, "the ribbon leg is untouched");
});

test("build-redrive routes a path leg only from path-routing.json rows with canaryPassed === true, never from prose", () => {
  const src = read("build-redrive.mjs");
  assert.match(src, /r\.canaryPassed === true/);
  assert.match(src, /path-routing\.json/);
  assert.doesNotMatch(src.slice(src.indexOf("export function legsInProse"), src.indexOf("export const NO_SIMULATOR_ROUTE")), /pc-path/, "legsInProse never names pc-path");
  const routing = { rows: [
    { lesson: "sc-a", leg: "pc-path", canaryPassed: true },
    { lesson: "sc-b", leg: "pc-path", canaryPassed: null },
    { lesson: "sc-c", leg: "pc-path", canaryPassed: "true" },
  ] };
  assert.deepEqual([...routedPathLessons(routing)], ["sc-a"]);
  assert.deepEqual(withPathLeg([]), ["mobile-right", "mobile-wrong", "pc-path", "pc-right", "pc-wrong"]);
});

test("S-8: an empty leg list plus a routed path row expands to all five; a named leg plus a row gives two; no row keeps []", () => {
  const routing = { rows: [{ lesson: "sc-park-wall", leg: "pc-path", canaryPassed: true }] };
  const noLeg = [{ scenario: "sc-park-wall", severity: "critical", what: "the bay is never credited", frame: "sc-park-wall/debrief.png" }];
  assert.deepEqual(redriveSet(noLeg, { pathRouting: routing })[0].legs, ["mobile-right", "mobile-wrong", "pc-path", "pc-right", "pc-wrong"]);
  const pcRight = [{ scenario: "sc-park-wall", severity: "major", what: "the bay is never credited", frame: "w47/frames/sc-park-wall__pc-right/07-end.png" }];
  assert.deepEqual(redriveSet(pcRight, { pathRouting: routing })[0].legs, ["pc-path", "pc-right"]);
  assert.deepEqual(redriveSet(noLeg, { pathRouting: { rows: [] } })[0].legs, []);
  assert.deepEqual(redriveSet(noLeg, { pathRouting: null })[0].legs, []);
});

test("wave-c never gives a path leg to a row with an empty legs list", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "mobile", "wave-c.mjs"), "utf8");
  assert.match(src, /const legs = r\.legs && r\.legs\.length \? r\.legs : LEGS\.filter\(\(l\) => !PATH_LEGS\.has\(l\)\);/);
  assert.match(src, /if \(has\("--with-path-legs"\) && !LEGS\.includes\("pc-path"\)\) LEGS\.push\("pc-path"\);/);
  // MUTATION: the unfiltered fallback would hand pc-path to every empty row
  assert.doesNotMatch(src, /const legs = r\.legs && r\.legs\.length \? r\.legs : LEGS;/);
});

test("leg-evidence prints STEERED BY first for a path leg and never «stayed within 8 m of»", () => {
  const e = {
    leg: "sc-park-wall__pc-path", verdict: "ИЗДЪРЖАН", score: 0, exit: 0, legMode: "path", mode: "path",
    route: { onRoute: true, maxM: 0.1, medianM: 0.05, n: 40, droveIt: true, coveredFrac: 0.95, routeLengthM: 125 },
    tracking: { verdict: "path-followed" },
    path: {
      steeredBy: { samplesDigest: "sha256:bc708615def2" },
      evidence: { routeBySegment: [{ k: 0, gear: 1, measured: true, maxM: 0.1, corridorM: 0.4 }], arms: [], stops: [], speed: [], productPark: {}, routeHoldBySegment: [], caveats: [] },
      pathFollow: null,
    },
  };
  const text = renderEvidence(e);
  const lines = text.split("\n");
  assert.match(lines[1], /STEERED BY: AUTHORED PATH/);
  assert.doesNotMatch(text, /stayed within 8 m of/);
  assert.match(text, /GRADING EVIDENCE ONLY/);
  // the ribbon leg is untouched
  const ribbon = renderEvidence({ ...e, leg: "sc-park-wall__pc-right", legMode: "right", mode: "right" });
  assert.match(ribbon, /stayed within 8 m of/);
  assert.doesNotMatch(ribbon, /STEERED BY/);
  // CODE-REVIEW-2 M2: an unmeasured segment never reads «BY CONSTRUCTION»
  const blind = renderEvidence({ ...e, path: { ...e.path, evidence: { ...e.path.evidence, routeBySegment: [{ k: 0, gear: 1, measured: false }, { k: 1, gear: -1, measured: false }] } } });
  assert.doesNotMatch(blind, /BY CONSTRUCTION/);
  assert.match(blind, /UNMEASURED \(F0, R1\): rows resting on those segments are UNJUDGED/);
});
