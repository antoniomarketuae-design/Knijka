import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MOBILE FOLD — the practice runner and the exam runner at 393 x 852.
 *
 * WHAT WENT WRONG. Founder review, on his own phone, verbatim: „When I open
 * Theory questions, I have to scroll down to see all the answers from which to
 * choose, and it cant be like that it all have to be on the screen without
 * scrolling." — „The Exams section is absolutely the same thing." He has raised
 * it three times. The audience is 17–18-year-olds in Bulgaria who live on
 * phones, so this is not polish: it taxes the single most repeated action in
 * the product (1 089 practice questions, and a 45-question exam under a
 * 40-minute clock they are scored against).
 *
 * TWO THINGS ABOUT THE PREVIOUS PASS, because both are why there is a third.
 *
 *   It measured in CHROMIUM with an iPhone user agent. That is not an iPhone.
 *   Safe areas, toolbar-driven viewport resizing, scroll containment and `dvh`
 *   resolution are exactly where the two engines disagree. Every number below
 *   is Playwright WEBKIT.
 *
 *   It measured sixteen questions the runner happened to deal it, found seven
 *   stragglers „which overhang by 12–26px", and shipped. The acceptance is the
 *   WORST case, and neither runner lets you choose a question — practice deals
 *   adaptively, the exam deals a seeded paper — so the items that actually
 *   break were never on screen. src/app/dev/fold-rig exists to end that: it
 *   ranks the whole bank by rendered ink and mounts the top of it, one question
 *   at a time, inside the REAL (dashboard) chrome.
 *
 * THE MEASUREMENT (WebKit, 393 x 852, dpr 3, isMobile, hasTouch; the app's own
 * sticky topbar and <main> padding included; 40 questions per runner — the 16
 * heaviest ordinary text items, the 12 heaviest five- and six-option items and
 * the 12 heaviest artwork items; two consecutive runs, identical results).
 *
 *   THE FOLD IS THE TOP OF THE PINNED ACTION BAR, not the viewport edge: an
 *   answer painted under an opaque sticky bar is neither readable nor tappable.
 *
 *   practice   40/40 questions fully above the fold      worst overflow 0px
 *   exam       40/40 questions fully above the fold      worst overflow 0px
 *   practice   document overflow 0px on all 40 — the page does not scroll
 *   exam       document overflow 0px on all 40 — the page does not scroll
 *   tightest margin practice 20px, exam 8px — both on q-krastovishta-063
 *
 *   AND THAT LINE WAS TRUE OF ONE VIEWPORT ONLY, WHICH NOBODY SAID. „exam
 *   40/40" is a portrait iPhone, written as if it were the product. 2026-08-04
 *   re-measured BOTH runners on the whole ladder — see „THE LADDER" below.
 *   Portrait 393x852 holds up exactly as claimed (20/20 both surfaces, tightest
 *   margins 20px practice / 8px exam, both on q-krastovishta-063, re-derived).
 *   The same phone held SIDEWAYS was 0/20 in the exam before this change and is
 *   17/20 after it; the 360x780 Android is 8/20 in the exam against 16/20 in
 *   practice. Neither of those two lines had ever been taken.
 *
 *   HYDRATION IS PART OF THE MEASUREMENT. The artwork budget is a client
 *   effect, so a page whose dev chunk timed out renders from the server and
 *   hands back plausible, wrong geometry. That happened, for a whole sweep.
 *   The rig now sets `data-hydrated` from an effect and the script refuses to
 *   measure a page without it.
 *
 *   The worst ORDINARY TEXT question in the bank is q-krastovishta-062 at 637
 *   rendered characters, ahead of q-vehicle-032 at 601 — re-derived from
 *   content/questions/*.json on 2026-08-04, because this line used to name
 *   q-vehicle-032 and the bank has been edited since. Then q-vehicle-061 (598),
 *   q-eco-062 (584), q-predimstvo-042 (571, the longest question TEXT in the
 *   bank at 284 chars) and a 569-tie between q-predimstvo-056 and
 *   q-vehicle-062. The pool they are ranked inside is the 1 008 items that
 *   carry no artwork; the tie is why the rig's `text#5` and a raw-JSON ranking
 *   can name different questions and both be right.
 *
 *   The SIX-OPTION items are exactly two of the 1 089: q-vehicle-063 and
 *   q-vehicle-005 (histogram, re-derived: 1 013 four-option, 74 five, 2 six).
 *   A random deal reaches one of them 2 times in 1 089, so both are pinned into
 *   every sweep BY ID, twice — once plain and once with the exam's
 *   under-five-minutes banner up.
 *
 *   The worst ARTWORK question, q-krastovishta-029 (a top-down scene under the
 *   longest question text in the bank), lands at 755 / 767 — with the artwork
 *   budget having given the answers 100+ px back on its own.
 *
 *   The same sweep at 393x745 — the height a real iPhone 16 has with Safari's
 *   toolbars up — is NOT clean: the heaviest text items overhang by 4–14px and
 *   the heaviest scene items by more. That is reported rather than hidden. The
 *   brief's acceptance is 852; 745 is the next thing to buy, and the two levers
 *   left are <main>'s 24px top padding (owned by the dashboard layout) and the
 *   ~40px app topbar, neither of which is this lane's to move.
 *
 *   AND EVERY NUMBER IN THIS FILE ASSUMES A PHONE WITH NO CAMERA HOUSING. The
 *   app ships `viewportFit: "cover"` (app/layout.tsx) and globals.css pays the
 *   inset back on <body>: `padding-left/right/bottom: env(safe-area-inset-*)`.
 *   Playwright's WebKit is the DESKTOP port — env() resolves to 0 there — and
 *   devices.mjs says so in its own header while every sweep built on it has
 *   quietly measured 852x393 with zero insets. An iPhone 16 held sideways has
 *   59px of inset on EACH side and 21px at the bottom; portrait has 34px at the
 *   bottom.
 *
 *   Measured 2026-08-05 by injecting each profile's real insets where env()
 *   would have put them (20 cases x 2 surfaces x 2 iPhone profiles): not one
 *   answer option goes under the fold — the layout survives losing 118px of
 *   width — but BOTH runners scroll the document by EXACTLY the bottom inset,
 *   21px in landscape and 34px in portrait, on all 80 cases. That is a
 *   `min-h-dvh` root inside a body with `padding-bottom: env(...)`: the
 *   document is always taller than the viewport by the inset, on every page of
 *   the app, and it is why „it all have to be on the screen without scrolling"
 *   can still be false on the founder's own phone with every card fitting. The
 *   fix is one `calc()` in the dashboard layout's root height, which is not
 *   this lane's file.
 *
 * THE PHONE HELD SIDEWAYS — 852 x 393, re-measured, and NOT clean either.
 *
 *   Every `max-sm:` above is a WIDTH test, and a landscape iPhone is 852px wide,
 *   so it was being served the DESKTOP layout into 393px of height. Founder
 *   review row C5: 479px of scroll, options overflowing by 334px, not one answer
 *   on the screen. Four separate places read „wide" as „roomy" and all four are
 *   fixed: the page's header swap, the card's own paddings and option list, the
 *   app topbar's height, and — one level down — <QuestionArtwork>, whose height
 *   budget switched itself OFF at `(min-width: 640px)` and so drew the full
 *   150px cap on the shortest screen the product has.
 *
 *   Where that leaves it (fold rig, WebKit, 852x393, fold = top of the pinned
 *   bar). An ordinary dealt question: 0px of scroll, every option and „Провери"
 *   on screen. The eighteen HEAVIEST items in the bank: six are clean, twelve
 *   need 22–104px of document scroll and on six of those an option sits 4–79px
 *   under the action bar. Worst: q-krastovishta-029 (the longest question text
 *   in the bank under a scene still) at 79px, and q-vehicle-063 (six options) at
 *   67px.
 *
 *   That residual is a real limit, not an oversight. 393px of height minus a
 *   48px app topbar leaves 345px for a 284-character question, six answers and a
 *   44px action bar, and the only things left to trade are the 18px question and
 *   the 14px answers — the two things this file exists to say were not traded.
 *   The next lever, measured, is the app topbar: hiding it on the runner in
 *   landscape returns 48px and would clear nine of the twelve. It also removes
 *   the only navigation on the screen, so it is a product decision, not a
 *   layout one.
 *
 * THE LADDER — 2026-08-04, and the number nobody had ever taken.
 *
 *   Everything above measures the PRACTICE runner, and every claim about the
 *   exam in this file was inferred from it. The founder's own sentence was „The
 *   Exams section is absolutely the same thing"; it was not the same thing, it
 *   was worse, and the reason is one line of arithmetic: every `max-sm:` in
 *   ExamRunner is a WIDTH test and a landscape iPhone is 852px WIDE. It was
 *   served the desktop exam into 393px of height — the meta row in place, the
 *   2xl clock in place, the 45-button navigator in FLOW below the card, and the
 *   action bar not pinned at all.
 *
 *   RE-DERIVED 2026-08-04, ONE INSTRUMENT, BOTH SURFACES, SAME DAY, and every
 *   column below taken against the same file hashes (the sweep fingerprints the
 *   eight files that decide this geometry before its first navigation and after
 *   its last, and refuses a run whose hashes moved — an earlier attempt at this
 *   table measured two of its columns against a different revision of
 *   autoHideTopbar.ts and nothing in the output said so).
 *
 *   Fold rig, WebKit, both runners, four profiles, the 18 heaviest questions of
 *   the bank plus the two six-option items again with the under-five-minutes
 *   banner up: 20 cases per surface per profile, 160 in all. Fold = the top of
 *   the pinned action bar; a case is clean only if every option, every control
 *   and the document itself are inside it.
 *
 *     surface   profile                exam before      after
 *     practice  iPhone 393x852               —          20/20
 *     practice  iPhone 852x393               —          20/20
 *     practice  Android 360x780              —          16/20
 *     practice  Android 780x360              —          15/20
 *     exam      iPhone 393x852               —          20/20
 *     exam      iPhone 852x393        >>>  0/20 <<<     17/20
 *     exam      Android 360x780              —           8/20
 *     exam      Android 780x360              —           9/20
 *
 *     pooled    portrait (40 per surface)   practice 36/40   exam 28/40
 *     pooled    landscape (40 per surface)  practice 35/40   exam 26/40
 *
 *   AND THAT TABLE IS SUPERSEDED — 2026-08-05, same rig, same 20 cases, same
 *   four profiles, ONE tree. Two things landed on top of it: another lane's
 *   `narrow-tall:` question clamp (practice and exam both), and this file's
 *   „the exam header card is desktop only" row. Every column below was taken
 *   against one set of file hashes, and the exam's control column is this tree
 *   with ONLY ExamRunner.tsx reverted — because the two changes overlapped in
 *   time and a straight before/after would have credited one lane's pixels to
 *   the other.
 *
 *     surface   profile              exam CONTROL   exam NOW   practice NOW
 *     exam      iPhone  393x852         20/20        20/20        20/20
 *     exam      iPhone  852x393         18/20        20/20        20/20
 *     exam      Android 360x780         19/20        20/20        20/20
 *     exam      Android 780x360         11/20        20/20        20/20
 *
 *   PARITY, which is the acceptance this row was set: the exam fits no worse
 *   than practice on any device in the ladder. 80 exam cases, 80 practice
 *   cases, nothing hidden, nothing scrolling.
 *
 *   COUNTERS AND CLOCKS, COUNTED IN THE RENDERED PAGE rather than argued from
 *   the source: the sweep collects every element in the content region whose
 *   own text reads like „Въпрос N", „N/M", „отг. N" or m:ss. The exam drew
 *   THREE counters on every phone profile (two in its header card, one in the
 *   bar, two of them the same number) and ONE clock. It now draws exactly one
 *   counter and one clock, and the clock is 18px inside the pinned bar on all
 *   four profiles — measured, not asserted.
 *
 *   THE INSTRUMENT WAS DEALING A ONE-QUESTION PAPER. `/dev/fold-rig` mounted
 *   `questions={[q]}` in exam mode, so every exam number ever taken here was
 *   measured against a counter reading „Въпрос 1/1" and a jump table with a
 *   single cell — on the surface whose defining fact is that it is 45 questions
 *   long. It deals 45 now and PUBLISHES what it dealt (`data-fold-rig-mode`,
 *   `data-fold-rig-paper`), and the sweep refuses any row whose mounted surface
 *   or paper size is not what it asked for. It also refuses a row that never
 *   settled, one with an undecoded image, and one whose fonts had not loaded —
 *   the last of those caught a dev-server render worker crashing mid-run and
 *   serving a 500 for a sign face, which the old probe would have recorded as
 *   geometry.
 *
 *   THE EXAM IN LANDSCAPE, THE ONE NUMBER THE ROW TURNS ON. The before column
 *   is a CONTROL, not a memory: the same tree, the same rig, the same 20
 *   questions, with only ExamRunner.tsx reverted to its pre-change state. 0 of
 *   20 had every option on screen; the action bar was not pinned on a single
 *   one; the 45-button navigator was in flow on all 20; 53 of those questions'
 *   92 answer options were not fully visible — a candidate holding the phone
 *   sideways could see roughly two answers in five. Worst option 228px past the
 *   bottom edge, document scroll up to 490px.
 *
 *   An earlier note here said 276px / 538px. That was measured before
 *   dashboard/autoHideTopbar.ts landed, and that file reclaims 48px on exactly
 *   this viewport — so it was never a control for this change. 228 / 490 is,
 *   and the 48px is the entire difference between the two figures.
 *
 *   WHAT IS LEFT, stated rather than rounded away. Three exam cases at 852x393
 *   — q-vehicle-058 by 25px, q-ptp-062 by 5px, q-vehicle-063 with the banner up
 *   by 15px — and eleven at 780x360. The practice runner is CLEAN on all three
 *   of the 852x393 cases (its worst margin there is -10px, on q-vehicle-058),
 *   which is what identifies the cost: the exam's own header card, a row whose
 *   question counter and countdown the pinned bar below already carries.
 *   Folding it away in landscape is the next lever and a bigger edit than this
 *   one. On the 360x780 Android that header WRAPS to two rows — photographed —
 *   and the exam falls to 8/20 where practice holds 16/20; portrait on that
 *   phone is partly a SHARED limit (`short:`, max-height 520px, deliberately
 *   does not reach a 780px-tall screen) and partly the exam's own.
 *
 *   THE QUESTION CLAMP IS NOT DEAD CODE AND IT IS NOT LOAD-BEARING EITHER, and
 *   both halves of that are measured: across the 160 cases `useQuestionBudget`
 *   binds on 11, seven of them in the exam, ALL of them at 780x360 (worst:
 *   q-predimstvo-042 and q-krastovishta-029 park 74px of question text inside
 *   the box). On both iPhone profiles it never binds. That is the intended
 *   outcome — it is the last thing that gives, so a viewport where it never
 *   engages is a viewport where nothing had to be traded.
 *
 *   AND THE INSTRUMENT HAD TO BE FIXED THREE TIMES BEFORE ANY OF THIS WAS TRUE.
 *   (1) The old sweep found the pinned bar via `#main-content .btn-accent`'s
 *   parent — that is „Провери". The exam's bar has no accent button in it, so
 *   that selector measures the exam against the viewport EDGE and reports it
 *   clean while an option sits under the strip. It now finds any sticky/fixed
 *   element pinned to the bottom and records which one it picked. (2) A fixed
 *   700ms settle samples a layout that is still shrinking: both budgets
 *   converge over a rAF chain, and on a loaded box the PRACTICE runner — whose
 *   geometry did not change — measured 47px apart between two passes. It now
 *   takes three identical consecutive samples. (3) A retry that reused the same
 *   Playwright page was not a retry: under memory pressure a WebKit page stops
 *   navigating and never recovers, and the browser itself can be killed by
 *   another lane's cleanup. Page, context AND browser are rebuilt between
 *   attempts; before that, one wedged page cost three device columns.
 *
 * WHERE THE PIXELS CAME FROM, in order of size. None of them came from text.
 *
 *   1. THE OPTION ROW WAS 19 % FURNITURE, HORIZONTALLY. Every previous pass
 *      traded vertical padding and ran out of room. At 393px the card column is
 *      337px and a practice option spent 64 of them before a single character:
 *      px-4 (32) + the tick box (16) + two gap-3 (24) + an ordinal badge (24).
 *      A narrower text column is more wrapped lines, and each line costs 23px
 *      four times over. Below `sm` the badge is gone and the paddings tighten:
 *      the answer column goes 233px -> 285px, +22 %. The badge labels the 1–9
 *      keyboard shortcuts and the line explaining those is itself `md:block`,
 *      so on a phone it was labelling nothing; it returns from `sm` up.
 *
 *   2. THE PRACTICE PROGRESS STRIP MOVED INTO THE ACTION BAR (38px). The bar
 *      was already pinned there for „Провери" and was two thirds empty. This is
 *      the Gran Turismo lesson in the founder's reference image: the readouts
 *      live hard against an edge, the middle of the screen is the thing you are
 *      doing. The counters ended up MORE visible than before — they no longer
 *      scroll away — and the session progress became a 2px rule along the bar's
 *      lit top edge.
 *
 *   3. THE EXAM NAVIGATOR BECAME A SHEET (~300px of document). 45 buttons in a
 *      9-column grid plus a legend hung below the question card; on an 852px
 *      screen that alone guaranteed the page scrolled, which pins the action bar
 *      over the last answer. It is a jump table, not part of answering, so on a
 *      phone it opens from the bar. Both surfaces render the SAME NavigatorGrid.
 *
 *   4. THE QUESTION CARD'S META ROW FOLDED INTO THE EXAM TOP BAR (42px). The
 *      weight and the multi-answer warning are two pills that fit up there; the
 *      flag — used a handful of times in 45 questions — became a 44px icon in
 *      the action bar, where it is reachable at every scroll position.
 *
 *   5. `max-sm:-mb-6` cancels <main>'s 24px bottom padding on both runners.
 *      That padding is breathing room under a page you scroll; under a pinned
 *      action bar all it did was make the document taller than the viewport,
 *      which is enough on its own to pin the bar over the last answer.
 *
 *   6. Line spacing on the ANSWER text went from 1.625 to 1.45 below `sm`
 *      (~1.4px per line back on 14px glyphs), and the question's from 1.625 to
 *      leading-snug. The GLYPHS did not move: `text-sm` answers and a `text-lg`
 *      question, the same sizes a desktop gets.
 *
 * THE ARTWORK POLICY IS REVERSED, DELIBERATELY. The previous pass wrote that
 * „the sign IS the question, so a smaller one is a harder question" and shrank
 * only the decorative frame. That is right about legibility and wrong about the
 * trade: an uncapped scene still is 237px in a 329px column — 28 % of an iPhone
 * 16 — and it pushed the answers of every scene question off the screen. The
 * brief settles it: „a thumbnail that expands on tap is legitimate; making the
 * student scroll is not."
 *
 * So below `sm` the artwork is drawn to a MEASURED budget (useArtworkBudget:
 * the picture gives back exactly the pixels the card is over by, floor 44px)
 * and the whole block opens FULL SCREEN on tap. A student who wants to study
 * the sign gets 361px of it — more than three times the 112px the inline block
 * ever showed — and a student who already knows it never loses the answers. On
 * the three items whose question text is a screenful on its own the budget hits
 * the floor and the block becomes a 44px „Виж схемата ⤢" strip; that is the
 * honest outcome there, because the alternative is not a bigger picture, it is
 * a scroll. From `sm` up nothing changed: same component, same sizes.
 *
 * WHAT WAS DELIBERATELY NOT TRADED
 *
 *   Text size. `text-sm` answers, `text-lg` question, on the phone exactly as
 *   on the desktop. Guarded below.
 *
 *   Touch targets. Option rows carry `min-h-11` — 44px stated directly instead
 *   of inferred from padding, which is the property that actually matters and
 *   the one the obvious „one more row would fit" edit breaks. The phone-only
 *   exam controls (flag, navigator) are 44px too.
 *
 *   The tick box. components/ui/CheckControl is untouched; its 3.51–3.65 : 1
 *   contrast and its forced-colors repaint (checkControl.test.ts) still stand.
 *
 * WHAT THIS FILE GUARDS, since it cannot run a browser:
 *
 *   1. the two action bars are still STICKY below `sm`, and still opaque — a
 *      transparent one lets option text render through the control on top of it;
 *   2. the exam countdown is still inside the sticky bar, and a clock is
 *      rendered at BOTH breakpoints;
 *   3. option rows keep the 44px thumb guarantee;
 *   4. body text sizes are unchanged, and no phone-only shrink was smuggled in;
 *   5. the practice route still ships the compact phone header AND the full band
 *      from `sm` up, each with its own single <h1>;
 *   6. the artwork goes through <QuestionArtwork> on a measured budget — never a
 *      hard-coded phone size — and the full-screen viewer exists;
 *   7. the reclaimed chrome stays reclaimed: the ordinal badge, the practice
 *      progress block, the exam meta row and the exam navigator are all `sm`-up
 *      only, and each has its phone counterpart;
 *   8. Tailwind's SCANNER can still see every one of these classes. It reads raw
 *      source TEXT, so a class split across two concatenated literals produces
 *      no CSS rule at all — silently, with typecheck and lint green and only the
 *      pixels different.
 */

