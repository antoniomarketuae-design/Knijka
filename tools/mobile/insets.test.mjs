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
 */
test("no probe opens a browser context without the notch — newDeviceContext is the one door", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs")) files.push(full);
    }
  };
  walk(HERE);
  assert.ok(files.length >= 10, `expected to have found the harness, found ${files.length} files`);

  // The escape hatch is a comment, not a filename: `// insets-exempt: <reason>`
  // on the line above. Deliberate, greppable, and impossible to reach by
  // forgetting.
  const offenders = [];
  for (const file of files) {
    if (file.endsWith("insets.mjs")) continue; // lib/insets.mjs IS the door
    if (file.endsWith("insets.test.mjs")) continue; // this file spells the pattern
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      if (!/\.newContext\s*\(/.test(line)) continue;
      const above = lines.slice(Math.max(0, i - 3), i).join("\n");
      if (/insets-exempt:\s*\S/.test(above)) continue;
      offenders.push(`${file.slice(HERE.length + 1).replace(/\\/g, "/")}:${i + 1}`);
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
