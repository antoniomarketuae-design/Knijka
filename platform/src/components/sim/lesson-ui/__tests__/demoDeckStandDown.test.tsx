/**
 * =============================================================================
 * THE DEMONSTRATION MUST NOT NARRATE OVER THE STUDENT'S OWN DRIVE
 * — wave-C corpus, seven rows, three critical, 2026-08-24.
 * =============================================================================
 *
 * `deckCaptionVoice.test.tsx` next door established that the demonstration's
 * caption is read by students (and by trained judges) as a claim about THEIR
 * driving, and fixed the voice so the sentence names whose drive it describes.
 * This is the other half of the same defect and it cannot be fixed with words:
 * the caption should not be on the glass AT ALL once the student is driving.
 *
 * The two frames that filed it, both from the certified corpus, both at speed:
 *
 *   sc-hz-breakdown-pulloff  pc-right 04-t124s — «Спряхме плътно вдясно…» while
 *                            the car does 6 км/ч IN THE RUNNING LANE, playhead
 *                            parked 0:26/0:26.
 *   sc-follow-cutin          pc-right 04-t034s — «Възглавницата е възстановена…»
 *                            over ЗАДАЧА 1/3 at 12 км/ч, scrubber 0:28/0:40.
 *
 * WHY PAUSING THE CLOCK IS NOT THE FIX ON ITS OWN, which is the trap this file
 * exists to nail down: `activeAnnotationIndex` clears a caption `windowSec`
 * after it fires, but only as the playhead MOVES past it. A clock stopped
 * inside that window pins its sentence forever — that is precisely the
 * 0:26/0:26 frame above. So `standDown` gates the RENDER, not just the clock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import type { ScenarioTrace, TraceClock } from "@/modules/sim/traces";
import { DECK_ROOMY_CAPTION_HEIGHT_PX } from "@/modules/sim/hud";
import { TraceTimeline } from "../TraceTimeline";
import {
  DEMO_DECK_MOVING_KMH,
  demoDeckNarrates,
  demoDeckStandsDown,
} from "../demoDeckLifetime";

const CAPTION_BG = "Спряхме плътно вдясно, извън платното за движение.";

/** A trace whose annotation is live at t = 0, so the caption renders. */
function traceWithCaption(): ScenarioTrace {
  return {
    meta: { scenarioId: "sc-hz-breakdown-pulloff", kind: "shadow", version: 1, durationSec: 26 },
    samples: [
      {
        tSec: 0,
        x: 0,
        y: 0,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: 0,
        gear: 1,
        indicator: "off",
        brakeOn: true,
        throttleOn: false,
      },
    ],
    events: [{ tSec: 0, kind: "annotation", textBg: CAPTION_BG }],
  };
}

function render(standDown: boolean, awaitsAudience = false): string {
  const clockRef = createRef<TraceClock>() as React.RefObject<TraceClock>;
  return renderToStaticMarkup(
    <TraceTimeline
      trace={traceWithCaption()}
      clockRef={clockRef}
      compact
      standDown={standDown}
      awaitsAudience={awaitsAudience}
    />,
  );
}

/**
 * The CAPTION BOX only — not the whole deck.
 *
 * The first cut of this test asserted the caption string was absent from the
 * entire markup and went red for a correct reason: each annotation TICK on the
 * scrubber carries its sentence as an aria-label, so a screen-reader user can
 * tell what they are jumping to. That label must survive a stand-down — the
 * transport stays usable, which the test below also asserts. What must go is the
 * sentence PRINTED ON THE GLASS over a moving car, and that lives here.
 */
function captionBoxInner(html: string): string {
  const at = html.indexOf('data-hud="deck-caption"');
  if (at < 0) return "";
  const tagEnd = html.indexOf(">", at);
  let depth = 1;
  let i = tagEnd + 1;
  const start = i;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) return html.slice(start);
    if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen + 4; }
    else { depth -= 1; i = nextClose + 6; }
  }
  return html.slice(start, i - 6);
}

describe("the demonstration's caption stands down when the student drives", () => {
  it("is on the glass on an engaged deck — standing down is not never showing it", () => {
    // The guard rail for the fix: standing the deck down must not be a way of
    // never showing the demonstration at all.
    //
    // ── THE TITLE OF THIS CASE USED TO SAY „while the student has not started"
    // AND THAT IS NO LONGER WHAT IT HOLDS (2026-09-01, sc-ov-keep-right:
    // 6751402d). It never tested that: `awaitsAudience` defaults to false, so
    // what this row proves is that a deck WITH an audience — the Scenario
    // Studio, the dev clip routes, and a lesson deck after ▶ — still captions.
    // A lesson's own deck opens awaiting one; that is the block below, and
    // leaving this title standing would have been a passing test vouching for
    // behaviour the product had stopped having.
    expect(captionBoxInner(render(false))).toContain(CAPTION_BG);
  });

  it("is GONE once the deck has stood down, though the transport remains", () => {
    const html = render(true);
    expect(captionBoxInner(html)).not.toContain(CAPTION_BG);
    // The student may still replay the demonstration deliberately — what stops
    // is the deck talking over their drive unasked, not the deck itself.
    expect(html).toContain('data-hud="deck-caption"');
  });
});

