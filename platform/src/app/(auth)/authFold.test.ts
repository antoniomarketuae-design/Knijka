import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LOGIN FOLD — /login on a phone held sideways (852 x 393, WebKit).
 *
 * WHAT WENT WRONG (audit row app-login:e2577ced, major). The (auth) shell had
 * never been given the `short:` variant, so on the one viewport the mobile
 * harness drives — DEVICES["iphone16-landscape"], 852 x 393 — a student saw the
 * e-mail field and NEITHER of the two controls they need next:
 *
 *   #email                bottom 315   on screen
 *   #password             bottom 399   below the 393px fold
 *   button[type=submit]   bottom 459   below it, elementFromPoint() -> null
 *
 * With the status banner up (/login?reset=1, ?changed=1, ?revoked=1 — the three
 * URLs a student reaches while ALREADY having password trouble) plus one wrong
 * password, #password went to 461 and the button to 579. Signing in was three
 * blind scroll-and-stabilise cycles, 6.2 s each on an unloaded box.
 *
 * WHY THIS FILE EXISTS AND A DRIVE DOES NOT. /login has no /simulator route, so
 * the audit's own instrument can never see this row: every sweep since it was
 * filed has reported it "never driven", and it would have sat open forever. The
 * repair is eleven `short:` utilities spread over four files and NOTHING pinned
 * them — a single "tidy the variants" pass puts the submit button back under the
 * fold with the whole suite still green. That is what this file stops.
 *
 * RE-MEASURED 2026-09-11 AT HEAD, Playwright WebKit, 852 x 393, dpr 3,
 * reducedMotion: "reduce", the iPhone 16's real landscape insets substituted for
 * env(safe-area-inset-*) (tools/mobile/lib/insets.mjs). The pre-repair class
 * strings reproduce the three numbers above to the pixel; at HEAD:
 *
 *                            at rest          banner + wrong password
 *   #email          bottom      138                      171
 *   #password       bottom      214                      247
 *   submit          bottom      266                      349
 *   elementFromPoint at each centre returns the control itself, all six cases.
 *   document scrollHeight 393 at rest — the page does not scroll at all.
 *
 * THE ACCEPTANCE IS „REACHABLE WITHOUT A BLIND SCROLL", NOT „SCROLLS NICELY".
 * Every utility below buys the pixels back out of CHROME — page padding, panel
 * padding, the brand lockup, the eyebrow, the lead, the gaps. None of them
 * shrinks a control or a type size, and the tests in the last block are there to
 * keep it that way: a fold bought with 12px text is not bought.
 */

const AUTH = __dirname;
const read = (rel: string): string => readFileSync(resolve(AUTH, rel), "utf8");

const LAYOUT = read("layout.tsx");
const UI = read("auth-ui.tsx");
const FIELDS = read("auth-fields.tsx");
const PAGE = read("login/page.tsx");
const FORM = read("login/login-form.tsx");
const GLOBALS = readFileSync(resolve(AUTH, "../globals.css"), "utf8");

/**
 * Only what Tailwind's scanner would call a class. Every file here documents
 * its own `short:` decisions in prose — auth-ui.tsx's header literally says
 * „`short:sr-only` and NOT `short:hidden`" — so a negative assertion run over
 * raw source fails on the comment that explains why the thing is absent.
 */
const classes = (src: string): string =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2])
    .join("\n");

describe("the variant a landscape phone is caught by", () => {
  it("is height-only, so no width breakpoint can miss it", () => {
    // 852px WIDE is `sm:` and up — which is why every `sm:` in this shell was
    // serving a landscape phone the DESKTOP spacing into 393px of height.
    expect(GLOBALS).toContain("@custom-variant short (@media (max-height: 520px));");
  });
});

