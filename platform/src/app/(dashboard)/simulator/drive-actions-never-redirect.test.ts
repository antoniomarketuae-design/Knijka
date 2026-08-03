/**
 * B39 — THE GUARD THAT DID NOT EXIST FOR THREE WAVES.
 *
 * A server action that calls `requireUser()` calls `redirect()`, and Next turns
 * a redirect thrown inside a server action into a 303 THAT THE ROUTER FOLLOWS.
 * For an action reachable from the driving shell that does not mean "you are
 * signed out" — it means the whole drive screen is REPLACED by /login, mid
 * drive, with no error logged anywhere.
 *
 * What that cost: three separate review waves could not photograph the driving
 * screen at all and all three filed it as an environment problem. Four of five
 * signal lessons bounced to /login ~12 s in. Every lane's render budget was
 * being spent on it, and rows B37/B38/B39/B43 stayed open for want of a frame.
 * For a real student it is worse than for a harness: a session that expires
 * mid-lesson loses the RESULT SCREEN — debrief, law citations, the whole
 * teaching payload — to a login page.
 *
 * No test could see it, because each action was individually correct-looking
 * and the failure only appears when the router follows the 303 in a browser.
 * So this scans the source instead: every server action module the play shell
 * imports must refuse with a VALUE or a THROW, never with a navigation.
 *
 * This file is deliberately paranoid about its own teeth (see the last test) —
 * the gate was recently caught certifying itself by reading a field nothing
 * renders, and a scanner that silently matches nothing is the same failure.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SIM_DIR = join(process.cwd(), "src", "app", "(dashboard)", "simulator");
const SHELL = join(
  process.cwd(),
  "src",
  "components",
  "sim",
  "lesson-ui",
  "LessonPlayShell.tsx",
);

/** Strip comments so the long explanatory notes naming `requireUser` do not
 *  register as calls. Block comments first, then line comments. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * The server-action modules under (dashboard)/simulator that LessonPlayShell
 * imports. Derived from the shell's own import statements rather than hardcoded,
 * so a NEW action wired into the drive screen is covered the day it is wired —
 * which is exactly how the third instance (submitMicroQuizAnswer) survived the
 * first fix.
 */
function actionModulesImportedByShell(): string[] {
  const shell = stripComments(read(SHELL));
  const specifiers = [
    ...shell.matchAll(/from\s+"@\/app\/\(dashboard\)\/simulator\/([\w-]+)"/g),
  ].map((m) => m[1]);
  return [...new Set(specifiers)];
}

describe("server actions reachable from the driving shell never redirect", () => {
  const modules = actionModulesImportedByShell();

  it("finds the shell's simulator action imports at all", () => {
    // If this ever goes empty the scan below passes vacuously and the whole
    // file becomes decoration. The three known at the time of writing:
    // actions (finishLessonAction), calibration-actions
    // (recordSelfPredictionAction), micro-quiz-actions (both halves).
    expect(modules.length).toBeGreaterThanOrEqual(3);
    expect(modules).toContain("actions");
    expect(modules).toContain("calibration-actions");
    expect(modules).toContain("micro-quiz-actions");
  });

  it.each(modules)("%s does not call requireUser()", (mod) => {
    const source = stripComments(read(join(SIM_DIR, `${mod}.ts`)));
    expect(source).not.toMatch(/\brequireUser\s*\(/);
  });

  it.each(modules)("%s does not call redirect() either", (mod) => {
    // The direct form of the same mistake. A drive action must answer with a
    // result code or throw; navigation is never its business.
    const source = stripComments(read(join(SIM_DIR, `${mod}.ts`)));
    expect(source).not.toMatch(/\bredirect\s*\(/);
  });

  it("still allows requireUser() on the PAGE, which is where it belongs", () => {
    // Guard against over-correcting: a page render redirecting to /login is
    // correct and is the actual security boundary. Only ACTIONS are banned
    // from navigating, so this test fails if someone "fixes" the page too.
    const page = stripComments(read(join(SIM_DIR, "page.tsx")));
    expect(page).toMatch(/\brequireUser\s*\(/);
  });

  it("the scanner has teeth (it fails on a module that does redirect)", () => {
    // Proves the regex + comment-stripping actually match a real call, so a
    // green run above means "no call found", not "scanner is broken".
    const offender = stripComments(`
      import { requireUser } from "@/modules/auth";
      // requireUser() named in a comment must NOT count
      export async function badAction() {
        const user = await requireUser();
        return user;
      }
    `);
    expect(offender).toMatch(/\brequireUser\s*\(/);

    const commentOnly = stripComments(`
      // this module only MENTIONS requireUser() in prose
      /* and requireUser() in a block comment */
      export async function fineAction() { return null; }
    `);
    expect(commentOnly).not.toMatch(/\brequireUser\s*\(/);
  });
});
