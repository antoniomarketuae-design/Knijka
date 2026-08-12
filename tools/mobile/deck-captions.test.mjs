// =============================================================================
// deck-captions.test.mjs — THE GATE SIDE OF THE CAPTION LINT.
//
//   node --test tools/mobile/deck-captions.test.mjs
//   (picked up automatically by `npm run test:tools`)
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY A SECOND FILE, AND WHY IT IS NOT A CHARACTER BUDGET
// ═════════════════════════════════════════════════════════════════════════════
// `deck-captions.mjs` answers the real question — does every authored caption
// render WHOLE in the box the smallest supported phone gives it — and it needs
// WebKit, a production build, a signed-in account and four minutes to do it.
// Nothing that expensive runs on every commit. A check that only runs when
// somebody remembers is not a gate, and this project has been bitten three
// times in one week by checks that measure something weaker than the
// requirement they are named for.
//
// THE TEMPTING WEAK CHECK IS „no caption over N characters". It is the same
// mistake one level up from the one that caused this defect: the box was sized
// against „the LONGEST annotation in the PILOT trace, 71 characters" and then
// applied to a corpus of 1 811 with a maximum of 249. Bulgarian glyph widths,
// the card's padding, the safe-area insets and where WebKit breaks
// «Наредба № РД-02-21-1/23.11.2023» are all inputs, and none of them is a
// character count.
//
// So this file stores no budget and no verdict. It stores the MEASUREMENT — a
// height in pixels, at a measured width, for the tallest caption in the bank on
// each profile — and re-checks the one inequality that matters, plus the three
// ways that measurement can silently stop describing the tree:
//
//   1. THE CORPUS CHANGED. A new or edited caption has never been laid out.
//      Caught by a sha256 over the sorted caption strings.
//   2. THE GEOMETRY CHANGED. Somebody moved a constant. Caught by comparing
//      each frozen ceiling against the exported constant that produces it,
//      read out of `notifyColumn.ts` itself.
//   3. THE FREEZE CAME FROM THE WRONG PLACE. A dev-build or partial run is
//      refused at write time by the tool and re-checked here.
//
// Any of the three fails the gate and names the command that fixes it. Nobody
// has to remember.
// =============================================================================
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// lib/captions.mjs and NOT ./deck-captions.mjs: the tool imports Playwright,
// next-auth's sign-in helper and the Prisma client, and a gate step that fails
// because a browser is not installed is a gate step people delete.
import { FROZEN_PATH, corpusHash, readCaptions } from "./lib/captions.mjs";
import { DEFAULT_DEVICE_IDS } from "./lib/devices.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOTIFY_COLUMN = join(
  HERE,
  "..",
  "..",
  "platform",
  "src",
  "modules",
  "sim",
  "hud",
  "notifyColumn.ts",
);

const REFREEZE =
  "Re-run the real measurement and re-freeze (WebKit upgrades loopback under the\n" +
  "production CSP, so the TLS front is not optional — plain http hands that engine\n" +
  "a page with no JavaScript on it):\n" +
  "    cd platform && KNIJKA_DIST_DIR=.next-cap npx next build\n" +
  "    KNIJKA_DIST_DIR=.next-cap npx next start --port 3488 --hostname localhost &\n" +
  "    node tools/mobile/.out/j4cap/tls-front.mjs --upstream 3488 --port 3489 &\n" +
  "    npm run deck:captions:freeze -- --base-url https://localhost:3489";

const frozen = JSON.parse(readFileSync(FROZEN_PATH, "utf8"));