const SRC = resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

const PRACTICE = read("components/theory/PracticeSession.tsx");
const EXAM = read("components/exam/ExamRunner.tsx");
const MEDIA = read("components/theory/QuestionMedia.tsx");
const QUESTION_BUDGET = read("components/theory/questionBudget.ts");
const PRACTICE_PAGE = read("app/(dashboard)/theory/practice/page.tsx");
const DASHBOARD_LAYOUT = read("app/(dashboard)/layout.tsx");
const FOLD_RIG = read("app/dev/fold-rig/fold-rig-client.tsx");

/** The one className string that carries a given utility. */
function classListWith(source: string, needle: string): string {
  for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`)/g)) {
    const value = m[1] ?? m[2] ?? "";
    if (value.includes(needle)) return value;
  }
  return "";
}

describe("sticky action bars (the founder's scroll-per-answer)", () => {
  it("practice pins „Провери“ / „Напред“ to the phone viewport", () => {
    const bar = classListWith(PRACTICE, "max-sm:sticky");
    expect(bar).not.toBe("");
    expect(bar).toContain("max-sm:bottom-0");
    // Painted over the card while pinned, so it must be opaque and edged.
    expect(bar).toMatch(/max-sm:bg-surface(\/\d+)?/);
    expect(bar).toContain("max-sm:border-t");
    // Above the option rows in paint order, or taps land on the option.
    expect(bar).toMatch(/max-sm:z-\d+/);
    // iPhone home indicator.
    expect(bar).toContain("env(safe-area-inset-bottom)");
    // Desktop keeps the plain in-flow row — no unconditional `sticky`.
    expect(bar).not.toMatch(/(^|\s)sticky(\s|$)/);
    // The negative margins have to match the card's phone padding, or the bar
    // stops reaching the card's edges and grows a seam. That padding is now
    // `p-3 px-4` on a phone — the card went full bleed, so the horizontal half
    // is 16px and the vertical half is still 12px.
    expect(bar).toContain("max-sm:-mx-4");
    expect(bar).toContain("max-sm:-mb-3");
    // And it sits at the BOTTOM of a card that now reaches the bottom of the
    // screen: `mt-auto` in a flex column is what puts „Провери" in the thumb
    // zone instead of halfway up the phone.
    expect(bar).toContain("max-sm:mt-auto");
  });

  it("pins the same bar on a phone held SIDEWAYS", () => {
    // 852 x 393 is not a desktop. Every `max-sm:` above is a WIDTH test and
    // matches nothing in landscape, which is how the runner ended up serving
    // its desktop layout into 393px of height: 520px of scroll and not one
    // answer option on the screen (measured, WebKit).
    const bar = classListWith(PRACTICE, "short:sticky");
    expect(bar).not.toBe("");
    for (const utility of [
      "short:bottom-0",
      "short:-mx-4",
      "short:-mb-3",
      "short:mt-auto",
      "short:border-t",
      "short:bg-surface/95",
      "env(safe-area-inset-bottom)",
    ]) {
      expect(bar).toContain(utility);
    }
  });

  it("pins the EXAM bar on a phone held sideways too", () => {
    // THE ROW THIS FILE OPENS WITH SAYS „The Exams section is absolutely the
    // same thing", AND IT WAS WORSE. Every `max-sm:` in ExamRunner is a WIDTH
    // test, so an iPhone 16 in landscape (852 x 393) was served the desktop
    // exam into 393px of height: the bar was not pinned at all, the 45-button
    // navigator was in flow below the card and the meta row was still there.
    // The CONTROL, on this tree with only ExamRunner.tsx reverted (fold rig,
    // WebKit, 852x393, the 20 heaviest questions): 0 of 20 had every option on
    // screen, the bar was pinned on none of them, the navigator was in flow on
    // all 20, and 53 of those questions' 92 answer options were not fully
    // visible. Worst option 228px past the bottom edge, document scroll 490px.
    // After: 17 of 20. See „THE LADDER" at the top of this file for the rest.
    const bar = classListWith(EXAM, "short:sticky");
    expect(bar).not.toBe("");
    for (const utility of [
      "short:bottom-0",
      // `-mx-4`, not `-mx-3`: the exam card went full bleed on phones (the
      // move practice made and this one had not), so its phone padding is 16px
      // and the bar's negative margin has to be the same number or the strip
      // stops reaching the card's edges. `rounded-b-none` for the same reason
      // the card lost its radius there.
      "short:-mx-4",
      "short:-mb-3",
      "short:rounded-b-none",
      "short:bg-surface/95",
      "env(safe-area-inset-bottom)",
    ]) {
      expect(bar).toContain(utility);
    }
    // The navigator is a sheet in landscape as well — 45 buttons in flow below
    // the card is ~300px of document on a 393px screen.
    expect(EXAM).toContain('className="card hidden h-fit p-4 wide-tall:block"');
    // …and the control that opens it, and the flag, and the clock come back.
    //
    // THESE THREE USED TO BE SPELLED `short:… sm:hidden`, i.e. „off on a
    // desktop, on when the viewport is short" — two variants racing on emission
    // order to decide a DISPLAY TOGGLE, which globals.css says in its own words
    // must never be left to that. They are now the single query
    // `wide-tall:hidden`: (min-width: 640px) and (min-height: 521px). That is
    // the exact complement of the header card's `wide-tall:flex`, so the header
    // and the phone strip cannot both be on, and cannot both be off, at any
    // viewport — which is what „the counter and the clock have ONE home" has to
    // mean to be true rather than intended.
    expect(EXAM).toMatch(/inline-flex h-11 w-11[^`]*wide-tall:hidden/);
    expect(EXAM).toMatch(/inline-flex h-11 items-center[^"]*wide-tall:hidden/);
    expect(EXAM).toMatch(/text-lg font-black tabular-nums wide-tall:hidden \$\{[\s\S]*?timeLow/);
  });

  it("exam pins its paper navigation to the phone viewport", () => {
    const bar = classListWith(EXAM, "max-sm:sticky");
    expect(bar).not.toBe("");
    expect(bar).toContain("max-sm:bottom-0");
    expect(bar).toMatch(/max-sm:bg-surface(\/\d+)?/);
    expect(bar).toMatch(/max-sm:z-\d+/);
    expect(bar).toContain("env(safe-area-inset-bottom)");
    expect(bar).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(bar).toContain("max-sm:-mx-4");
    expect(bar).toContain("max-sm:-mb-3");
    // The card it is pinned inside reaches both screen edges on a phone, so
    // this must too — and the pair has to agree, which is why both numbers are
    // read off the same class string here rather than assumed.
    expect(classListWith(EXAM, "card flex flex-col gap-2 p-3")).toContain("max-sm:-mx-4");
    expect(classListWith(EXAM, "card flex flex-col gap-2 p-3")).toContain("max-sm:px-4");
  });

  it("both runners cancel <main>'s bottom padding on phones", () => {
    // 24px of padding under a pinned bar is 24px of document past the
    // viewport, and the moment the document scrolls the bar covers an answer.
    for (const source of [PRACTICE, EXAM]) {
      expect(source).toContain("max-sm:-mb-6");
    }
  });
});

