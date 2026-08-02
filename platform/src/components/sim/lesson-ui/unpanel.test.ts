import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GHOST_SURFACES } from "./PlayAreaStyles";

/**
 * THE UNPANEL LAYER, GUARDED THE ONE WAY THAT WOULD HAVE CAUGHT THE LAST MISS.
 *
 * ── Why this file exists, and it is not "CSS deserves a test". ──────────────
 *
 * The wave this belongs to opened with a lane closing eighteen scenarios by
 * writing Bulgarian into `spec.instructionsBg` — a field that is dropped at
 * compile time and read by no .tsx at all. The fault still fired, the student
 * was still never told, and the gate declared it resolved BECAUSE THE GATE READ
 * THE SAME UNRENDERED FIELD THE FIX WROTE. tools/mobile/selectors.test.mjs
 * exists for the identical reason on the other side of the app: a `mustFit`
 * selector that matched nothing vouched for a screen it had never looked at,
 * for four months.
 *
 * PlayAreaStyles' UNPANEL layer is exactly that shape of risk. It reaches five
 * components in three lanes through `data-hud` names, and a rename anywhere
 * else in the tree turns one of those selectors into a no-op SILENTLY: the CSS
 * still parses, the page still renders, the panel simply comes back — and every
 * assertion about "the HUD is unpanelled" keeps passing.
 *
 * So this file asserts the one thing a stylesheet cannot assert about itself:
 * that every surface it claims to strip is a surface that EXISTS. It is a
 * cheap, browser-free, server-free net in the ordinary vitest gate, and it
 * fails in the same commit that removes the markup handle.
 *
 * IT IS NOT A SUBSTITUTE FOR LOOKING. The acceptance test for this work is the
 * founder's two reference frames next to a render (docs/simulation/89 §7). This
 * only guarantees that what was verified by eye is still wired to something.
 */

const SRC = join(__dirname, "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__snapshots__") continue;
      walk(full, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const TSX = walk(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

/** Files that produce the markup a selector needs, by raw substring. */
function producersOf(needle: string): string[] {
  return TSX.filter(({ text }) => text.includes(needle)).map(({ path }) => path);
}

describe("UNPANEL — every ghost selector has a live producer", () => {
  const hudNames = GHOST_SURFACES.map((selector) =>
    /^\[data-hud="(.+)"\]$/.exec(selector)?.[1] ?? null,
  ).filter((name): name is string => name !== null);

  it("names at least the surfaces that were measured as panels", () => {
    // The three biggest painted surfaces on the 2026-08-02 baseline render
    // (7.8 %, 4.6 % and 2.7 % of a 1280×720 frame). If a future edit narrows
    // this layer, it must not narrow past the ones the founder was looking at.
    expect(hudNames).toContain("controls-help");
    expect(hudNames).toContain("audio-prompt");
    expect(hudNames).toContain("mouse-pedals");
    expect(GHOST_SURFACES).toContain(".hud-ghost");
  });

  it.each(hudNames)("[data-hud=\"%s\"] is rendered by some component", (name) => {
    const producers = producersOf(`data-hud="${name}"`);
    expect(
      producers,
      `No .tsx renders data-hud="${name}". The UNPANEL rule for it is dead: ` +
        `the panel is back on the road and nothing failed. Re-point the rule ` +
        `at whatever the surface is called now, or drop it from GHOST_SURFACES.`,
    ).not.toHaveLength(0);
  });

  it(".hud-ghost is carried by the components this lane owns", () => {
    const producers = producersOf("hud-ghost");
    // PlayAreaStyles itself defines it; the point is that something USES it.
    const users = producers.filter((path) => !path.endsWith("PlayAreaStyles.tsx"));
    expect(users.length).toBeGreaterThanOrEqual(6);
  });
});

describe("UNPANEL — the explicit pauses keep their panel", () => {
  const shell = TSX.find(({ path }) => path.endsWith("LessonPlayShell.tsx"));

  it("the shell marks the reading surfaces with data-hud-keep", () => {
    expect(shell).toBeDefined();
    // Micro-quiz, teach card, mistake consequence, the debrief, and the
    // pre-drive checklist. A student who cannot read the rule they just broke
    // has lost the lesson, not the look (doc 89 §3) — so if this count drops,
    // one of those five is being rendered in the ghost register.
    const marks = shell!.text.match(/data-hud-keep/g) ?? [];
    expect(marks.length).toBeGreaterThanOrEqual(5);
  });

  it("data-hud-keep and the ghost list are disjoint", () => {
    // A surface cannot be both stripped and preserved; if one ever appears in
    // both places the cascade decides, which is not a decision anyone made.
    for (const selector of GHOST_SURFACES) {
      expect(selector).not.toContain("data-hud-keep");
    }
  });
});