/** Read an exported numeric constant out of notifyColumn.ts by name. */
function constantPx(name) {
  const src = readFileSync(NOTIFY_COLUMN, "utf8");
  const m = new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?);`).exec(src);
  assert.ok(m, `${name} is no longer an exported literal in notifyColumn.ts — ${REFREEZE}`);
  return Number(m[1]);
}

/**
 * WHICH CONSTANT OWNS WHICH PROFILE'S CEILING.
 *
 * Written out per profile rather than inferred, because the whole point of the
 * check is that a reader can see WHY a given phone gets the height it gets:
 *  · portrait  the box takes its content up to a ceiling (bottom-anchored deck,
 *              toggle in the transport row, so it grows upward into empty stage)
 *  · landscape the caption is out of the deck's flow entirely and hangs over the
 *              road (the corridor is 40–75 px against a 58 px transport row)
 *  · desktop   a fixed box, sized to the tallest caption in the bank at 416 px
 */
const CEILING_OWNER = {
  "iphone16-portrait": "DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX",
  "small-portrait": "DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX",
  "galaxy-gesturebar-portrait": "DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX",
  "iphone16-landscape": "DECK_TOUCH_CAPTION_ROAD_MAX_PX",
  "small-landscape": "DECK_TOUCH_CAPTION_ROAD_MAX_PX",
  "galaxy-gesturebar-landscape": "DECK_TOUCH_CAPTION_ROAD_MAX_PX",
  "desktop-roomy": "DECK_ROOMY_CAPTION_HEIGHT_PX",
};

test("the frozen verdict came from a PRODUCTION build of the real route", () => {
  assert.equal(frozen.build, "production", `the freeze is not from a production build — ${REFREEZE}`);
  assert.equal(frozen.engine, "webkit", `the freeze is not from WebKit — ${REFREEZE}`);
  // `/dev/drive-rig` answers notFound() under NODE_ENV=production, so a freeze
  // naming it could not have come from the shipped build no matter what the
  // `build` field says.
  assert.match(frozen.route, /^\/simulator\?/, `the freeze names a dev route — ${REFREEZE}`);
});

test("every phone in the ladder is in the freeze, and the desktop with them", () => {
  const have = new Set(frozen.profiles.map((p) => p.device));
  for (const id of DEFAULT_DEVICE_IDS) {
    assert.ok(have.has(id), `profile ${id} is missing from the freeze — ${REFREEZE}`);
  }
  // The desktop is a profile here and not an afterthought: it is the screen the
  // captions are AUTHORED on, and it clamped 78 of them as recently as
  // 2026-08-12. A caption that looks fine to its author and is cut on the
  // founder's phone is the whole failure this lint exists for.
  assert.ok(have.has("desktop-roomy"), `the desktop profile is missing — ${REFREEZE}`);
});

test("the corpus has not changed since it was measured", () => {
  const { files, captions } = readCaptions();
  const hash = corpusHash(captions.map((c) => c.text));
  assert.equal(
    hash,
    frozen.corpus.sha256,
    `The demonstration captions have changed since the last browser measurement ` +
      `(frozen ${frozen.corpus.captions} captions / ${frozen.corpus.traces} traces, ` +
      `tree now ${captions.length} / ${files}). A caption that has never been laid out ` +
      `may not render whole in the box it is given — that is exactly the defect this ` +
      `gate exists for, and it is why the check is a hash and not a length.\n${REFREEZE}`,
  );
});

test("no authored caption was clamped on any profile", () => {
  for (const p of frozen.profiles) {
    assert.equal(
      p.clamped,
      0,
      `${p.label}: ${p.clamped} authored caption(s) could not render whole in a ` +
        `${p.cardWidth} × ${p.ceiling} px box. A citation the student never sees is the ` +
        `same as a citation we never wrote (ADR-002). Run ` +
        `\`npm run deck:captions -- --json out.json\` for the exact words lost.`,
    );
  }
});

test("the tallest caption in the bank still fits its ceiling", () => {
  for (const p of frozen.profiles) {
    assert.ok(
      p.tallest.px <= p.ceiling,
      `${p.label}: the tallest caption needs ${p.tallest.px} px of a ${p.ceiling} px box ` +
        `(${p.tallest.chars} chars, ${p.tallest.trace}).`,
    );
    // A box measured at zero width measured nothing. The Samsung landscape
    // profile reported a caption box of 456 × −22 on 2026-08-12 and the sweep
    // was right to call that UNMEASURED rather than clean.
    assert.ok(p.cardWidth > 0, `${p.label}: the frozen card width is ${p.cardWidth} — ${REFREEZE}`);
    assert.ok(p.ceiling > 0, `${p.label}: the frozen ceiling is ${p.ceiling} — ${REFREEZE}`);
  }
});

test("each frozen ceiling still equals the constant that produces it", () => {
  // THIS IS THE ONE THAT CATCHES A CSS CHANGE. Without it the freeze would go
  // on asserting yesterday's geometry: J-WAVE-2 moved the landscape deck below
  // the top rail — correctly — and took the caption from 46 px to 13.5 px on
  // the founder's phone with nothing in the tree to notice.
  for (const p of frozen.profiles) {
    const name = CEILING_OWNER[p.device];
    assert.ok(name, `no constant is recorded as owning ${p.device}'s ceiling`);
    assert.equal(
      p.ceiling,
      constantPx(name),
      `${p.label}: the box measured ${p.ceiling} px but ${name} now says ` +
        `${constantPx(name)} px. The geometry moved after the measurement, so every ` +
        `verdict in the freeze describes a screen that no longer exists.\n${REFREEZE}`,
    );
  }
});

test("the freeze is a measurement, not a character budget", () => {
  // A guard on the guard. If somebody ever replaces the stored heights with a
  // length rule, this fails and the header above says why that is the same
  // mistake one level up.
  for (const p of frozen.profiles) {
    assert.equal(typeof p.tallest.px, "number");
    assert.ok(p.tallest.px > 0, "a stored height of zero is not a measurement");
    assert.ok(
      p.tallest.text.length > 0,
      "the tallest caption's own text is stored so the frozen number is auditable by hand",
    );
  }
});
