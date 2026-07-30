import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ROUTES } from "./lib/routes.mjs";

/**
 * THE CHECK THAT WAS REPORTING A PASS ON A TEST THAT DID NOT RUN.
 *
 * From phase 6 until the 107-row founder review caught it, the `theory` route
 * declared its primary interaction as `first:#main-content article` — and the
 * topic hub has never rendered an <article> in its life. It renders
 * <li><button>. So the fold probe found nothing, measured nothing, and the
 * sweep printed a fold column that was pure shape. Every mobile report between
 * those two dates vouched for a screen it had not looked at.
 *
 * Two things now stop that. `budget.mjs` fails a route unconditionally when a
 * mustFit selector matches zero elements at RUNTIME — that is the real net, and
 * it catches any cause including ones nobody predicted. This file is the second
 * one, and it is cheaper: it runs in the ordinary vitest gate, needs no browser,
 * no dev server and no login, and it fails in the same commit that removes the
 * hook rather than the next time somebody thinks to run a sweep.
 *
 * It deliberately does NOT try to parse CSS selectors against JSX. It checks one
 * thing: for every route, the distinguishing HANDLE its selectors are built on
 * still appears in the component that is supposed to render it. That is the
 * exact failure mode observed — a handle that quietly stopped existing.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "..", "platform", "src");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");

/**
 * route id -> [handle the selectors depend on, the file that must contain it].
 *
 * A handle is added here the moment a route's mustFit or contentSelectors stop
 * being `#main-content` — i.e. exactly when the route starts depending on
 * markup that a styling pass could rename.
 */
const HANDLES = [
  {
    route: "theory",
    handle: "data-topic-card",
    file: "components/theory/TopicDeck.tsx",
    why: "the first topic card — the founder's „only 20% visible to choose the topic\"",
  },
  {
    route: "simulator",
    handle: "<article",
    file: "components/sim/lesson-ui/ScenarioCatalog.tsx",
    why: "the first lesson card in the catalogue",
  },
  {
    route: "theory-practice",
    handle: 'aria-label={`Въпрос ${index + 1} от ${questions.length}`}',
    file: "components/theory/PracticeSession.tsx",
    why: "the question card, which is this route's whole content surface",
  },
];

describe("the mobile harness measures elements that exist", () => {
  for (const { route, handle, file, why } of HANDLES) {
    it(`${route}: ${handle} is still rendered (${why})`, () => {
      expect(read(file)).toContain(handle);
    });
  }

  it("every route's declared handle is still referenced by routes.mjs", () => {
    // The other direction: a handle left in a component after the route stopped
    // using it is dead weight that reads like a contract. Both halves have to
    // move together.
    const spec = readFileSync(join(HERE, "lib", "routes.mjs"), "utf8");
    expect(spec).toContain("[data-topic-card]");
    expect(spec).toContain('section[aria-label^="Въпрос"]');
  });

  it("no route declares a mustFit selector with no way to fail", () => {
    // A route with a content budget and no primary interaction named is a route
    // whose fold nobody is watching. `simulator-drive-intro` is the deliberate
    // exception and says so in its own note: it measures the popup's geometry,
    // and a popup has no primary interaction to fit.
    for (const route of ROUTES) {
      if (route.id === "simulator-drive-intro" || route.id === "simulator-drive") {
        continue;
      }
      expect(
        route.mustFit.length,
        `route "${route.id}" names nothing that has to be on the screen`,
      ).toBeGreaterThan(0);
    }
  });

  it("a route that cannot scroll to its content still gates on the item", () => {
    // `foldMustPass` also demands a document that does not scroll, which is the
    // wrong demand on a sixteen-topic hub — so that route had the whole fold
    // check switched off, and the day its selector rotted, nothing failed.
    // `foldItemsMustFit` is the half that always applies.
    const theory = ROUTES.find((r) => r.id === "theory");
    expect(theory.budget.foldMustPass).toBe(false);
    expect(theory.budget.foldItemsMustFit).toBe(true);
  });
});