describe("the exam countdown stays visible", () => {
  it("draws the clock exactly twice, in two surfaces that cannot both be on", () => {
    const clocks = [...EXAM.matchAll(/formatClock\(remainingSec\)/g)];
    expect(clocks).toHaveLength(2);
    // ONE MEDIA QUERY DECIDES BOTH, AND IT IS THE SAME ONE. The desktop copy
    // is inside the header card (`hidden … wide-tall:flex`) and carries no
    // visibility class of its own; the phone copy is `wide-tall:hidden` inside
    // the pinned bar. (min-width:640px and min-height:521px) and its negation
    // partition every viewport, so exactly one clock is in the tree at any
    // size — measured, WebKit, all four profiles of the ladder: 1 visible
    // clock on every one of the 80 exam cases, and 1 on the desktop widths
    // this file's fold sweep does not walk.
    expect(EXAM).toMatch(/text-2xl font-black tabular-nums`?\s*\$?\{?[\s\S]{0,80}timeLow/);
    expect(EXAM).toMatch(/text-lg font-black tabular-nums wide-tall:hidden \$\{[\s\S]*?timeLow/);
    // Neither copy may be shrunk on the small screen: this is a 40-minute
    // scored paper and the countdown is the one number a candidate checks
    // constantly. 18px in the bar, 24px on the desktop card, both `font-black`.
    expect(EXAM).not.toMatch(/formatClock[\s\S]{0,200}text-(xs|sm|base)/);
  });

  it("puts the phone clock INSIDE the sticky bar", () => {
    const barStart = EXAM.indexOf("max-sm:sticky");
    expect(barStart).toBeGreaterThan(-1);
    const phoneClock = EXAM.lastIndexOf("formatClock(remainingSec)");
    expect(phoneClock).toBeGreaterThan(barStart);
    // …and it is tagged, because „the clock is in the bar" is a claim a source
    // scan can only approximate. `data-exam-clock` is what the fold sweep
    // counts and measures in the rendered page (font size, colour, which
    // element contains it) — the same reason `data-question-box` exists.
    expect([...EXAM.matchAll(/data-exam-clock/g)]).toHaveLength(2);
  });

  it("keeps the screen-reader countdown OUT of a surface that can vanish", () => {
    // The aria-live region used to sit inside the header card. That card is
    // now desktop-only, and `display:none` takes a live region out of the
    // accessibility tree — a phone would have stopped announcing „Оставащо
    // време: 5 минути" and no layout measurement could have seen it. It is at
    // the component root, before either surface.
    const live = EXAM.indexOf('aria-live="polite"');
    expect(live).toBeGreaterThan(-1);
    expect(live).toBeLessThan(EXAM.indexOf("<header"));
  });
});

describe("what must not be traded for pixels", () => {
  it("option rows keep a thumb-sized target on phones", () => {
    // `min-h-11` is 44px stated directly. It replaced „py-3 must survive",
    // which only ever implied the number and broke the moment padding moved.
    const practiceRow = classListWith(PRACTICE, "min-h-11 items-start");
    expect(practiceRow).toContain("min-h-11");
    expect(practiceRow).toContain("sm:py-3.5");

    const examRow = classListWith(EXAM, "min-h-11 cursor-pointer");
    expect(examRow).toContain("min-h-11");
    expect(examRow).toContain("sm:p-3.5");

    // The phone-only exam controls in the action bar are 44px as well.
    expect(EXAM).toContain("h-11 w-11"); // flag
    expect(classListWith(EXAM, "GridIcon") || EXAM).toContain("h-11"); // navigator opener
  });

  it("keeps the reading sizes a seventeen-year-old was given", () => {
    // The question.
    expect(PRACTICE).toContain('className="max-w-[62ch] text-lg font-bold');
    expect(EXAM).toMatch(/<legend className="mb-1 text-lg font-bold/);
    // The answers: `text-sm` on the row, never a phone-only shrink.
    expect(classListWith(PRACTICE, "min-h-11 items-start")).toContain("text-sm");
    expect(EXAM).toMatch(/text-sm leading-\[1\.45\] sm:leading-relaxed/);
    // Sign-identification tiles answer with a PICTURE; the face keeps the size
    // it has always had on a phone (h-20 = 80px, 240 device px at dpr 3).
    expect(PRACTICE).toContain('className="h-20 w-20 sm:h-24 sm:w-24"');
    for (const source of [PRACTICE, EXAM]) {
      expect(source).not.toMatch(/max-sm:text-(xs|\[1[0-3]px\])/);
    }
  });

  it("draws the artwork to a MEASURED budget, never a hard-coded phone size", () => {
    for (const source of [PRACTICE, EXAM]) {
      // One artwork component, fed by the budget hook — a literal would be
      // wrong on both sides: too big for the three worst items, needlessly
      // small for the other twenty-five.
      expect(source).toContain("useArtworkBudget");
      expect(source).toMatch(/<QuestionArtwork media=\{[^}]+\} heightPx=\{artworkPx\}/);
      expect(source).not.toMatch(/<QuestionArtwork[^>]*heightPx=\{\d+\}/);
    }
    // The trade the cap is only acceptable because of: one tap, full screen.
    expect(MEDIA).toContain('role="dialog"');
    expect(MEDIA).toContain("ARTWORK_MIN_PX");
    // The budget must measure the DOCUMENT, not just the card: a card that
    // fits can still leave the page scrolling by the padding under it.
    expect(MEDIA).toContain("scrollHeight");
    // ...and against the VISUAL viewport, because a real iPhone's toolbars own
    // 80–110px that innerHeight still counts.
    expect(MEDIA).toContain("visualViewport");
    // Re-measure on layout change: a scene still swaps a placeholder for a
    // canvas plus a caption when its district json lands.
    expect(MEDIA).toContain("ResizeObserver");
  });
});

describe("the reclaimed chrome stays reclaimed", () => {
  it("the practice ordinal badge is a keyboard affordance, `sm` and up", () => {
    // It labels the 1–9 shortcuts; the line that explains them is md:block.
    const badge = classListWith(PRACTICE, "mt-0.5 hidden h-6 w-6");
    expect(badge).toContain("sm:flex");
    // …and OFF on a landscape phone, which is wide enough to trip `sm` and has
    // no keyboard either. It is 24px of horizontal furniture in the orientation
    // where the option list runs two columns wide.
    expect(badge).toContain("short:hidden");
    expect(PRACTICE).toContain("Клавиши 1–");
  });

  it("the practice progress strip lives in the action bar on phones", () => {
    // The block above the question is `sm`-up only, and `short:hidden` sends it
    // back into the bar on a landscape phone, which `sm:` alone reads as a
    // desktop.
    expect(PRACTICE).toContain(
      'className="hidden flex-col gap-1 short:hidden sm:flex sm:gap-2.5"',
    );
    // ...and exactly two progressbars exist, one per breakpoint, so only one
    // is ever in the accessibility tree.
    const bars = [...PRACTICE.matchAll(/role="progressbar"/g)];
    expect(bars).toHaveLength(2);
    // The phone one is the 2px rule on the action bar's top edge.
    expect(PRACTICE).toMatch(/absolute inset-x-0 top-0 h-\[2px\][^"]*sm:hidden/);
    // The phone readouts (question number, streak, quota, weight) went with it.
    const barIdx = PRACTICE.indexOf("max-sm:sticky");
    expect(PRACTICE.indexOf("sm:hidden", barIdx)).toBeGreaterThan(barIdx);
  });

  it("the exam header card is DESKTOP ONLY — the bar owns the counter and the clock", () => {
    // THE ROW THIS BLOCK EXISTS FOR. The exam drew its own header card at every
    // viewport: „Въпрос N от 45", „Отговорени: X/45", the weight, the multi
    // pill, a countdown and „Предай". The pinned bar below it was already
    // drawing a counter („X/45", the ANSWERED count) and the only clock a
    // phone ever saw. Measured with the fold sweep's own reader, which counts
    // every element in the content region whose text reads like a counter or a
    // clock: THREE visible counters on every phone profile, two of them in
    // this card and two of them the same number.
    //
    // The card is now one media query away from existing at all, and the strip
    // in the bar is its exact complement.
    expect(EXAM).toContain('className="card hidden flex-wrap items-center');
    expect(classListWith(EXAM, "card hidden flex-wrap")).toContain("wide-tall:flex");
    // The in-card meta row goes with it, by the same single query.
    expect(EXAM).toContain('className="hidden flex-wrap items-center gap-2 wide-tall:flex"');
    // ...and the two pills it used to carry on phones are chips at the head of
    // the question text, where they cost no row: inside the question box, so
    // they are the first thing in the scroller rather than a block above it.
    expect(EXAM).toMatch(/\{q\.points\} т\.\s*\n?\s*<\/span>/);
    expect(EXAM).toContain("Всички верни");
    const boxAt = EXAM.indexOf("data-question-box");
    expect(EXAM.indexOf("{q.points} т.")).toBeGreaterThan(boxAt);
    expect(EXAM.indexOf("{q.points} т.")).toBeLessThan(EXAM.indexOf("{q.textBg}"));
    // ...and the flag button exists twice: spelled out on desktop, a 44px icon
    // inside the sticky bar on a phone.
    const flags = [...EXAM.matchAll(/toggleFlag\(q\.id\)/g)];
    expect(flags).toHaveLength(2);
    expect(EXAM.lastIndexOf("toggleFlag(q.id)")).toBeGreaterThan(
      EXAM.indexOf("max-sm:sticky"),
    );
  });

  it("the paper counter has ONE home on a phone, and it counts the position", () => {
    // The navigator button used to read `{answeredCount}/{questions.length}`
    // while the header two rows up read „Въпрос {idx+1} от {questions.length}".
    // A fraction beside a jump-table icon reads as a position; it was the
    // answered count. Now it IS the position, the answered count moved into
    // the sheet those cells already colour in, and the label says both.
    expect(EXAM).toMatch(/<GridIcon \/>\s*\n\s*\{idx \+ 1\}\/\{questions\.length\}/);
    expect(EXAM).toMatch(/aria-label=\{`Въпрос \$\{idx \+ 1\} от \$\{questions\.length\}, отговорени/);
    expect([...EXAM.matchAll(/data-exam-counter/g)]).toHaveLength(3); // 2 desktop, 1 bar
  });

  it("the exam navigator is a sheet on phones, and the sheet is where a phone submits", () => {
    // ~300px of document below the question card is what made the exam page
    // scroll no matter how tight the card got.
    expect(EXAM).toContain('className="card hidden h-fit p-4 wide-tall:block"');
    expect(EXAM).toContain("setNavOpen");
    // ONE definition of the grid, mounted twice — two copies is how the panel
    // and the sheet drift apart.
    expect([...EXAM.matchAll(/function NavigatorGrid\b/g)]).toHaveLength(1);
    expect([...EXAM.matchAll(/<NavigatorGrid\b/g)]).toHaveLength(2);
    expect([...EXAM.matchAll(/function NavigatorLegend\b/g)]).toHaveLength(1);
    // THE PHONE'S WAY TO HAND THE PAPER IN. „Предай" left the header card with
    // the rest of it; on a phone it is the accent action in this sheet, under
    // the cells that show what is still blank. Two things make that safe rather
    // than clever: the confirmation dialog still fires (and still counts the
    // blanks), and the sheet closes first so there is never a modal under a
    // modal. The exam also still auto-submits at 0:00, so a candidate who never
    // opens the sheet loses nothing.
    expect(EXAM).toMatch(/setNavOpen\(false\);\s*\n\s*setConfirmOpen\(true\);/);
    expect([...EXAM.matchAll(/setConfirmOpen\(true\)/g)]).toHaveLength(2);
    expect(EXAM).toContain('aria-label="Преглед и предаване на изпита"');
  });
});