/**
 * =============================================================================
 * …AND THE PANEL GOES WITH THE VOICE — sc-follow-distance:407a976c,
 * sc-follow-brake:62b67c75 (2026-08-24)
 * =============================================================================
 *
 * THE HALF THE STAND-DOWN LEFT. Silencing the caption and stopping the clock
 * still leaves the TRANSPORT — scrub track, four buttons, three speed chips —
 * parked in the lower-left of the play area for the rest of the lesson. On the
 * cockpit view that band is the top of the dashboard and the near carriageway.
 * Judged at x ≈ 278–890, y ≈ 540–645 of a 1440 × 900 shot and visible on every
 * drive frame of `.audit-frames/w10-3/frames/sc-follow-distance__pc-right/`,
 * 01-arrival through 04-t179s, on the drill whose whole subject is the gap to
 * the car in front.
 *
 * The repair is `setOpen(false)` inside the same one-way latch, so the deck
 * collapses to its own «🎬 Демонстрация ▾» button exactly the way the controls
 * legend collapses to «Клавиши · за напреднали ▸» on the same trigger.
 *
 * WHY THIS IS A SOURCE WALK AND NOT A RENDER. `DemoDeck` lives inside
 * `components/sim/LessonScene.tsx`, whose import closure reaches
 * `@react-three/drei`; every test that touches it fails to LOAD in this
 * environment. A walk cannot prove the collapse looks right — but it can prove
 * the latch and the collapse are the same event, which is the thing that was
 * missing, and it goes red the moment somebody moves one without the other.
 */
describe("the deck collapses to its button when it stands down", () => {
  const SCENE = readFileSync(
    path.join(process.cwd(), "src", "components", "sim", "LessonScene.tsx"),
    "utf-8",
  );

  it("the walk is looking at the real latch", () => {
    // The self-check: a moved component or a renamed latch would make the
    // assertion below vacuous rather than false.
    expect(SCENE).toContain("demoDeckStandsDown(sampleRef.current.speedKmh)");
    expect(SCENE).toContain("stoodDownRef.current = true;");
  });

  it("the collapse is inside the latch, not somewhere near it", () => {
    // The latch body: from the poll's guard to the interval's period. Anything
    // outside it is a different event and would come back on the next stop at a
    // junction, which is the failure the one-way rule exists to prevent.
    const from = SCENE.indexOf("if (!demoDeckStandsDown(sampleRef.current.speedKmh)) return;");
    const to = SCENE.indexOf("DEMO_DECK_POLL_MS", from);
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const body = SCENE.slice(from, to);
    expect(body).toContain("setStoodDown(true)");
    expect(body).toContain("setOpen(false)");
    expect(body).toContain("clock.playing = false");
  });

  it("the deck still OPENS by default — standing down is not never showing it", () => {
    // The guard rail, and the same one the caption test above carries: a deck
    // that started collapsed would answer the finding by deleting the feature.
    // `open` is seeded true on any viewport that is not a small phone.
    expect(SCENE).toContain("const [open, setOpen] = useState(");
    expect(SCENE).toContain("window.innerHeight <= 560 || window.innerWidth <= 640");
  });
});

