/**
 * THE POPULATE PASS IS A FIXED POINT, OR IT IS A LANDMINE.
 *
 * Run: node --test tools/maps/streetwall.test.mjs
 *      (or `npm run test:tools` from platform/, which discovers it)
 *
 * WHAT THIS EXISTS FOR. `gen_streetwall.mjs` reads a shipped district, strips
 * its `sw-` buildings, regenerates them and writes the file back. Its header
 * promised „a re-run on an already-populated repo is a zero-byte diff", and
 * nothing anywhere checked it. On 2026-08-09 it was false for two maps:
 *
 *     d2-v1         380 sw- shipped, 378 regenerated
 *     tj-emerge-v1   14 sw- shipped,  13 regenerated
 *
 * Not because the generator was non-deterministic — `f(f(x)) === f(x)` held
 * exactly — but because those two districts' `spawnPoints` had been edited by
 * a later pass and the wall was never re-stamped. Five shipped buildings were
 * standing inside a spawn keep-out (14.51–15.80 m where the CITY preset wants
 * 18; 11.98 m where JUNCTION wants 12).
 *
 * The cost was not the five buildings. It was that running this tool to add
 * ONE map silently rewrote those two — moving colliders in the exam city — and
 * an earlier wave spent a day chasing the four trace-determinism failures that
 * came out of exactly this.
 *
 * SO THE PROPERTY UNDER TEST IS THE REPO'S, NOT THE FUNCTION'S:
 *
 *     applyStreetwall(shipped) === shipped        for every target
 *
 * plus the function's own idempotence, plus the fleet law that
 * `platform/public/world` is byte-identical to `content/world`.
 *
 * IT CALLS THE DRIVER'S OWN TRANSFORM. A test that re-implemented the pass
 * would go green while the driver drifted away from it — that is the ninth
 * instrument defect wearing a tenth hat. `applyStreetwall` is literally the
 * function `gen_streetwall.mjs` writes with; there is one copy.
 *
 * WHEN THIS GOES RED, the fix is never to edit the numbers here. It is:
 *     node tools/maps/gen_streetwall.mjs --check              # what drifted
 *     node tools/maps/gen_streetwall.mjs --only <the drifted> # converge it
 * and then LOOK at what moved, because a district that stopped being a fixed
 * point means something else changed underneath it — a spawn point, a
 * crossing, an authored building, an edge.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { applyStreetwall, isStreetwallCurrent, TARGETS } from "./lib/streetwall-plan.mjs";
import { STREETWALL_ID_PREFIX } from "./lib/streetwall.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contentFile = (id) => path.join(REPO_ROOT, "content", "world", `${id}.json`);
const publicFile = (id) => path.join(REPO_ROOT, "platform", "public", "world", `${id}.json`);

const swCount = (text) =>
  JSON.parse(text).buildings.filter((b) => String(b.id).startsWith(STREETWALL_ID_PREFIX)).length;

describe("gen_streetwall is idempotent", () => {
  // THE PROBE MUST SEE SOMETHING. A table that silently emptied would make
  // every assertion below vacuous and this file would pass on a broken repo —
  // the failure mode this whole harness keeps re-learning.
  it("the target table is populated and every target is on disk", () => {
    assert.ok(TARGETS.length >= 20, `only ${TARGETS.length} targets — the plan table is empty?`);
    for (const t of TARGETS) {
      assert.ok(["records", "compact"].includes(t.style), `${t.id}: unknown style ${t.style}`);
      assert.ok(readFileSync(contentFile(t.id), "utf8").length > 0, `${t.id} is empty`);
    }
    // At least one map really carries a generated wall, or "no diff" is trivial.
    const walls = TARGETS.reduce((n, t) => n + swCount(readFileSync(contentFile(t.id), "utf8")), 0);
    assert.ok(walls > 500, `only ${walls} sw- buildings across the fleet — is the pass shipped?`);
  });

  for (const target of TARGETS) {
    describe(target.id, () => {
      const shipped = readFileSync(contentFile(target.id), "utf8");

      it("the SHIPPED file is already the pass's output — a re-run is a zero-byte diff", () => {
        const { text } = applyStreetwall(shipped, target);
        if (isStreetwallCurrent(shipped, target)) return;
        const before = swCount(shipped);
        const after = swCount(text);
        const idsBefore = new Set(
          JSON.parse(shipped).buildings.map((b) => b.id).filter((i) => i.startsWith(STREETWALL_ID_PREFIX)),
        );
        const idsAfter = new Set(
          JSON.parse(text).buildings.map((b) => b.id).filter((i) => i.startsWith(STREETWALL_ID_PREFIX)),
        );
        const gone = [...idsBefore].filter((i) => !idsAfter.has(i));
        const added = [...idsAfter].filter((i) => !idsBefore.has(i));
        assert.fail(
          `${target.id} is NOT the populate pass's fixed point: ${before} -> ${after} sw- buildings ` +
            `(${shipped.length} -> ${text.length} bytes).\n` +
            `  would be removed: ${gone.join(", ") || "(none)"}\n` +
            `  would be added:   ${added.join(", ") || "(none)"}\n` +
            `  Something under this district moved — a spawnPoint, a crossing, an edge, an\n` +
            `  authored building. Until it is re-stamped, ANY run of gen_streetwall.mjs (for\n` +
            `  any other map) rewrites this one as a side effect and moves its colliders.\n` +
            `  Fix: node tools/maps/gen_streetwall.mjs --only ${target.id}   — then look at the diff.`,
        );
      });

      it("f(f(x)) === f(x) — the transform itself has no memory", () => {
        const once = applyStreetwall(shipped, target).text;
        const twice = applyStreetwall(once, target).text;
        assert.equal(twice, once, `${target.id}: a second pass over the pass's own output differs`);
      });

      it("platform/public mirror is byte-identical (the fleet law)", () => {
        assert.equal(
          readFileSync(publicFile(target.id), "utf8").replace(/\r\n/g, "\n"),
          shipped.replace(/\r\n/g, "\n"),
          `${target.id}: platform/public/world has drifted from content/world`,
        );
      });

      it("CRLF is not drift — a Windows checkout must not read as a rewrite", () => {
        // core.autocrlf is true in this repo and content/world has no
        // .gitattributes, so a fresh clone here materialises these files with
        // \r\n. If the fixed-point check were byte-literal, all 24 districts
        // would report drift on a clean machine and the driver would rewrite
        // all 24 on its first run — the same defect one layer down, and
        // invisible from inside it.
        assert.ok(
          isStreetwallCurrent(shipped.replace(/\n/g, "\r\n"), target),
          `${target.id}: a CRLF copy of the shipped file reads as drift`,
        );
      });
    });
  }

  it("the transform refuses to move any key but `buildings`", () => {
    // A negative control: a checker that cannot fail has not passed. The
    // serializer writes a FIXED key set, so a district that grows a new
    // top-level key would lose it silently — this proves the guard fires.
    const target = TARGETS[0];
    const doctored = JSON.parse(readFileSync(contentFile(target.id), "utf8"));
    doctored.signalPlans = [{ id: "sp-1" }]; // a key serializeDistrict does not emit
    assert.throws(
      () => applyStreetwall(`${JSON.stringify(doctored, null, 1)}\n`, target),
      /serialization dropped signalPlans/,
      "applyStreetwall accepted a district whose new top-level key it silently drops",
    );
  });
});