describe("the practice route's phone header", () => {
  it("picks its header by BOTH dimensions, not by width alone", () => {
    // THE DEFECT THIS REPLACED. The swap used to be `sm:hidden` / `hidden
    // sm:block`, which is a WIDTH test — and an iPhone 16 held sideways is
    // 852 x 393, so it passed for „desktop" and got the full aurora band:
    // measured in WebKit, the band filled the entire 393px screen on its own
    // and the question card started below the bottom edge. 520px of scroll.
    //
    // Each variant is ONE media query carrying both conditions. The obvious
    // spelling, `max-sm:tall:`, compiled to no rule at all in this Tailwind and
    // the header silently vanished on a portrait phone — so the composed form
    // is the thing under test, not an implementation detail.
    expect(PRACTICE_PAGE).toMatch(/<header className="[^"]*\bnarrow-tall:flex\b/);
    expect(PRACTICE_PAGE).toMatch(
      /<div className="hidden wide-tall:block">\s*<AuroraHeader/,
    );
    // The phone line is a LABEL, not a title: at `text-lg` it and its gap were
    // 44px spent re-stating the topic the student picked one tap ago.
    expect(PRACTICE_PAGE).toMatch(
      /<h1 className="min-w-0 truncate font-display text-sm font-black/,
    );
  });

  it("never exposes two <h1>s, and gives a landscape phone neither header", () => {
    const h1s = [...PRACTICE_PAGE.matchAll(/<h1\b/g)];
    expect(h1s).toHaveLength(2);
    // Each lives under a wrapper that is display:none for the other viewport,
    // and the two conditions are mutually exclusive by construction (narrow vs
    // wide), so the accessibility tree never holds both.
    expect(PRACTICE_PAGE).toMatch(/narrow-tall:flex[\s\S]{0,700}?<h1/);
    expect(PRACTICE_PAGE).toMatch(/hidden wide-tall:block[\s\S]{0,400}?<h1/);
    // A landscape phone matches NEITHER, deliberately: the app topbar is
    // already 12.2% of that screen and a 28px title row on top of it puts the
    // question card under the founder's 85%. The way back is not dropped with
    // it — the runner puts a 44px „← Теми" in the action bar for exactly that
    // viewport, and this is the pin that keeps the two edits together.
    expect(PRACTICE).toMatch(/short:inline-flex[\s\S]{0,80}?← Теми/);
  });
});

