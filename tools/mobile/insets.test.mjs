// Run: node --test tools/mobile/insets.test.mjs   (scripts/tools-tests.mjs owns it)
//
// The arithmetic of the notch emulation, pinned without a browser.
//
// `rewriteEnv` is the whole substitution — every fold number this lane
// publishes passes through it — and it edits CSS by hand, which is exactly the
// kind of code that works on the two declarations someone tried and mangles the
// third. A mangled declaration does not throw: the CSSOM DROPS an invalid value
// silently, so the page lays out with LESS padding than either phone has and
// the sweep reports a screen nobody owns.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEVICES } from "./lib/devices.mjs";
import { ROTATIONS, insetsFor, rewriteEnv } from "./lib/insets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const IP = { top: 59, right: 12, bottom: 34, left: 21 };

/**
 * CODE, NOT PROSE ABOUT CODE — and the scans below were wrong without this.
 *
 * Every probe in this directory documents its defect by QUOTING the code that
 * caused it, which is the house style and is worth keeping. But the `newContext(`
 * ban further down scanned raw lines, so the moment `zoom-follows-window.mjs`
 * was fixed and explained itself with the sentence
 *
 *     // This rig opened its own `browser.newContext({ viewport: … })`.
 *
 * the ban convicted the fix. This file had already hit that and papered over it
 * by exempting ITSELF by filename — its own docblock quotes
 * `browser.newContext(contextOptions(device, …))` — i.e. a whole test file
 * excused from a rule because one line of its prose tripped it. That exemption
 * is now gone, because the scan can read.
 *
 * DELIBERATELY CONSERVATIVE. A line is treated as prose only when its FIRST
 * non-space characters are `//`, `*` or `/*` — a whole-line comment or a JSDoc
 * continuation. A TRAILING comment on a code line is left in place, so a
 * `.newContext(` hidden at the end of a real line still goes RED. Every way
 * this can be wrong points at a false failure, which is the survivable
 * direction; a stateful stripper that mistook a regex literal for a block
 * comment could blank real code and fail green, which is the direction every
 * instrument bug in this project has failed in.
 *
 * @param {string} text
 * @returns {string[]} one entry per input line, prose lines replaced by ""
 */
const codeLines = (text) =>
  text.split("\n").map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? "" : line));

test("substitutes each side with its own number", () => {
  assert.equal(rewriteEnv("env(safe-area-inset-top)", IP), "59px");
  assert.equal(rewriteEnv("env(safe-area-inset-right)", IP), "12px");
  assert.equal(rewriteEnv("env(safe-area-inset-bottom)", IP), "34px");
  assert.equal(rewriteEnv("env(safe-area-inset-left)", IP), "21px");
});

test("keeps the surrounding expression — this app writes calc() around it", () => {
  // The two runners' pinned bars and the shell's drawer are all of this shape.
  assert.equal(
    rewriteEnv("calc(0.375rem + env(safe-area-inset-bottom))", IP),
    "calc(0.375rem + 34px)",
  );
  assert.equal(rewriteEnv("calc(18rem + env(safe-area-inset-left, 0px))", IP), "calc(18rem + 21px)");
  assert.equal(
    rewriteEnv("max(0.75rem, env(safe-area-inset-bottom))", IP),
    "max(0.75rem, 34px)",
  );
});

test("drops the fallback argument rather than leaving it behind", () => {
  assert.equal(rewriteEnv("env(safe-area-inset-bottom, 0px)", IP), "34px");
  assert.equal(rewriteEnv("env( safe-area-inset-left , 0px )", IP), "21px");
});

test("a NESTED fallback does not truncate the expression", () => {
  // A regex that stops at the first ")" produces
  // `calc(1rem + 34px))` — invalid, silently dropped by the CSSOM, and the
  // element then has no padding at all. That is a fabricated layout, not a
  // measurement, so it is pinned here.
  assert.equal(
    rewriteEnv("calc(1rem + env(safe-area-inset-bottom, var(--x, 2px)))", IP),
    "calc(1rem + 34px)",
  );
  assert.equal(
    rewriteEnv("env(safe-area-inset-top, calc(2px + 3px))", IP),
    "59px",
  );
});

test("rewrites every occurrence in one value", () => {
  assert.equal(
    rewriteEnv("calc(env(safe-area-inset-left) + env(safe-area-inset-right))", IP),
    "calc(21px + 12px)",
  );
});

test("leaves other env() variables and lookalike functions alone", () => {
  assert.equal(rewriteEnv("env(titlebar-area-height)", IP), "env(titlebar-area-height)");
  assert.equal(
    rewriteEnv("calc(env(keyboard-inset-bottom) + env(safe-area-inset-bottom))", IP),
    "calc(env(keyboard-inset-bottom) + 34px)",
  );
  // Identity for anything with no inset in it at all — callers use identity to
  // decide whether to write back, so this is load-bearing.
  const plain = "calc(1rem + 2px)";
  assert.equal(rewriteEnv(plain, IP), plain);
});

