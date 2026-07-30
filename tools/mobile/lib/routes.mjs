// -----------------------------------------------------------------------------
// routes.mjs — WHAT gets measured, and what "content" means on each screen.
//
// The coverage number is only meaningful if the CONTENT SURFACE is declared
// honestly, so each route names it here, in one file, reviewable in one screen.
// Two shapes:
//
//   #main-content  — the app shell's own content region (layout.tsx). On a
//                    reading/choosing screen (theory hub, exam hub) the content
//                    IS the page, and everything painting outside or on top of
//                    it — the app header, the bottom nav, sticky action bars,
//                    popups — is chrome. This is exactly the founder's
//                    complaint: "approximately half of the screen is occupied
//                    by controls, information panels, popups".
//
//   a named surface — where #main-content is a WRAPPER rather than the thing a
//                    student is looking at, the route names the thing instead.
//                    theory-practice is that case: its content is the question
//                    CARD. Once the shell lets a page fill the screen (it now
//                    does), measuring the wrapper would report 92% while the
//                    card the founder is complaining about still ended halfway
//                    down the phone. A budget you can satisfy by growing a
//                    <div> is not a budget.
//
//   canvas         — on the driving screen the content is the ROAD. Gran
//                    Turismo puts its instruments inside the 3D image and
//                    leaves the centre of the frame empty; anything DOM painted
//                    over the canvas is chrome, wheel and pedals included. The
//                    brief settles this: "any pixel a control paints on is NOT
//                    road, translucent or not".
//
// BUDGETS are the pass/fail line, and they are deliberately NOT set to today's
// numbers — this is a target the redesign has to reach, not a ratchet on the
// status quo. `contentMin` on the driving screen is the founder's 85%.
// `foldMustPass` encodes "it all have to be on the screen without scrolling".
// -----------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   path: string,
 *   label: string,
 *   expectPath?: string,
 *   contentSelectors: string[],
 *   mustFit: string[],
 *   waitFor?: string,
 *   settleMs?: number,
 *   prepare?: (page: import("playwright").Page) => Promise<void>,
 *   budget: {
 *     contentMin: number,
 *     foldMustPass: boolean,
 *     foldItemsMustFit?: boolean,
 *     touchMustPass: boolean,
 *   },
 *   note?: string,
 * }} RouteSpec
 */

/** The app shell's content region — declared once, used by the DOM routes. */
const MAIN = "#main-content";

/**
 * The practice runner's question card. Its aria-label is „Въпрос N от M", which
 * is the only stable, semantic handle the card has — and it is one the runner
 * cannot drop without breaking the screen reader, which is exactly the property
 * a measurement handle needs.
 */
const PRACTICE_CARD = `${MAIN} section[aria-label^="Въпрос"]`;

/** @type {RouteSpec[]} */
export const ROUTES = [
  {
    id: "theory",
    path: "/theory",
    label: "Теория — topic hub",
    expectPath: "/theory",
    contentSelectors: [MAIN],
    // The founder: "In theory ... only 20% visible to choose the topic". The
    // primary interaction is choosing a topic, so the FIRST topic card is what
    // has to be reachable without a scroll.
    //
    // THIS SELECTOR WAS `first:#main-content article` AND MATCHED NOTHING —
    // from phase 6 until the 107-row review caught it. The topic hub renders
    // its cards as <li><button>, and there is not one <article> on the page, so
    // the fold test measured NO ELEMENT and the sweep printed a fold result
    // that was pure shape. `[data-topic-card]` is an attribute the deck carries
    // for this check and for nothing else (components/theory/TopicDeck.tsx), so
    // it cannot be renamed by a styling pass; selectors.test.mjs fails the
    // build if the two ever come apart again.
    mustFit: [`first:${MAIN} [data-topic-card]`],
    waitFor: MAIN,
    settleMs: 1200,
    // `foldItemsMustFit` and NOT `foldMustPass`: sixteen topics are longer than
    // a phone by design, so demanding a document that does not scroll here
    // would be demanding the wrong thing and the check would be turned off
    // again within a week. What the founder actually said is that he lands on
    // this screen and cannot see the topics — so the gate is on the ITEM: the
    // first topic card has to be on the screen he lands on. That is a
    // condition this route can fail, which is the whole point of the row.
    budget: {
      contentMin: 0.85,
      foldMustPass: false,
      foldItemsMustFit: true,
      touchMustPass: true,
    },
    note: "Long list by design — the document may scroll; the FIRST topic card may not be below the fold.",
  },
  {
    id: "theory-practice",
    path: "/theory/practice",
    label: "Тренировка — practice runner",
    expectPath: "/theory/practice",
    // THE CARD, NOT THE WRAPPER. #main-content on this route is a column that
    // holds a one-line header and the card; now that the app shell lets a page
    // reach the bottom of the screen, that column is the screen whether or not
    // the card is. Measuring it would have turned the founder's „half the
    // screen" into a 92% pass without a single pixel changing for a student.
    // The card is what he is looking at, so the card is what is measured.
    contentSelectors: [PRACTICE_CARD],
    // Verbatim: "I have to scroll down to see all the answers ... it all have
    // to be on the screen without scrolling". So: the question, EVERY answer,
    // and the primary button.
    // `label:has(input)` and not `input[type="radio"]`: the runner renders a
    // radio for single-answer items and a checkbox for multi-answer ones, and a
    // type-specific selector matched NOTHING on a multi-answer question — which
    // the fold test then reported as "not found", i.e. as a pass-shaped
    // non-answer. The label is also the right target: the input itself is a
    // 16x16 control inside it.
    mustFit: [`${MAIN} legend`, `${MAIN} label:has(input)`, `${MAIN} .btn-accent`],
    waitFor: `${MAIN} legend`,
    settleMs: 1500,
    budget: { contentMin: 0.85, foldMustPass: true, touchMustPass: true },
  },
  {
    id: "exams",
    path: "/exams",
    label: "Пробни изпити — hub",
    expectPath: "/exams",
    contentSelectors: [MAIN],
    mustFit: [`${MAIN} .btn-accent`],
    waitFor: MAIN,
    settleMs: 1200,
    budget: { contentMin: 0.85, foldMustPass: false, touchMustPass: true },
    note: "Hub screen: the start button is the primary interaction; history below it may scroll.",
  },
  {
    id: "simulator",
    path: "/simulator",
    label: "Симулатор — lesson select",
    expectPath: "/simulator",
    contentSelectors: [MAIN],
    mustFit: [`first:${MAIN} article`],
    waitFor: MAIN,
    settleMs: 2000,
    budget: { contentMin: 0.85, foldMustPass: false, touchMustPass: true },
  },
  {
    id: "simulator-drive-intro",
    path: "/simulator?scenario=sc-zebra-approach&level=1",
    label: "Симулатор — the popup you land on",
    expectPath: "/simulator",
    contentSelectors: ["canvas"],
    mustFit: [],
    waitFor: "canvas",
    settleMs: 6000,
    budget: { contentMin: 0.85, foldMustPass: false, touchMustPass: false },
    note:
      "The state the driving screen OPENS in. Founder: „the popups continue to eat almost " +
      "the full screen and must be completely redesigned\". Measured separately from the " +
      "road so the redesign has a number for the popup itself.",
  },
  {
    id: "simulator-drive",
    // THEO-2's deep link (?scenario&level) is the only way into the driving
    // shell without clicking through the catalogue, and it is server-resolved
    // against the same progression, so it cannot bypass the unlock gate. Level
    // 1 of the first authored template is open to a fresh account.
    path: "/simulator?scenario=sc-zebra-approach&level=1",
    label: "Симулатор — driving (the 85% screen)",
    expectPath: "/simulator",
    // THE ROAD. Not #main-content: on this screen the content is the 3D image,
    // and the wheel, the pedals, the HUD and every panel painted over it are
    // chrome no matter how transparent they are.
    contentSelectors: ["canvas"],
    mustFit: [],
    waitFor: "canvas",
    settleMs: 6000,
    prepare: dismissOverlays,
    budget: { contentMin: 0.85, foldMustPass: true, touchMustPass: true },
    note: "This is the route the founder's 85% is about — measured with the intro popups dismissed.",
  },
];

