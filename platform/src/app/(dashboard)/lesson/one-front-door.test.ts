/**
 * ONE ENGINE, ONE MOUNTING SURFACE — the half `wiring.test.ts` does not claim.
 *
 * `/lesson` and `/classroom` shipped on the same day, 28 July, over the same
 * `@/modules/lesson`, and NEITHER was reachable. G6 answered the URL half: both
 * `/lesson` routes now `permanentRedirect` into the room, so a bookmark from
 * that week still lands somewhere real, and `classroom/wiring.test.ts` pins the
 * text of those two files.
 *
 * What that left is what this file is about. The redirect made
 * `components/lesson/LessonRunner.tsx` — 26 KB, a complete second rendering of
 * the same engine — mounted by NO route at all. Dead code is not neutral here:
 * it is 26 KB that looks maintained, that a reviewer reads as a live surface,
 * and that every future engine change has to be either applied twice or
 * knowingly skipped. This wave is the case in point — the sign-option fix (doc
 * 91 S2, `SignFace` / `hasSignOptions`) landed in `ClassroomRoom.tsx` and not in
 * the runner, because the runner is not on screen. A second copy that silently
 * stops receiving fixes is worse than no second copy.
 *
 * So the runner is DELETED (doc 91 S8) and the claim guarded here is the strong
 * one: exactly one file in the tree mounts the lesson engine. `wiring.test.ts`
 * reads the two route files; this reads the WHOLE tree, which is the only way to
 * notice a third door being built somewhere nobody thought to look — which is
 * precisely how the second one arrived.
 *
 * Source-scanned rather than rendered, for the reason vitest.config.ts states in
 * as many words: this repo's test environment is `node` with no DOM. Same
 * technique as `components/ui/checkControl.test.ts` and `wiring.test.ts`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Every `.tsx` under src/, as forward-slash paths relative to it. */
function everyComponentFile(): string[] {
  return [...readdirSync(SRC, { recursive: true, encoding: "utf8" })]
    .map((f) => f.split("\\").join("/"))
    .filter((f) => f.endsWith(".tsx"));
}

const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

/**
 * The two imports that make a file a lesson SURFACE rather than a passer-by:
 * the engine's own client player, and the lesson server actions (`loadBeat`,
 * `askTeacher`, `answerLessonQuiz`). A file that reaches for either is driving
 * the lesson, whatever it is called.
 *
 * `@/modules/lesson` (the server barrel) is deliberately NOT in this list — the
 * catalogue is read by the dashboard card, the redirect and the room's page, and
 * reading the catalogue is not mounting the engine.
 */
const SURFACE_IMPORTS = [
  '"@/modules/lesson/client"',
  '"@/app/(dashboard)/lesson/actions"',
] as const;

function lessonSurfaces(): string[] {
  return everyComponentFile().filter((path) => {
    const src = read(path);
    return SURFACE_IMPORTS.some((spec) => src.includes(spec));
  });
}

/** The one that survived, and the one a student is actually sent to. */
const THE_ROOM = "app/(dashboard)/classroom/ClassroomRoom.tsx";

describe("the lesson engine has exactly one front door", () => {
  it("is mounted by ONE file in the whole tree", () => {
    // Before the twin was deleted this returned two, which is the defect stated
    // as a number.
    expect(lessonSurfaces()).toEqual([THE_ROOM]);
  });

  it("and the plain runner is gone rather than merely unlinked", () => {
    // Unlinking it would have left the same 26 KB with the same two-places-to
    // -fix problem and no route to notice it from.
    expect(existsSync(join(SRC, "components", "lesson"))).toBe(false);
    expect(everyComponentFile().filter((f) => f.includes("LessonRunner"))).toEqual([]);
  });

  it("the surviving door is the one that got this wave's fixes", () => {
    // The concrete cost of the twin, pinned so the argument is checkable rather
    // than asserted: doc 91 S2's sign-option rendering exists in the room. The
    // runner never received it, and would have gone on not receiving things.
    const room = read(THE_ROOM);
    expect(room).toContain("hasSignOptions");
    expect(room).toContain("SignFace");
  });

  it("the scan is actually walking the tree it claims to", () => {
    // A green scan over an empty directory would make every assertion above
    // decoration — the same silent-vacuum failure the checkbox sweep guards.
    const files = everyComponentFile();
    expect(files).toContain(THE_ROOM);
    expect(files.length).toBeGreaterThan(100);
    // …and the matcher must be capable of matching, or `toEqual([THE_ROOM])`
    // could hold because the substring test is broken rather than because the
    // tree is clean.
    expect(SURFACE_IMPORTS.some((spec) => read(THE_ROOM).includes(spec))).toBe(true);
  });
});

describe("/lesson stays a redirect, not a second destination", () => {
  it("neither route file renders a component", () => {
    for (const rel of [
      "app/(dashboard)/lesson/page.tsx",
      "app/(dashboard)/lesson/[lessonId]/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("permanentRedirect");
      // A redirect route returns `never`. Any JSX here would mean the twin came
      // back under a new name.
      expect(src).not.toMatch(/return\s*\(?\s*</);
    }
  });

  it("the server actions module survives, because the ROOM uses it", () => {
    // Deleting the runner must not take `loadBeat` / `askTeacher` /
    // `answerLessonQuiz` with it: `/lesson` is the URL that is dead, not the
    // module that happens to live at that path.
    const actions = read("app/(dashboard)/lesson/actions.ts");
    for (const fn of ["loadBeat", "askTeacher", "answerLessonQuiz", "saveLessonPosition"]) {
      expect(actions).toContain(`export async function ${fn}`);
    }
    expect(read(THE_ROOM)).toContain('from "@/app/(dashboard)/lesson/actions"');
  });
});