test("the profiles' real insets are what gets emulated", () => {
  const portrait = insetsFor(DEVICES["iphone16-portrait"], {});
  assert.deepEqual(
    { t: portrait.top, r: portrait.right, b: portrait.bottom, l: portrait.left },
    { t: 59, r: 0, b: 34, l: 0 },
  );
  const landscape = insetsFor(DEVICES["iphone16-landscape"], {});
  assert.deepEqual(
    { t: landscape.top, r: landscape.right, b: landscape.bottom, l: landscape.left },
    { t: 0, r: 59, b: 21, l: 59 },
  );
});

test("landscape rotation moves the cutout to ONE side, and symmetric is the worst case", () => {
  const device = DEVICES["iphone16-landscape"];
  const left = insetsFor(device, { rotation: "left" });
  const right = insetsFor(device, { rotation: "right" });
  const both = insetsFor(device, { rotation: "symmetric" });
  assert.deepEqual([left.left, left.right], [59, 0]);
  assert.deepEqual([right.left, right.right], [0, 59]);
  assert.deepEqual([both.left, both.right], [59, 59]);
  // The default is the one that takes the most room away, so a layout that
  // passes the ladder passes either way up.
  assert.equal(insetsFor(device, {}).rotation, "symmetric");
  assert.ok(both.left + both.right > left.left + left.right);
  // Rotation is meaningless in portrait and must not silently move the notch.
  const p = insetsFor(DEVICES["iphone16-portrait"], { rotation: "left" });
  assert.deepEqual([p.left, p.right, p.top, p.bottom], [0, 0, 59, 34]);
});

test("`none` is available but says what it is", () => {
  const off = insetsFor(DEVICES["iphone16-portrait"], { mode: "none" });
  assert.deepEqual([off.top, off.right, off.bottom, off.left], [0, 0, 0, 0]);
  assert.match(off.says, /NO NOTCH/i);
});

test("refuses an unknown mode or rotation instead of guessing", () => {
  assert.throws(() => insetsFor(DEVICES["iphone16-portrait"], { mode: "sort-of" }), /real\|none/);
  assert.throws(() => insetsFor(DEVICES["iphone16-portrait"], { rotation: "sideways" }), /rotation/);
  assert.deepEqual(ROTATIONS, ["symmetric", "left", "right"]);
});

/**
 * THE OTHER HALF OF THE DOOR — 2026-08-19.
 *
 * The `newContext(` ban below checks the CONSTRUCTOR. Nothing checked the
 * PROFILE handed through the door, and a profile no longer always comes from
 * `DEVICES`: four probes derive one locally (three desktop rows, plus
 * zoom-follows-window.mjs for the iPhone 16 Pro at 402x874, which the ladder
 * does not carry). So the notchless layout could still arrive — not by opening
 * a raw context, but by handing the door a profile that forgot the notch.
 *
 * `safeArea: {}` was the dangerous case, because it did not throw: it
 * substituted the literal `undefinedpx`, which the CSSOM drops silently, and
 * that is LESS padding than any real device has.
 */