/**
 * Tap through the onboarding popups the driving shell opens with, so the road
 * itself can be measured. Deliberately NOT a blind `page.click`: each dismissal
 * is confirmed gone before the next, and the loop is bounded, so a popup that
 * stops dismissing surfaces as a failure instead of a suspiciously good number.
 */
async function dismissOverlays(page) {
  const LABELS = ["Разбрах", "Продължи", "Затвори", "Започни"];

  // MODALS FIRST, AND THE MODAL'S OWN BUTTON — not merely the first button on
  // the page with the right words. The driving shell opens with a full-screen
  // `role="dialog"` ("Караш направо от телефона") AND a sound prompt behind it,
  // and both say „Разбрах". Clicking `.first()` aims at the prompt, which the
  // dialog's backdrop is covering, so Playwright's actionability check refuses
  // — silently, if the error is swallowed. That is how the portrait sweep
  // measured the popup and reported it as the road: 0.0% content.
  for (let round = 0; round < 8; round += 1) {
    const dialog = page.locator('[role="dialog"]').last();
    const inDialog = (await dialog.isVisible().catch(() => false)) ? dialog : page;
    let clicked = false;
    for (const label of LABELS) {
      const button = inDialog.getByRole("button", { name: label, exact: false }).last();
      if (!(await button.isVisible().catch(() => false))) continue;
      try {
        await button.click({ timeout: 10_000 });
        clicked = true;
      } catch {
        // Playwright refused: at the button's centre, `elementFromPoint`
        // returns something else, i.e. A REAL USER'S THUMB WOULD MISS TOO.
        // That is a finding, not a reason to give up, so it is announced and
        // then dispatched programmatically — the alternative is a sweep that
        // reports the popup's geometry as the road.
        console.warn(
          `[mobile-harness] „${label}" was not tappable (something is painted over it); ` +
            `dismissed programmatically so the road can be measured. THIS IS A BUG ON THE SCREEN.`,
        );
        await button.evaluate((el) => el.click()).catch(() => {});
        clicked = true;
      }
      await page.waitForTimeout(700);
      break;
    }
    if (!clicked) break;
  }

  // Refuse to hand back a "road" measurement while a modal is still up.
  const remaining = page.locator('[role="dialog"]');
  const count = await remaining.count();
  for (let i = 0; i < count; i += 1) {
    if (await remaining.nth(i).isVisible().catch(() => false)) {
      const label = await remaining.nth(i).getAttribute("aria-label");
      throw new Error(
        `[mobile-harness] a modal ("${label ?? "unlabelled"}") is still open — this is the ` +
          `simulator-drive-intro state, not the road. Measure it under that route id instead.`,
      );
    }
  }
}

export function resolveRoutes(ids) {
  if (!ids || ids.length === 0) return ROUTES.filter((r) => r.id !== "simulator-drive").concat(
    ROUTES.filter((r) => r.id === "simulator-drive"),
  );
  return ids.map((id) => {
    const route = ROUTES.find((r) => r.id === id || r.path === id);
    if (!route) {
      throw new Error(
        `[mobile-harness] unknown route "${id}". Known: ${ROUTES.map((r) => r.id).join(", ")}`,
      );
    }
    return route;
  });
}
