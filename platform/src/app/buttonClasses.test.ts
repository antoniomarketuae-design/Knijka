/**
 * EVERY BUTTON CLASS THE PRODUCT USES HAS TO EXIST.
 *
 * `btn-primary` was written in twelve places on 28 July and defined in zero.
 * Tailwind does not warn — an unknown class is simply not emitted — so the
 * controls rendered as bare unstyled text: an inline blue-ish word where a
 * button should be. It survived a week and a founder review because nothing
 * type-checks a string inside `className`, and one of the twelve was
 * „Започни урока", the first tap target in the classroom.
 *
 * This is the net. It reads the class tokens out of the shipped source and
 * demands a matching selector in the CSS that actually ships, so the next
 * `btn-` name someone invents is red before it is a screenshot.
 *
 * WHY ONLY `btn-`. A general "every custom class exists" sweep would have to
 * model the whole Tailwind utility grammar (arbitrary values, variants,
 * `group-*`, plugins) and would be wrong more often than the code. `btn-` is a
 * closed, hand-authored family with three members and it is the family where
 * being missing is invisible rather than obvious: an absent `.card` looks
 * broken instantly, an absent `.btn-primary` looks like a link.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

const CSS_FILES = [
  resolve(__dirname, "globals.css"),
  resolve(SRC, "components/classroom/classroom.css"),
];

/** Class tokens of the `btn-` family, e.g. "btn-accent". */
const BTN = /\bbtn-[a-z0-9-]+/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
      continue;
    }
    // Tests may name a class they are asserting about; only shipped code counts.
    if (/\.test\.tsx?$/.test(entry)) continue;
    if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Selectors actually defined in the stylesheets, e.g. ".btn-accent {".
 *
 * Comments are STRIPPED FIRST, and that is load-bearing rather than tidy: the
 * block above the accent rule explains the alias in prose and writes the class
 * name while doing it. Counting a sentence about a class as a definition of it
 * is exactly the failure this file exists to catch, one level up.
 */
function definedClasses(): Set<string> {
  const defined = new Set<string>();
  for (const file of CSS_FILES) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    // A definition is a SELECTOR: `.btn-x` followed by a combinator, a state,
    // a comma or the opening brace.
    for (const m of css.matchAll(/(^|[\s,])\.(btn-[a-z0-9-]+)(?=[\s,:{.[])/gm)) {
      defined.add(m[2]);
    }
  }
  return defined;
}

describe("the btn- family", () => {
  const defined = definedClasses();
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    for (const m of readFileSync(file, "utf8").matchAll(BTN)) {
      const list = used.get(m[0]) ?? [];
      list.push(file.slice(SRC.length + 1).replaceAll("\\", "/"));
      used.set(m[0], list);
    }
  }

  it("defines .btn-primary — it was used in 12 places and defined in none", () => {
    expect(defined.has("btn-primary")).toBe(true);
  });

  it("keeps .btn-primary and .btn-accent one rule, not two that can drift", () => {
    const css = readFileSync(CSS_FILES[0], "utf8");
    // Same declaration block: the alias is a selector on the accent rule.
    expect(css).toMatch(/\.btn-accent,\s*\n\s*\.btn-primary\s*\{/);
  });

  it("has a definition for every btn- class the product renders", () => {
    const orphans = [...used.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
    expect(orphans).toEqual([]);
  });

  it("still sees the call sites it is guarding", () => {
    // A regex that silently stopped matching would make the test above pass by
    // finding nothing at all.
    expect(used.get("btn-primary")?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(used.get("btn-accent")?.length ?? 0).toBeGreaterThan(10);
  });
});