describe("the fold rig measures the page the student gets", () => {
  it("mounts the (dashboard) layout's <main> class string byte for byte", () => {
    // IT HAD DRIFTED, AND THE DRIFT WAS INVISIBLE. The rig said `short:py-2`
    // and the layout said `short:py-1`, so every landscape number this rig
    // produced — including the „12 of 18 need 22–104px of scroll" that row C5
    // was re-opened on — was 8px pessimistic (4px of padding at each end)
    // against the page a student actually gets. A rig that is 8px wrong is
    // worse than no rig, because its numbers look like measurements.
    const grab = (source: string): string => {
      const m = /<main\s+id="main-content"\s+className="([^"]*)"/.exec(source);
      return m?.[1] ?? "";
    };
    const layout = grab(DASHBOARD_LAYOUT);
    expect(layout).not.toBe("");
    expect(grab(FOLD_RIG)).toBe(layout);
  });
});

describe("row C5 — the answers are what must never scroll", () => {
  it("gives the QUESTION a measured height budget, never a hard-coded one", () => {
    // The order is load-bearing: the picture shrinks to ARTWORK_MIN_PX FIRST,
    // and only a bottomed-out artwork budget unlocks this one. Clipping the
    // words while a 150px diagram still has room to give is the wrong trade
    // and it is the one this guard exists to keep out.
    expect(PRACTICE).toContain("useQuestionBudget");
    expect(PRACTICE).toContain("artworkPx <= ARTWORK_MIN_PX");
    // A literal max-height would be wrong on both sides: too tight on the
    // 1 013 four-option items that already fit, too loose on q-vehicle-063.
    expect(PRACTICE).toMatch(/maxHeight: questionMaxPx/);
    expect(PRACTICE).not.toMatch(/maxHeight: \d+/);
    // …and it is released the moment it is no longer justified — on rotation
    // back to portrait, and after answering, when the why-panel needs the card
    // to grow again.
    expect(PRACTICE).toContain("result === null &&");
    expect(QUESTION_BUDGET).toContain("(max-height: 520px)");
    expect(QUESTION_BUDGET).toContain("visualViewport");
    expect(QUESTION_BUDGET).toContain("scrollHeight");
    // A floor, so the box can never become a sliver — and the residual past it
    // stays VISIBLE as document scroll instead of being swallowed.
    expect(QUESTION_BUDGET).toContain("QUESTION_MIN_PX");
  });

  it("scrolls the question INSIDE its own box, never the answers", () => {
    const scroller = classListWith(PRACTICE, "short:overflow-y-auto");
    expect(scroller).toContain("short:overflow-y-auto");
    // A flick that runs out of question text must not scroll the page out from
    // under the answers.
    expect(scroller).toContain("short:overscroll-contain");
    // …and it is exactly ONE box, the one carrying the marker the fold sweep
    // reads its residual scroll out of.
    expect([...PRACTICE.matchAll(/short:overflow-y-auto/g)]).toHaveLength(1);
    expect(PRACTICE).toContain("data-question-box");

    // THE OPTION LIST GETS NO CLAMP AND NO SCROLLER OF ITS OWN — it is the
    // thing being protected. Read off the real <ul>, not off a class helper
    // that would silently return "" for a conditional className and pass.
    const ul = /<ul\b[\s\S]*?>/.exec(PRACTICE)?.[0] ?? "";
    expect(ul).toContain("short:sm:grid");
    expect(ul).not.toContain("overflow");
    expect(ul).not.toContain("max-h-");
    // The box is a <span> INSIDE the <legend>, not a <div> around it: a legend
    // nested in a div stops being the fieldset's rendered legend and the radio
    // group loses its accessible name.
    const legendOpen = PRACTICE.indexOf("<legend");
    const legendClose = PRACTICE.indexOf("</legend>", legendOpen);
    const boxAt = PRACTICE.indexOf("data-question-box");
    expect(legendOpen).toBeGreaterThan(-1);
    expect(boxAt).toBeGreaterThan(legendOpen);
    expect(boxAt).toBeLessThan(legendClose);
    // A clipped question with nothing to say so reads as a rendering fault, so
    // the fade is drawn only when the box is actually clamped — and it washes
    // the box's 12px tail padding, never a line of type.
    expect(PRACTICE).toMatch(/questionMaxPx === null \? null : \(/);
    expect(PRACTICE).toContain("bg-gradient-to-t from-surface");
    expect(classListWith(PRACTICE, "short:overflow-y-auto")).toContain("short:pb-3");
  });

  it("gives the EXAM question the same measured budget, from the same hook", () => {
    // NOT A SECOND IMPLEMENTATION. `useQuestionBudget` was written standalone
    // so this file could adopt it unchanged; two layout systems that drift
    // apart is how a fold selector silently matched nothing for a whole phase.
    expect(EXAM).toContain("useQuestionBudget");
    expect(EXAM).toContain("artworkPx <= ARTWORK_MIN_PX");
    expect(EXAM).toMatch(/maxHeight: questionMaxPx/);
    expect(EXAM).not.toMatch(/maxHeight: \d+/);
    // The box scrolls INSIDE the legend, and the option list is what it is
    // protecting — so the options get no clamp and no scroller of their own.
    expect(EXAM).toContain("data-question-box");
    expect([...EXAM.matchAll(/short:overflow-y-auto/g)]).toHaveLength(1);
    expect(EXAM).toContain("short:overscroll-contain");
    const legendOpen = EXAM.indexOf("<legend");
    const legendClose = EXAM.indexOf("</legend>", legendOpen);
    const boxAt = EXAM.indexOf("data-question-box");
    expect(boxAt).toBeGreaterThan(legendOpen);
    expect(boxAt).toBeLessThan(legendClose);
    // Exactly ONE spelling of „short" in JavaScript, shared by both runners.
    expect(QUESTION_BUDGET).toContain("export function useIsShort");
    expect(EXAM).toContain("useIsShort");
    expect(PRACTICE).toContain("useIsShort");
    expect(PRACTICE).not.toContain("function readShort");
    // The option list goes to columns on a landscape phone, and the class is
    // hoisted out of the JSX because an inline ternary defeats this scanner.
    expect(EXAM).toContain("short:sm:grid-cols-2");
    expect(EXAM).toContain("short:sm:grid");
  });

  it("uses TWO landscape columns, never three — the 360-wide Android floor", () => {
    // THE RULE THAT USED TO BE HERE WAS MEASURED ON THE WRONG PHONE. „Three
    // columns once there are more than four options" was derived at 852x393,
    // where it is a modest win. Re-derived at 780x360 (WebKit, the fold rig,
    // q-vehicle-058 — five options, the worst item in the bank on that
    // viewport):
    //
    //   three columns  text column 240px  rows h[64,109,132,132,86]  269px
    //   two columns    text column 363px  rows h[64, 64, 86, 86,64]  225px
    //
    // A grid row is as tall as its tallest cell, so the narrow column's extra
    // wrapping inflated BOTH rows. 45px of overhang became none. The rule is
    // now a constant in both runners, and both must carry the same one: a
    // question that is one shape in practice and another in the exam is two
    // layout systems one edit apart from disagreeing.
    for (const [name, source] of [
      ["practice", PRACTICE],
      ["exam", EXAM],
    ] as const) {
      expect(source, name).toContain('const shortOptionColumns = "short:sm:grid-cols-2"');
      expect(source, name).not.toContain("short:sm:grid-cols-3");
    }
  });

  it("cancels BOTH flex gaps around the empty live region, not one", () => {
    // A 20px bug whose first fix took 10. The live region must stay MOUNTED
    // before the first answer or the verdict is never announced, and an empty
    // flex child still takes a `gap-2.5` on each side. `-mt-2.5` alone was
    // justified by „the bar's mt-auto eats the other one" — true only while
    // there is slack above the bar, and on the questions this row is about
    // there is none. The surviving 10px was the WHOLE overhang on q-vehicle-063
    // and q-vehicle-056 at 780x360 (11px of document scroll, nothing hidden).
    // `classListWith` reads className LITERALS, and this one is a conditional
    // expression — the cancellation exists only while the region is empty, and
    // must disappear the moment the verdict is in it or the why-panel would be
    // pulled 10px into the answers. So the pair is asserted on the expression
    // itself, anchored to `aria-live` so it cannot match some other element.
    const region = /aria-live="polite"[\s\S]{0,200}?className=\{result === null \? "([^"]*)"/.exec(
      PRACTICE,
    );
    expect(region, "the empty-live-region className expression").not.toBeNull();
    expect(region?.[1]).toContain("short:-my-2.5");
    expect(region?.[1]).toContain("narrow-tall:-my-2.5");
    // The half-fix must not come back. Scoped to the class list, not the file:
    // the comment above it NAMES `short:-mt-2.5` as the thing that was wrong,
    // and a guard that forbids a class from being discussed forbids the
    // explanation of why it is gone.
    expect(region?.[1]).not.toContain("-mt-2.5");
  });

  it("pairs every question-box `short:` class with its `narrow-tall:` twin", () => {
    // THE TWINS ARE A SET, NEVER ONE AT A TIME. The clamp is a `max-height` in
    // an inline style; the scroller, the tail padding and the „there is more"
    // fade are CSS variants. A viewport where the clamp can fire but the
    // scroller class is missing does not get a scroll box — it gets a question
    // with its last line simply gone, and nothing in a typecheck or a class
    // scan would say so. questionBudget.ts states the same rule in JS.
    for (const [name, source] of [
      ["practice", PRACTICE],
      ["exam", EXAM],
    ] as const) {
      for (const cls of ["overflow-y-auto", "overscroll-contain", "pb-3"]) {
        expect(source, `${name}/${cls}`).toContain(`short:${cls}`);
        expect(source, `${name}/${cls}`).toContain(`narrow-tall:${cls}`);
      }
      // the fade, and the positioned ancestor it is drawn against
      expect(source, name).toContain("narrow-tall:block");
      expect(source, name).toContain("narrow-tall:relative");
    }
  });

  it("attaches BOTH refs, to two different elements", () => {
    // THE MISTAKE THIS EXISTS FOR, made on the way in and caught by a
    // screenshot rather than by a test. The adoption renamed the card's ref and
    // added the text box's — and left `ref={questionBoxRef}` on the <section>.
    // Two elements shared one ref, `cardRef` was attached to NOTHING, and both
    // height budgets went silently dead: `if (!el) return`. Typecheck green,
    // every source guard above green, and the scene questions went back over
    // the fold in portrait — 18px under the bar on q-krastovishta-063, which
    // is how it was noticed at all.
    //
    // A ref that is declared and never attached is a hook that does nothing,
    // and neither the compiler nor a class-string scanner can see it.
    for (const [name, source] of [
      ["exam", EXAM],
      ["practice", PRACTICE],
    ] as const) {
      expect([...source.matchAll(/ref=\{cardRef\}/g)], name).toHaveLength(1);
      expect([...source.matchAll(/ref=\{questionBoxRef\}/g)], name).toHaveLength(1);
      // The card ref is on the <section>; the box ref is on the span that
      // carries the marker. Order in the file settles which is which.
      expect(source.indexOf("ref={cardRef}")).toBeLessThan(
        source.indexOf("ref={questionBoxRef}"),
      );
      expect(source.indexOf("ref={questionBoxRef}")).toBeLessThan(
        source.indexOf("data-question-box") + 40,
      );
    }
  });

  it("the multi-answer warning moved into the landscape action bar", () => {
    // 22px of the ~59 the six-option worst case was short by, and the same
    // move the exam runner already made with its own pill.
    const hint = classListWith(PRACTICE, "mt-1.5 text-xs font-bold text-accent");
    expect(hint).toContain("short:hidden");
    expect(hint).toContain("sm:mt-2");
    expect(PRACTICE).toContain("Всички верни");
    // Exactly one of the pair is in the accessibility tree at any viewport.
    const barIdx = PRACTICE.indexOf("short:sticky");
    expect(PRACTICE.indexOf("short:inline-flex", barIdx)).toBeGreaterThan(barIdx);
  });

  it("still refuses to trade the reading sizes for the pixels", () => {
    // This is the row where the temptation is greatest — 393px of glass and a
    // 284-character question. The question stays 18px and the answers 14px in
    // BOTH orientations; what gives is how much of the question is on screen
    // at once, which is a scroll box, not a smaller font.
    expect(PRACTICE).toContain('className="max-w-[62ch] text-lg font-bold');
    expect(PRACTICE).not.toMatch(/short:text-(xs|sm|base)\b/);
    expect(classListWith(PRACTICE, "min-h-11 items-start")).toContain("text-sm");
  });
});