test("refuses a profile that does not declare its safe area — and 0 IS a declaration", () => {
  // FIRST, THE FALSE-REFUSAL DIRECTION, because a check that rejected zeros
  // would be aimed at the most honest rows in the ladder: both Android profiles
  // and all three desktop profiles are {0,0,0,0} on purpose.
  const declaredZero = {
    id: "desktop-roomy",
    orientation: "landscape",
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const zero = insetsFor(declaredZero, {});
  assert.deepEqual([zero.top, zero.right, zero.bottom, zero.left], [0, 0, 0, 0]);
  assert.equal(zero.mode, "real"); // declared zero, not "insets off"

  // NOW THE OMISSIONS. Before this guard the first of these threw
  // `TypeError: Cannot read properties of undefined (reading 'left')` — a crash
  // that names no cause — and the second and third did not throw AT ALL.
  assert.throws(
    () => insetsFor({ id: "forgot-it", orientation: "portrait" }, {}),
    /declares no safeArea/,
  );
  assert.throws(
    () => insetsFor({ id: "empty-sa", orientation: "portrait", safeArea: {} }, {}),
    /no finite safeArea\.top\/right\/bottom\/left/,
  );
  assert.throws(
    () =>
      insetsFor(
        { id: "half-sa", orientation: "portrait", safeArea: { top: 59, bottom: 34, left: 0 } },
        {},
      ),
    /no finite safeArea\.right/,
  );
  // A side that is present but not a number is the same defect wearing a value.
  assert.throws(
    () =>
      insetsFor(
        { id: "nan-sa", orientation: "portrait", safeArea: { top: 59, right: "0px", bottom: 34, left: 0 } },
        {},
      ),
    /no finite safeArea\.right/,
  );
  // And it cannot be dodged by asking for the notchless mode: a malformed
  // profile is malformed whichever insets the caller wanted.
  assert.throws(
    () => insetsFor({ id: "forgot-it", orientation: "portrait" }, { mode: "none" }),
    /declares no safeArea/,
  );
  assert.throws(() => insetsFor(null, {}), /no device profile/);
});

test("refuses a profile whose orientation is not one of the two — that one fails silently", () => {
  // `rotation` is honoured ONLY when orientation reads exactly "landscape". So
  // without this check a typo does not error: it returns the SYMMETRIC insets
  // (59 left AND 59 right), the banner prints no rotation, and the run answers
  // a different question than the one it was asked — 59px of width charged to
  // the wrong side of the screen with nothing saying so.
  const typo = {
    id: "landsacpe-typo",
    orientation: "landsacpe",
    safeArea: { top: 0, right: 59, bottom: 21, left: 59 },
  };
  assert.throws(() => insetsFor(typo, { rotation: "left" }), /orientation/);
  // Proof the silence was real: the same profile spelled correctly DOES move
  // the cutout to one side, so the typo was suppressing a live behaviour.
  const spelled = { ...typo, orientation: "landscape" };
  const left = insetsFor(spelled, { rotation: "left" });
  assert.deepEqual([left.left, left.right], [59, 0]);
  assert.throws(() => insetsFor({ ...typo, orientation: undefined }, {}), /orientation/);
});

/**
 * THE ONE DOOR, ENFORCED — and this is the assertion that makes „real insets by
 * default" a property of the harness rather than of whoever remembered.
 *
 * The defect was never that someone chose the wrong inset. It was that opening
 * a context was a one-liner (`browser.newContext(contextOptions(device, …))`)
 * that said nothing about the notch, so six probes independently, silently,
 * measured a phone with no cutout for the whole life of this harness. A seventh
 * probe written tomorrow would do it again, and nothing would go red.
 *
 * So: `newDeviceContext` is the only way to open one, and a raw `newContext(`
 * anywhere under tools/mobile — except inside insets.mjs, which IS the door —
 * fails here, in the ordinary `npm run test:tools` gate, with no browser and no
 * server.
 *
 * 2026-08-19: THE SCAN NOW TAKES `.js` AND `.cjs` TOO. It only ever collected
 * `.mjs`, which is not a rule about what a probe is — it is a description of
 * what the probes happened to be called. Every script here is ESM today, so the
 * widening costs nothing and catches the next one that is not; a ban with an
 * extension-shaped hole in it is the reassuring kind.
 */
test("no probe opens a browser context without the notch — newDeviceContext is the one door", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|cjs|js)$/.test(entry.name)) files.push(full);
    }
  };
  walk(HERE);
  assert.ok(files.length >= 10, `expected to have found the harness, found ${files.length} files`);

  // The escape hatch is a comment, not a filename: `// insets-exempt: <reason>`
  // on the line above. Deliberate, greppable, and impossible to reach by
  // forgetting.
  const offenders = [];
  for (const file of files) {
    // EXACT PATHS, not `endsWith`. `file.endsWith("insets.mjs")` exempted every
    // file whose NAME ends in that string, so a probe called `my-insets.mjs`
    // would have been waved through the ban silently — an exemption with a
    // suffix-shaped hole, which is the same shape of defect as the extension
    // filter above.
    const rel = file.slice(HERE.length + 1).replace(/\\/g, "/");
    if (rel === "lib/insets.mjs") continue; // lib/insets.mjs IS the door
    const raw = readFileSync(file, "utf8").split("\n");
    // Prose blanked, LINE FOR LINE, so the offender's line number is still the
    // real one and the `insets-exempt:` marker — which IS a comment — is still
    // read from the raw text above the call.
    const code = codeLines(raw.join("\n"));
    for (const [i, line] of code.entries()) {
      if (!/\.newContext\s*\(/.test(line)) continue;
      const above = raw.slice(Math.max(0, i - 3), i).join("\n");
      if (/insets-exempt:\s*\S/.test(above)) continue;
      offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these open a Playwright context directly, so they lay the app out at ` +
      `env(safe-area-inset-*) = 0 — i.e. on a phone with no notch and no home ` +
      `indicator — and every number they publish is about a device nobody owns. ` +
      `Use newDeviceContext(browser, device, { motion }) from lib/insets.mjs:\n  ` +
      offenders.join("\n  "),
  );
});

test("EVERY profile in the ladder declares insets, and the iPhone's are not zero", () => {
  // The failure this whole file exists to end is a profile that models a phone
  // with no cutout. A future profile added without insets would sail through
  // every other check in the harness.
  for (const device of Object.values(DEVICES)) {
    const inset = insetsFor(device, {});
    assert.equal(typeof inset.bottom, "number", `${device.id} has no bottom inset`);
  }
  const p = insetsFor(DEVICES["iphone16-portrait"], {});
  const l = insetsFor(DEVICES["iphone16-landscape"], {});
  assert.ok(p.bottom > 0 && p.top > 0, "iPhone portrait must model the island and the indicator");
  assert.ok(l.left > 0 && l.bottom > 0, "iPhone landscape must model the cutout and the indicator");
});

/**
 * THE ZOOM RIG, PINNED — 2026-08-19, and it is pinned per-file on purpose.
 *
 * `zoom-follows-window.mjs` is the probe the ban above convicted: it opened its
 * own context for four months and every number it published — including the
 * `post-fix shell 349 px -> 0 off-screen` that the §I8 fix was signed off on —
 * described a phone with no home indicator. Routing it through the door is not
 * enough by itself, for two reasons this test holds down:
 *
 *   1. INSTALLING THE EMULATION IS NOT THE SAME AS PROVING IT LANDED. `insets.mjs`
 *      says so in its own header: "an emulation that silently rewrites nothing is
 *      indistinguishable from a phone with no notch". `assertInsetsApplied` is
 *      the negative control, and a rig that opens the door without it has swapped
 *      one reassuring instrument for a quieter one.
 *   2. IT DERIVES ITS OWN PROFILE, because the ladder has no iPhone 16 Pro. A
 *      hand-typed `safeArea: {...}` there would be a SECOND copy of the one fact
 *      the whole file is about, and the next person to correct devices.mjs would
 *      not correct the copy.
 *
 * WHY NOT MAKE (1) A RULE FOR EVERY PROBE: measured before writing this — 66
 * files under tools/mobile import `newDeviceContext` and 6 mention
 * `assertInsetsApplied`. A blanket gate would go red in ~60 files this lane does
 * not own, which is a false refusal and a cross-lane collision, not a fix. The
 * general rule is real and is routed rather than enforced here.
 */
test("the zoom rig goes through the door AND proves the emulation landed", () => {
  // PROSE BLANKED FIRST, and this test would be wrong in both directions
  // without it: the rig's own header contains the sentence "A hand-typed
  // `safeArea: {…}` here would be a second copy", which would fail the negative
  // assertion, and any of the positive ones could be satisfied by an
  // explanation instead of by code.
  const raw = readFileSync(join(HERE, "zoom-follows-window.mjs"), "utf8");
  const lines = codeLines(raw);
  const code = lines.join("\n");
  // THE INSTRUMENT IS CHECKED BEFORE IT IS READ, and FIRST rather than last on
  // purpose: if the blanking silently stops working, every assertion below
  // becomes a scan of prose, and whichever one fires first would blame the rig
  // for a defect that is in this line.
  //
  // The check is STRUCTURAL, not a phrase. The first version looked for the
  // literal "a hand-typed" and did not fire when the blanker was neutered — the
  // rig writes "A hand-typed", and `includes` is case-sensitive. A self-check
  // that reads one hand-copied phrase is the same class of instrument as the
  // ones this whole directory exists to distrust. The invariant instead: the
  // rig HAS comments, some line was blanked, and no surviving line begins with
  // `//`.
  assert.ok(raw.includes("// "), "the rig has comments — there is something to blank");
  assert.ok(
    lines.some((line) => line === "") && !lines.some((line) => /^\s*\/\//.test(line)),
    "the prose blanker did not blank — every assertion below is then reading comments",
  );
  assert.match(code, /newDeviceContext\s*\(/, "it must open its context through the one door");
  assert.match(
    code,
    /assertInsetsApplied\s*\(/,
    "installing the substitution is not proving it landed — the negative control is not optional",
  );
  assert.match(code, /process\.exit\(1\)/, "a failed control must abort the run, not print and continue");
  // The Pro profile is SPREAD from the ladder's iPhone, so the notch numbers
  // have exactly one home. A `safeArea:` literal in the rig is the second copy.
  assert.doesNotMatch(
    code,
    /safeArea\s*:\s*\{/,
    "the notch numbers live in lib/devices.mjs and nowhere else — derive the profile, do not retype it",
  );
  assert.match(code, /DEVICES\["iphone16-portrait"\]/, "…and derive it from the row it actually extends");
});
