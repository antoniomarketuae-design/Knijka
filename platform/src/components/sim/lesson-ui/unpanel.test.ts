import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GHOST_SURFACES, UNPANEL_CSS } from "./PlayAreaStyles";

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

/**
 * =============================================================================
 * THE THREE PIECES OF WEB FURNITURE THE 2026-08-03 REVIEW NAMED BY SIGHT.
 *
 * „The briefing bar … ending in a SOLID BRAND-BLUE «Разбрах» button. That is a
 * cookie banner." · „the white circular hamburger, top-left — a mobile-web menu
 * affordance." · „«Начинаещ | Нормален | Напреднал» — a segmented control lifted
 * straight from a settings page, with a filled blue selected segment."
 *
 * All three survived the FIRST unpanel pass, and each for its own reason worth
 * writing down, because the next pass will meet the same three shapes:
 *   · the tier segment was exempted by the sweep's blanket
 *     `:not([aria-pressed="true"])`, which was written for progress fills;
 *   · the ack was exempted by `data-hud-ink`, which is a real and necessary
 *     exemption — the control that clears a blocking line must stay visible —
 *     so the fix had to be a DIFFERENT fill, not no fill;
 *   · the hamburger was never on the ghost list at all.
 *
 * Two of the three are one line of CSS each. That is precisely the kind of line
 * that gets dropped in a merge and noticed in a photograph six weeks later, so
 * each one is pinned here by the text that has to be present. These assertions
 * are cheap and they are NOT a substitute for looking — the acceptance evidence
 * is a render (see the header of this file).
 * =============================================================================
 */
describe("UNPANEL — the named web furniture stays unbuilt", () => {
  const shell = TSX.find(({ path }) => path.endsWith("LessonPlayShell.tsx"))!;
  const overlay = TSX.find(({ path }) => path.endsWith("SimOverlay.tsx"))!;

  it("the tier picker's selected segment is not a filled blue chip", () => {
    // The sweep's own exemption is withdrawn for THIS control, by name.
    expect(UNPANEL_CSS).toMatch(
      /\[data-hud="difficulty"\]\s+button\[aria-pressed="true"\][\s\S]{0,200}background-color:\s*transparent\s*!important/,
    );
    // …and the state is restated, or "which tier am I on" has no answer.
    expect(UNPANEL_CSS).toMatch(/box-shadow:\s*inset[^;]*currentColor/);
  });

  it("the tier picker is not a segmented control any more", () => {
    // The group's own ring is the other half of the settings-page shape.
    expect(UNPANEL_CSS).toMatch(
      /\[data-hud="difficulty"\]\s*\{[\s\S]{0,120}border-color:\s*transparent/,
    );
  });

  it("the instrument register is set in the telemetry face", () => {
    // „his reference uses low-contrast monospace text anchored to the edge".
    expect(UNPANEL_CSS).toMatch(/font-family:\s*var\(--font-mono\)/);
    // …and the authored WHY is NOT, because mono costs it two lines in the
    // 216 px toast box and a student reads that sentence at the worst moment
    // of the lesson (THEO-4). If this pin is ever dropped, the toast silently
    // gets longer on the founder's phone.
    expect(UNPANEL_CSS).toMatch(/:is\(p, h1, h2, h3, blockquote\)[\s\S]{0,80}var\(--font-sans\)/);
  });

  it("the micro menu is a word on the ghost register, not a white disc", () => {
    // The button is found by its own aria-label, so a class rename cannot make
    // this pass by accident.
    const button = /aria-label=\{open \? "Затвори менюто на урока"[\s\S]{0,900}?<\/button>/.exec(
      shell.text,
    )?.[0];
    expect(button, "the micro-menu button moved — re-anchor this test").toBeDefined();
    expect(button).toContain("hud-ghost");
    // No fill and no blur of its own: the register strips them, and writing
    // them here would be a claim the cascade has to win an argument about.
    expect(button).not.toMatch(/bg-background\/|backdrop-blur/);
    // ☰ is the affordance he named. It is not coming back.
    expect(button).not.toContain("☰");
    expect(button).toContain("Меню");
    // 44 px in both axes survives the restyle (row C2).
    expect(button).toMatch(/h-11/);
    expect(button).toMatch(/min-w-11|w-11/);
  });

  /**
   * The PEEK only. The OPEN sheet below it is an explicit pause — a page to
   * read, on its own scrim — and its full-width `btn-accent` is right there:
   * that is the one screen where a call to action IS the content. The founder's
   * complaint is about the rail he drives with, so the assertions are too.
   */
  const peek = /data-sim-overlay-state="peek"[\s\S]*?\n      <\/div>\n      \)\}/.exec(
    overlay.text,
  )?.[0];

  it("the peek block is still findable (anchor check)", () => {
    expect(peek, "the peek block moved — re-anchor the two tests below").toBeDefined();
    // A sanity floor: if the regex ever matches a sliver, the two assertions
    // under it become vacuously true.
    expect(peek!.length).toBeGreaterThan(1200);
    expect(peek).toContain("ackLabelBg");
  });

  it("the overlay ack is a translucent chip, not a solid brand button", () => {
    // Matched inside a className attribute, not anywhere in the slice: the
    // comment above the button NAMES `btn-accent` as the thing it replaced,
    // and a guard that cannot tell a class list from prose is the same
    // green-assertion-as-evidence this whole file exists to end.
    expect(peek).not.toMatch(/className="[^"]*\bbtn-accent\b/);
    // Tinted from the ITEM's tone, so a danger line is not acknowledged with a
    // blue button — and hairline-bordered, so it still reads as pressable.
    expect(peek).toMatch(/backgroundColor: `color-mix\(in srgb, \$\{color\} \d+%/);
    // The exemption that keeps that tint alive through the sweep.
    expect(peek).toContain('data-hud-ink=""');
  });

  it("the overlay peek is no longer a bordered strip", () => {
    // `rounded-full border` on the peek ROW is what made it a „bar". The two
    // CHIPS inside it keep their borders; the row must not have one.
    const row = /className=\{`hud-ghost sim-overlay-in[^`]*`\}/.exec(peek ?? "")?.[0];
    expect(row, "the peek row's class list moved — re-anchor this test").toBeDefined();
    expect(row).not.toMatch(/\bborder\b/);
    expect(row).not.toMatch(/\brounded-full\b/);
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