describe("Tailwind's scanner can see the classes", () => {
  it("every fold utility is an unbroken literal", () => {
    const needles = [
      "max-sm:sticky",
      "max-sm:bottom-0",
      "max-sm:-mx-4",
      "max-sm:-mb-3",
      "max-sm:-mb-6",
      "max-sm:mt-auto",
      "max-sm:backdrop-blur",
      "min-h-11",
      "leading-[1.45]",
      "h-[2px]",
      // The landscape set. These are the ones a „tidy the classes" pass is
      // most likely to eat, and losing any of them puts the answers back
      // under the fold on a phone held sideways with everything still green.
      "short:sticky",
      "short:mt-auto",
      "short:flex-1",
      "short:sm:grid-cols-2",
      "narrow-tall:flex",
      "wide-tall:block",
      // THE EXAM'S DESKTOP-ONLY SET, and the three that decide whether the
      // counter and the countdown have one home or two. `wide-tall:flex` draws
      // the header card and the in-card meta row; `wide-tall:hidden` is its
      // exact complement on the flag, the paper button, the phone clock and
      // the two chips at the head of the question. If Tailwind ever stops
      // emitting one of the pair, the two surfaces are BOTH on (three counters
      // and two clocks on a 393px screen) or BOTH off (no clock at all on a
      // 40-minute scored paper) — and every source assertion above stays green
      // either way, which is exactly why they are pinned here.
      "wide-tall:flex",
      "wide-tall:hidden",
      // Row C5's set. `short:overflow-y-auto` is the whole fix — lose it and
      // the question box stops being a box and the answers go back under the
      // action bar, with every source guard above still green.
      "short:overflow-y-auto",
      "short:overscroll-contain",
      "short:max-w-none",
      "short:inline-flex",
      // The exam's landscape set. `short:sm:grid` is what turns six 44px
      // option rows into two columns; lose it and the answers go back under
      // the bar with every source guard above still green.
      "short:sm:grid",
      "short:pt-1.5",
      // The 360-wide Android floor's own set, added by row C5's Android pass.
      // Each of these is worth 4–24px on a 360px screen and every one of them
      // is a class a „tidy the variants" pass would read as redundant.
      "short:py-1.5",
      "narrow-tall:py-2",
      "narrow-tall:pt-2",
      "narrow-tall:mt-1",
      "short:mt-1",
      "narrow-tall:-my-2.5",
      "short:-my-2.5",
      "narrow-tall:overflow-y-auto",
      "narrow-tall:overscroll-contain",
      "narrow-tall:relative",
      "narrow-tall:block",
      "narrow-tall:pb-3",
      // `short:inline-block` was here for the exam header card's two phone
      // pills. That card is desktop-only now and the pills are chips inside the
      // question, drawn with a plain `inline-block` and hidden by
      // `wide-tall:hidden` — both already pinned above. The utility is in no
      // scanned file any more, and a needle that matches nothing is a needle
      // that can never fail for the right reason.
      // The exam card's full-bleed set. Lose `short:-mx-4` and the card gives
      // back 32px of text column on a 780x360 Android — measured: the same
      // five-option question wrapped one line further and its last answer
      // landed 23px lower, which was the whole of the residual that kept the
      // exam behind practice on that phone.
      "short:-mx-4",
      "short:border-x-0",
      "short:rounded-none",
      "short:leading-[1.45]",
    ];
    const all = `${PRACTICE}\n${EXAM}\n${MEDIA}\n${PRACTICE_PAGE}`;
    for (const n of needles) {
      // Present, and not split across a `" + "` / `${...}` seam — the scanner
      // reads text, so a seam means the rule is never generated.
      expect(all).toContain(n);
      expect(all).not.toMatch(
        new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]\\s*[+}]`),
      );
    }
  });
});
