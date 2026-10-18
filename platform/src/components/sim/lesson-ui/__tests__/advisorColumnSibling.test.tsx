/**
 * sc-roundabout-entry:fe081cf1, W10 (lane `cardstay2`) — THE ADVISOR'S CARD IS
 * FOUND WHERE THE TWO-CARD PROBE LOOKS FOR IT.
 *
 * `HudToasts.toastPairFitsWithoutAdvisor` asks whether two judged cards would
 * both be whole if the advisor's card waited. It finds that card by reading
 * `scroller.parentElement.children` for an element carrying
 * `TOAST_ADVISOR_ATTR` (`data-hud-advisor`) and takes it out of flow for one
 * read. Its own unit rows (`hud/__tests__/toast-standing-card.test.ts` §7) run
 * on a stand-in column that sets the attribute itself, so removing it from the
 * REAL card left every toast test green (verifier mutant V1, finding F6) — and
 * the advisor wait, with it the mode-P repair, would be silently off.
 *
 * Two halves, both on shipped code:
 *   §1 the real `AdvisorCard`, rendered: its ROOT element (the column child the
 *      shell mounts) carries `TOAST_ADVISOR_ATTR`;
 *   §2 `LessonPlayShell.tsx`, parsed (TypeScript's TSX parser): the
 *      `<AdvisorCard>` mount and the `data-hud-toast-scroller` box have the
 *      SAME nearest host (DOM) element — fragments, conditionals and `{…}`
 *      containers are transparent in the DOM — so the card is a sibling of the
 *      scroller, where `scroller.parentElement.children` reads. The predicate
 *      carries its own negative control: the same source with the card wrapped
 *      in one more `<div>` must fail it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { TOAST_ADVISOR_ATTR } from "@/modules/sim/hud/HudToasts";
import { AdvisorCard } from "../AdvisorCard";

const SHELL = resolve(__dirname, "../LessonPlayShell.tsx");

describe("§1 the real AdvisorCard carries the attribute the two-card probe reads", () => {
  it("its root element — the column child — carries TOAST_ADVISOR_ATTR", () => {
    const html = renderToStaticMarkup(<AdvisorCard prompt={{ textBg: "Спри преди линията.", keys: [] }} />);
    const root = html.match(/^<([a-z]+)((?:\s[^>]*)?)>/);
    expect(root, "AdvisorCard rendered no element").not.toBeNull();
    const attrs = root![2]!;
    expect(
      new RegExp(`\\s${TOAST_ADVISOR_ATTR}(=|\\s|$)`).test(attrs),
      `the advisor's card root <${root![1]}${attrs}> does not carry ${TOAST_ADVISOR_ATTR}: the two-card probe cannot find it, and the advisor never waits for two judged cards`,
    ).toBe(true);
  });
});

/** The nearest enclosing JSX element that is a DOM host (lower-case tag) or a component; fragments, `{…}` and expressions are skipped. */
function hostParent(n: ts.Node): ts.JsxElement | null {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) return p;
  }
  return null;
}

function tagOf(n: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText();
}

function attrsOf(n: ts.JsxElement | ts.JsxSelfClosingElement): string[] {
  const a = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;
  return a.properties.filter(ts.isJsxAttribute).map((p) => p.name.getText());
}

/** Where the advisor's card and the toast scroller stand in the shell's JSX. */
function placement(source: string) {
  const sf = ts.createSourceFile("LessonPlayShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const advisors: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const scrollers: ts.JsxElement[] = [];
  const walk = (n: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxElement(n)) && tagOf(n) === "AdvisorCard") advisors.push(n);
    if (ts.isJsxElement(n) && attrsOf(n).includes("data-hud-toast-scroller")) scrollers.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return {
    advisors,
    scrollers,
    sameParent:
      advisors.length === 1 &&
      scrollers.length === 1 &&
      hostParent(advisors[0]!) !== null &&
      hostParent(advisors[0]!) === hostParent(scrollers[0]!) &&
      /^[a-z]/.test(tagOf(hostParent(advisors[0]!)!)),
  };
}

describe("§2 LessonPlayShell mounts the advisor's card beside the toast scroller (scroller.parentElement.children)", () => {
  const source = readFileSync(SHELL, "utf8");

  it("one advisor mount, one scroller, and the same host element is the parent of both", () => {
    const p = placement(source);
    expect(p.advisors.length, "the shell does not mount exactly one <AdvisorCard>").toBe(1);
    expect(p.scrollers.length, "the shell does not hold exactly one data-hud-toast-scroller box").toBe(1);
    expect(
      p.sameParent,
      "the advisor's card is not a child of the notify column beside the toast scroller: the two-card probe (scroller.parentElement.children) cannot find it",
    ).toBe(true);
  });

  it("negative control: the same source with the advisor's card wrapped in one more <div> fails the predicate", () => {
    const at = source.indexOf("<AdvisorCard");
    expect(at).toBeGreaterThan(0);
    const end = source.indexOf("/>", at);
    expect(end).toBeGreaterThan(at);
    const wrapped = `${source.slice(0, at)}<div>${source.slice(at, end + 2)}</div>${source.slice(end + 2)}`;
    expect(placement(wrapped).sameParent).toBe(false);
  });
});