describe("what counts as the student having started", () => {
  it("stands down above the shared threshold and not at or below it", () => {
    expect(demoDeckStandsDown(DEMO_DECK_MOVING_KMH + 0.1)).toBe(true);
    expect(demoDeckStandsDown(DEMO_DECK_MOVING_KMH)).toBe(false);
    expect(demoDeckStandsDown(0)).toBe(false);
  });

  it("reads a car rolling backwards as driving too", () => {
    // Reversing out of a bay is driving. A rule that only looked at the signed
    // number would leave the demonstration narrating through every manoeuvre
    // lesson that starts in reverse.
    expect(demoDeckStandsDown(-(DEMO_DECK_MOVING_KMH + 0.1))).toBe(true);
  });

  it("treats an unreadable speed as NOT driving", () => {
    // The deliberate direction, and the same one its two siblings take: an
    // unreadable number must never be able to take the demonstration off the
    // screen — that would silence it exactly on the lessons whose
    // instrumentation is broken, where the student needs it most.
    expect(demoDeckStandsDown(Number.NaN)).toBe(false);
    expect(demoDeckStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

/**
 * =============================================================================
 * …AND THE VOICE WAITS FOR THE AUDIENCE AT THE OTHER END OF THE SAME LIFETIME
 * — sc-ov-keep-right:6751402d (major), 2026-09-01.
 * =============================================================================
 *
 * `demoDeckAtRest` parked the CLOCK at 0:00 and left the CAPTION printing, and
 * the stand-down block at the top of `demoDeckLifetime.ts` had already written
 * down why those are two facts: „the deck must both stop the clock AND stop
 * rendering the caption; either alone leaves a frame like these." `tSec = 0` is
 * inside the window of every annotation authored at 0, so the parked deck
 * printed the demonstration's first sentence in a solid card over the middle of
 * the windscreen from the lesson's first frame.
 *
 * THE FRAME IS ON THE CURRENT BUILD, not on the one the row was filed against:
 * `.audit-frames/w21/frames/sc-ov-keep-right__pc-right/01-arrival.png` — 0 км/ч,
 * «ЗАДАЧА 1/2» unstarted, transport reading «0:00 / 0:33» with ▶ unpressed, and
 * «Започваш в ЛЯВАТА лента — мястото ти не е тук…» on the carriageway.
 *
 * The rows below hold both directions, because „no caption ever" would answer
 * the finding by deleting the demonstration.
 */
describe("a demonstration nobody has asked for does not caption", () => {
  it("is silent at rest on a deck that awaits its audience", () => {
    expect(captionBoxInner(render(false, true))).not.toContain(CAPTION_BG);
    // …and the transport is untouched, so the way to the demonstration is the
    // control it always was. Deleting the deck is not this fix.
    expect(render(false, true)).toContain('data-hud="deck-caption"');
    // A state-independent transport control — the ▶/⏸ label depends on the
    // clock mirror's seed and would be asserting about the seed, not the deck.
    expect(render(false, true)).toContain('aria-label="Предишна стъпка"');
  });

  it("the caption box keeps its fixed height, so no control moves", () => {
    // `DECK_ROOMY_CAPTION_HEIGHT_PX` is the reason the deck's buttons never
    // shift as captions come and go, and `tools/mobile/deck-captions.mjs`
    // measures the bank against exactly that box. An empty box is still the box.
    expect(render(false, true)).toContain(`${DECK_ROOMY_CAPTION_HEIGHT_PX / 16}rem`);
  });

  it("standing down still wins over an engaged deck", () => {
    // The two halves are one function on purpose (`demoDeckNarrates`): a deck
    // the student engaged before setting off must still go quiet once they are
    // driving, which is the sc-hz-breakdown-pulloff frame this file opens with.
    expect(captionBoxInner(render(true, true))).not.toContain(CAPTION_BG);
    expect(captionBoxInner(render(true, false))).not.toContain(CAPTION_BG);
  });
});

describe("demoDeckNarrates · who is allowed to speak", () => {
  it("needs an audience AND a student who is not driving", () => {
    expect(demoDeckNarrates({ engaged: true, standDown: false })).toBe(true);
    expect(demoDeckNarrates({ engaged: false, standDown: false })).toBe(false);
    expect(demoDeckNarrates({ engaged: true, standDown: true })).toBe(false);
    expect(demoDeckNarrates({ engaged: false, standDown: true })).toBe(false);
  });
});

describe("the LESSON's deck is the mount that awaits an audience", () => {
  // The dead-predicate guard, and the one this programme has paid for most
  // often: a rule nothing calls. Same source walk as the block above, for the
  // same reason — `LessonScene.tsx`'s import closure cannot load here.
  const SCENE = readFileSync(
    path.join(process.cwd(), "src", "components", "sim", "LessonScene.tsx"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("hands `awaitsAudience` to the deck it mounts over the windscreen", () => {
    const from = SCENE.indexOf("<TraceTimeline");
    expect(from).toBeGreaterThan(0);
    const mount = SCENE.slice(from, SCENE.indexOf("/>", from));
    // The self-check first: this is the deck fed by the parked aid clock, and
    // not the Scenario Studio's.
    expect(mount).toContain("standDown={stoodDown}");
    expect(mount).toContain("awaitsAudience");
  });

  it("…and that deck's clock really is the parked one", () => {
    // Without this the prop would be true of a deck whose clock ran from mount,
    // and the caption would simply come back one poll later.
    expect(SCENE).toContain("demoDeckAtRest(createTraceClock())");
    expect(SCENE).toContain("clockRef={aidClockRef}");
  });
});
