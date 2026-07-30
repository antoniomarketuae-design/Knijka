/**
 * The 13 tutorial stills are hand-written SVG, so nothing but a test stands
 * between a typo'd coordinate and a blank card in Урок 1. These assertions are
 * the structural half of the R0 „look before ship" rule: they cannot judge
 * whether a diagram READS well, but they catch the failures that make it draw
 * nothing at all, and they pin the theming contract (CSS variables only — the
 * popup is rendered in both schemes).
 *
 * A static two-scheme contact sheet of all thirteen is produced by
 * `renderPreDriveStillSheet()` below; the lane rendered it to
 * scratchpad/predrive-stills.html for the visual pass.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PRE_DRIVE_STEP_ORDER, PRE_DRIVE_STEPS, PRE_DRIVE_TUTORIALS } from "../../procedures";
import { PreDriveStill } from "../PreDriveStill";
import type { PreDriveStepId } from "../../procedures";

function markup(stepId: PreDriveStepId): string {
  return renderToStaticMarkup(createElement(PreDriveStill, { stepId }));
}

/** Contact sheet used for the visual pass (both colour schemes, one page). */
export function renderPreDriveStillSheet(): string {
  return PRE_DRIVE_STEP_ORDER.map(
    (id, i) =>
      `<figure><h3>${i + 1}. ${PRE_DRIVE_STEPS[id].titleBg}</h3>${markup(id)}` +
      `<figcaption>${PRE_DRIVE_TUTORIALS[id].captionBg}</figcaption></figure>`,
  ).join("\n");
}

describe("pre-drive stills", () => {
  it("draws a real diagram for all 13 steps", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const svg = markup(id);
      expect(svg.startsWith("<svg"), id).toBe(true);
      expect(svg, id).toContain('viewBox="0 0 320 170"');
      // Every diagram is more than its background rect: at least six drawing
      // primitives and at least one annotation.
      const shapes = (svg.match(/<(path|circle|rect|ellipse|text)\b/g) ?? []).length;
      expect(shapes, `${id} shape count`).toBeGreaterThanOrEqual(6);
      expect(svg, id).toMatch(/<text[^>]*>[^<]*[а-яА-Я]/);
    }
  });

  it("never emits a broken coordinate", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const svg = markup(id);
      expect(svg, id).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("is announced to screen readers with a Bulgarian description", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const svg = markup(id);
      expect(svg, id).toContain('role="img"');
      const label = /aria-label="([^"]+)"/.exec(svg)?.[1] ?? "";
      expect(label.length, `${id} aria-label`).toBeGreaterThan(20);
      expect(/[а-яА-Я]/.test(label), `${id} aria-label is Bulgarian`).toBe(true);
    }
  });

  it("paints only through CSS variables, so both themes work", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const svg = markup(id);
      // No literal hex/rgb ink anywhere: the popup renders on --surface in
      // light and dark, and a baked #fff would vanish in one of them.
      const literals = svg.match(/(?:fill|stroke)="(#[0-9a-f]{3,8}|rgb[^"]*)"/gi) ?? [];
      expect(literals, `${id} hard-coded colours`).toEqual([]);
      expect(svg, id).toContain("var(--");
    }
  });
});