describe("the shell stands its chrome down", () => {
  it("collapses the page padding, the panel padding and the legal row", () => {
    expect(LAYOUT).toContain("px-4 py-12 text-foreground short:py-2");
    expect(LAYOUT).toContain("p-6 shadow-depth-2 short:p-4 sm:p-7");
    expect(LAYOUT).toContain("mt-6 flex justify-center gap-5 short:mt-3");
  });

  it("takes the brand lockup out of the FLOW, never out of the page", () => {
    // 40px of a 393px screen spent on a logo above a login form is the cheapest
    // 40px in the group — but it is a LINK HOME. `sr-only` keeps it in the
    // accessibility tree and in the tab order and `short:focus:not-sr-only`
    // brings it back when it is tabbed to; `hidden` would delete both.
    expect(LAYOUT).toContain("short:sr-only short:focus:not-sr-only");
    expect(classes(LAYOUT)).not.toMatch(/short:hidden/);
  });
});

describe("the heading gives up everything but its <h1>", () => {
  it("stands the eyebrow and the lead down without deleting them", () => {
    expect(UI).toContain('<p className="hud-label short:sr-only">');
    expect(UI).toContain("text-sm leading-relaxed text-muted short:sr-only");
    // Same reason as the lockup: the lead is still a sentence and the eyebrow is
    // still this screen's caption. Out of the flow, in the tree.
    expect(classes(UI)).not.toMatch(/short:hidden/);
  });

  it("drops the title's top margin WITH the line it was clearing", () => {
    // `mt-1.5` exists to clear the eyebrow. With the eyebrow sr-only it is 6px
    // of dead space, so it goes in the same breath — and the title takes the
    // one size step this screen can afford.
    expect(UI).toContain("text-2xl font-black tracking-tight short:mt-0 short:text-xl");
    expect(UI).toContain('<header className="mb-6 short:mb-2">');
    expect(UI).toContain('className="rule mt-6 short:mt-3"');
    expect(UI).toContain("mt-4 text-center text-sm text-muted short:mt-2");
  });
});

describe("/login's own two levers", () => {
  it("tightens the status banner's BOX and not its text", () => {
    // The banner is up on exactly the three URLs where a wrong password is most
    // likely (?reset=1, ?changed=1, ?revoked=1), so it is 74px that the at-rest
    // measurement never counted. Its padding and margin give 12px back; its type
    // size is not a saving — a status line a student has to squint at is worse
    // than a scroll.
    expect(PAGE).toContain("text-sm font-semibold text-success short:mb-2 short:py-1.5");
    expect(PAGE).toContain("mt-4 text-center text-xs short:mt-2");
  });

  it("halves the gaps BETWEEN the fields and not the fields", () => {
    expect(FORM).toContain('className="space-y-4 short:space-y-2"');
  });
});

describe("what must not be traded for pixels", () => {
  it("never shrinks a control or a type size to buy the fold", () => {
    // The two controls this row is about are a 42px input and a 44px button on
    // a soft keyboard. Everything above is chrome; nothing below the fold was
    // bought out of a tap target or a reading size.
    const all = [LAYOUT, UI, FIELDS, PAGE, FORM].map(classes).join("\n");
    expect(all).not.toMatch(/short:text-(xs|\[)/);
    expect(all).not.toMatch(/short:(min-)?h-/);
    expect(all).not.toMatch(/short:(px|py|p)-0\b/);
    // The submit stays full-width and full-height: `btn-accent` is py-3.
    expect(FIELDS).toContain('className="btn-accent w-full"');
  });
});

describe("Tailwind's scanner can see the classes", () => {
  it("every fold utility is an unbroken literal", () => {
    // The scanner reads TEXT. A utility split across a `" + "` or a `${...}`
    // seam is a rule Tailwind never generates — the source assertions above all
    // stay green and the button goes back under the fold.
    const needles = [
      "short:py-2",
      "short:p-4",
      "short:mt-3",
      "short:sr-only",
      "short:focus:not-sr-only",
      "short:mb-2",
      "short:mt-0",
      "short:text-xl",
      "short:py-1.5",
      "short:mt-2",
      "short:space-y-2",
    ];
    const all = `${LAYOUT}\n${UI}\n${PAGE}\n${FORM}`;
    for (const n of needles) {
      expect(all).toContain(n);
      expect(all).not.toMatch(
        new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]\\s*[+}]`),
      );
    }
  });
});
