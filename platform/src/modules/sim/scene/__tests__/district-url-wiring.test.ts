import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { districtUrlFor } from "../lessonWorldRecipe";
import { LESSONS, POLIGON_LESSONS, EXAM_LESSON } from "../../lessons/specs";

/**
 * =============================================================================
 * THE HELPER THAT NOTHING CALLED — dead-predicate census, 2026-08-26.
 *
 * `districtUrlFor` shipped in 46947ce and `rg` across `platform/src` and
 * `tools/` returned ZERO references to it — not one call, not one test. It was
 * not wrong; it was simply never the thing anybody typed. `LessonScene.tsx`,
 * the component the /simulator route actually mounts, spelled the same
 * template out inline instead:
 *
 *     const res = await fetch(`/world/${districtId}.json`);
 *
 * That is the exact shape this whole wave exists to find — an answer that
 * ships beside the question and is never asked. The repair is not another
 * test of the helper in isolation (it already had one implicitly: it is two
 * lines and cannot be wrong). It is to make the LIVE fetch go through it, and
 * then to hold that.
 *
 * WHAT THIS FILE HOLDS, and why it is a source scan rather than a render:
 * mounting `LessonScene` needs a WebGL canvas, Rapier and a district document,
 * so no unit test in this project can observe its `fetch`. What CAN be
 * asserted honestly is that the one live district fetch on the /simulator path
 * is written as a call to this module, and that no second copy of the URL
 * template has grown back beside it.
 *
 * THE CHAIN THIS GUARDS:
 *   app/(dashboard)/simulator/page.tsx
 *     → simulator-client.tsx
 *       → LessonPlayShell.tsx
 *         → LessonScene.tsx   ← the fetch below
 *           → lessonWorldRecipe.districtUrlFor
 *
 * MUTATION THAT MUST TURN THIS RED: put the template literal back in
 * LessonScene, or drop the import. Both are caught below.
 * =============================================================================
 */

const LESSON_SCENE = resolve(__dirname, "../../../../components/sim/LessonScene.tsx");

describe("districtUrlFor is what the live scene fetches", () => {
  it("LessonScene calls districtUrlFor and imports it from this module", () => {
    const src = readFileSync(LESSON_SCENE, "utf8");
    expect(src).toContain("districtUrlFor(props.lesson)");
    // …from HERE, not from a re-declaration further up the file.
    expect(src).toMatch(
      // No `s` flag: the pattern has no `.` at all, so `dotAll` changed nothing —
      // and `target: ES2017` rejects it outright (TS1501). `[^}]*` already
      // crosses newlines, which is the only thing a multi-line import needs.
      /import\s*\{[^}]*\bdistrictUrlFor\b[^}]*\}\s*from\s*"@\/modules\/sim\/scene\/lessonWorldRecipe"/,
    );
  });

  it("no second copy of the district URL template survives in LessonScene", () => {
    const src = readFileSync(LESSON_SCENE, "utf8");
    // Code only — the comment above the call quotes the old line on purpose,
    // and a scanner that cannot tell a quotation from a call is the instrument
    // that lies in the reassuring direction.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/`\/world\/\$\{[^}]*\}\.json`/);
  });

  // …and the URL it hands the scene resolves to a document that is actually
  // served. This is the half a predicate test cannot do: the fetch above is
  // now the ONLY district address on the /simulator path, so if this helper
  // ever points somewhere `public/world/` does not hold, every lesson loads a
  // 404 and the drive never starts. Asserted against the shipped catalogue.
  it("every shipped lesson's URL resolves to a committed world document", () => {
    const publicDir = resolve(__dirname, "../../../../../public");
    for (const lesson of [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON]) {
      const url = districtUrlFor(lesson);
      expect(url.startsWith("/world/") && url.endsWith(".json")).toBe(true);
      expect(
        existsSync(resolve(publicDir, url.slice(1))),
        `${lesson.id} → ${url} is not in public/world`,
      ).toBe(true);
    }
  });
});
