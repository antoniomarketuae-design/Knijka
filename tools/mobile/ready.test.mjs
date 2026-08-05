// -----------------------------------------------------------------------------
// ready.test.mjs — THE TESTS THAT WOULD HAVE CAUGHT A PROBE MEASURING NOTHING.
//
//   node --test tools/mobile/ready.test.mjs
//   (or `npm run test:tools` from platform/, which discovers it automatically)
//
// Row C8 said the portrait driving shell settles in 1,190 ms against a 1,200 ms
// budget. Someone opened the frames behind that number. Every one of them is a
// BLACK CANVAS: no street, no car, the lesson menu still open and a „Пауза"
// modal stacked on top of it. The probe had waited for `canvas` at
// `state: "attached"` — satisfied the instant React mounts the element — then
// slept a fixed 6 s and started measuring. A black canvas has perfectly stable
// geometry, so it settled beautifully, and the row passed.
//
// Nothing in the suite could have noticed, because nothing in the suite ever
// asked what was IN the frame. These are the tests that ask.
//
// THREE THINGS ARE LOCKED HERE, one per defect:
//
//   1. THE GATE — `isWorldFrame` must reject the exact frames the probe
//      recorded and accept the exact frames of a real street. Their measured
//      vitals are `MEASURED` below.
//   2. THE ARITHMETIC — `frameVitals` is exercised through the real PNG decode
//      path on images built pixel by pixel here, so the statistics that decide
//      (1) are themselves verified rather than assumed.
//   3. THE PROBE'S BEHAVIOUR — the driving route must DECLARE that it needs a
//      world, the probe must REFUSE rather than record when it does not get
//      one, and the close phase must never press the key that opens the pause
//      menu.
//
// NO PNG FIXTURES LIVE IN THIS REPO. Frames belong in a scratch directory —
// 626 MB of them have been committed by accident three times. `MEASURED` is
// what a fixture is for: the numbers, re-derived from the real captures under
// `tools/mobile/.out/` and written down, which is a few hundred bytes instead
// of a few hundred megabytes. When those captures happen to be on the box, the
// last test re-measures them and fails if reality has drifted from the table;
// when they are not, it says so LOUDLY instead of passing quietly.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ROUTES } from "./lib/routes.mjs";
import { WORLD_FRAME, decodePng, frameVitals, isWorldFrame, waitForWorld } from "./lib/ready.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURES = join(HERE, ".out");

// -----------------------------------------------------------------------------
// THE FRAMES, AS NUMBERS.
//
// Measured with this file's own `frameVitals` over the centre 50% band of real
// WebKit captures this harness took, at the device profiles named. `file` is
// where each capture was measured from, so the measurement can be repeated by
// hand; `band` is the crop, so it can be repeated EXACTLY.
// -----------------------------------------------------------------------------
const MEASURED = [
  {
    what: "loading shell — „Зареждане на улицата със зебра…\", black canvas (stability i01)",
    file: "reference/loading-shell-i01.png",
    world: false,
    vitals: { distinct: 35, topShare: 0.996, stdLuma: 5.9, busyShare: 0.003, darkShare: 0.997 },
  },
  {
    what: "loading shell (stability i02) — the same frame twice, 2 minutes apart",
    file: "reference/loading-shell-i02.png",
    world: false,
    vitals: { distinct: 35, topShare: 0.996, stdLuma: 5.9, busyShare: 0.003, darkShare: 0.997 },
  },
  {
    what: "loading shell (stability i03)",
    file: "reference/loading-shell-i03.png",
    world: false,
    vitals: { distinct: 35, topShare: 0.996, stdLuma: 5.9, busyShare: 0.003, darkShare: 0.997 },
  },
  // A FIXTURE THAT LIVED AT A PATH THE SWEEP ITSELF WRITES IS NOT A FIXTURE.
  //
  // This row was the service-worker offline card („Телефонът ти е офлайн") —
  // 57 distinct / 0.862 top / 43.9 std / 0.095 busy / 0.879 dark, the row that
  // showed `busyShare` alone does not separate the classes. It pointed at
  // `.out/stability/FAILED__simulator-drive__iphone16-portrait.png`, which is
  // the path EVERY failed run of this route on this device writes. A sweep on
  // 2026-08-05 failed that row and overwrote it, and the frame is gone.
  //
  // Stated rather than quietly re-measured, because "the numbers moved" and
  // "the file was replaced" are different facts and the test that caught this
  // said so itself: re-derive, do not adjust. The arrangement is now fixed —
  // every remaining reference lives under `.out/reference/`, which no probe
  // writes to — and this row is retired instead of being re-pointed at a frame
  // that is not the one it describes. It can be re-created by running the
  // sweep against a stopped dev server.
  {
    what:
      "THE CANVAS THAT WENT OUT MID-ROW — the world rendered, then blanked before the capture. " +
      "This is the frame the end-of-row gate now refuses (2026-08-05, simulator-drive portrait).",
    file: "reference/world-went-out-midrow-portrait.png",
    world: false,
    vitals: { distinct: 44, topShare: 0.977, stdLuma: 18.4, busyShare: 0.016, darkShare: 0.989 },
  },
  {
    what: "THE C8 FRAME — black canvas, lesson menu open, „Пауза\" stacked on it (portrait)",
    file: "reference/c8-black-menu-pause-portrait.png",
    world: false,
    vitals: { distinct: 110, topShare: 0.592, stdLuma: 49.7, busyShare: 0.023, darkShare: 0.864 },
  },
  {
    what: "THE C8 FRAME — the same, landscape, behind the „996 ms\" half of the row",
    file: "reference/c8-black-menu-pause-landscape.png",
    world: false,
    vitals: { distinct: 101, topShare: 0.422, stdLuma: 49.8, busyShare: 0.035, darkShare: 0.851 },
  },
  {
    what: "a real street, driving (portrait)",
    file: "reference/world-driving-portrait.png",
    world: true,
    vitals: { distinct: 456, topShare: 0.153, stdLuma: 54.1, busyShare: 0.136, darkShare: 0.11 },
  },
  {
    what: "a real street, ambient (portrait)",
    file: "reference/world-ambient-portrait.png",
    world: true,
    vitals: { distinct: 463, topShare: 0.141, stdLuma: 52.6, busyShare: 0.139, darkShare: 0.11 },
  },
  {
    what: "a real street with the intro popup still over it (portrait)",
    file: "reference/world-landing-portrait.png",
    world: true,
    vitals: { distinct: 450, topShare: 0.141, stdLuma: 60, busyShare: 0.117, darkShare: 0.186 },
  },
  {
    what: "a real street, driving (landscape) — the calmest real world in the set",
    file: "reference/world-driving-landscape.png",
    world: true,
    vitals: { distinct: 431, topShare: 0.239, stdLuma: 37.3, busyShare: 0.225, darkShare: 0.136 },
  },
  {
    what: "a real street, ambient (landscape)",
    file: "reference/world-ambient-landscape.png",
    world: true,
    vitals: { distinct: 410, topShare: 0.227, stdLuma: 35.4, busyShare: 0.213, darkShare: 0.133 },
  },
];

// ---------------------------------------------------------------- (1) THE GATE
test("the gate rejects every frame the probe actually recorded, and accepts every real street", () => {
  for (const frame of MEASURED) {
    const verdict = isWorldFrame(frame.vitals);
    assert.equal(
      verdict.ok,
      frame.world,
      frame.world
        ? `a REAL WORLD was rejected — ${frame.what}: ${verdict.reason}. A gate that refuses ` +
          `real frames turns the probe off, which is the same silence by another route.`
        : `NOT A WORLD was accepted — ${frame.what}. This is the frame row C8's number came ` +
          `from; accepting it is the original defect.`,
    );
  }
});

test("the C8 frame is rejected for the right reason — colour statistics alone do not decide it", () => {
  const c8 = MEASURED.find((f) => f.what.startsWith("THE C8 FRAME — black")).vitals;
  const world = MEASURED.find((f) => f.what.startsWith("a real street, driving (landscape)")).vitals;

  // The trap: a dialog on black is HIGH CONTRAST. If `minStdLuma` were the
  // discriminator, the shell would score better than the product.
  assert.ok(
    c8.stdLuma > world.stdLuma,
    `the premise of this whole gate: the C8 shell's luminance spread (${c8.stdLuma}) is higher ` +
      `than a real landscape world's (${world.stdLuma}), so contrast cannot be what decides`,
  );
  assert.ok(
    isWorldFrame({ ...c8, distinct: 999, topShare: 0.1, darkShare: 0.1 }).ok === false,
    "with colour and darkness forced to world-like values the C8 frame must STILL fail — on " +
      "spatial texture, the property a flat dialog cannot fake",
  );
});

test("each limit is a limit — moving any one of the five past its threshold flips the verdict", () => {
  const good = { distinct: 456, topShare: 0.153, stdLuma: 54.1, busyShare: 0.136, darkShare: 0.11 };
  assert.ok(isWorldFrame(good).ok, "the control frame must pass before anything is perturbed");
  const breaks = [
    ["distinct", WORLD_FRAME.minDistinct - 1],
    ["topShare", WORLD_FRAME.maxTopShare + 0.01],
    ["stdLuma", WORLD_FRAME.minStdLuma - 1],
    ["busyShare", WORLD_FRAME.minBusyShare - 0.01],
    ["darkShare", WORLD_FRAME.maxDarkShare + 0.01],
  ];
  for (const [key, value] of breaks) {
    const verdict = isWorldFrame({ ...good, [key]: value });
    assert.equal(verdict.ok, false, `${key}=${value} must be rejected — otherwise the limit is decoration`);
    assert.ok(verdict.reason && verdict.reason.length > 0, `${key} must say WHY, so a refusal is readable`);
  }
});

// ---------------------------------------------------------- (2) THE ARITHMETIC
/** Minimal 8-bit RGB PNG encoder, so a frame can be built pixel by pixel. */
function encodePng(width, height, paint) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = y * (width * 3 + 1) + 1 + x * 3;
      raw[i] = r & 0xff;
      raw[i + 1] = g & 0xff;
      raw[i + 2] = b & 0xff;
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "latin1"), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("the PNG decoder round-trips — the statistics are read off the pixels that were written", () => {
  const png = encodePng(8, 4, (x, y) => [x * 8, y * 16, 255 - x * 8]);
  const { width, height, channels, data } = decodePng(png);
  assert.equal(width, 8);
  assert.equal(height, 4);
  assert.equal(channels, 3);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const i = (y * 8 + x) * 3;
      assert.deepEqual([data[i], data[i + 1], data[i + 2]], [x * 8, y * 16, 255 - x * 8], `pixel ${x},${y}`);
    }
  }
});

test("a cleared buffer measures as a cleared buffer — the loading shell, from pixels", () => {
  const black = frameVitals(encodePng(120, 120, () => [4, 5, 9]));
  assert.equal(black.distinct, 1, "one colour");
  assert.equal(black.topShare, 1, "which owns the whole frame");
  assert.equal(black.stdLuma, 0, "no contrast");
  assert.equal(black.busyShare, 0, "and no neighbour anywhere differs");
  assert.equal(isWorldFrame(black).ok, false);
});

test("A DIALOG ON BLACK IS NOT A WORLD — the exact shape of the C8 frame, from pixels", () => {
  // Flat dark field; a bright panel with hard text-like edges painted over it.
  // This is what the C8 capture IS: high contrast, several colours, no texture.
  const png = encodePng(200, 200, (x, y) => {
    const inPanel = x > 50 && x < 150 && y > 60 && y < 140;
    if (!inPanel) return [6, 7, 12];
    const isGlyph = x % 11 < 4 && y % 13 < 6;
    return isGlyph ? [240, 244, 250] : [24, 30, 44];
  });
  const v = frameVitals(png);
  assert.ok(v.stdLuma > WORLD_FRAME.minStdLuma, `a dialog has plenty of contrast (${v.stdLuma})`);
  const verdict = isWorldFrame(v);
  assert.equal(verdict.ok, false, "and it is still not a world");
  assert.match(
    verdict.reason,
    /distinct colours|varies between neighbouring|near-black|owns/,
    "the refusal must name a structural property, not a coincidence",
  );
});

/**
 * A synthetic street: bands of differently-hued material — sky, facades,
 * foliage, road, a lane marking — with INDEPENDENT per-channel noise. ONE
 * generator, shared by every test that needs a frame the gate must accept, so
 * "what a scene looks like" is defined in a single place and two tests cannot
 * quietly disagree about it.
 *
 * WHAT THIS IS AND IS NOT. It is a STRUCTURAL stand-in — it has the properties
 * a render has and a dialog does not: many hues, low share for any one colour,
 * variation between neighbouring pixels, nothing near-black. It is NOT
 * photometrically a frame of this product; its `busyShare` (~0.87) is far above
 * a real capture's (0.117–0.225) because independent per-pixel noise is much
 * rougher than real geometry. Nothing may be calibrated from it. The limits in
 * `WORLD_FRAME` come from `MEASURED` above — real captures — and this generator
 * exists only to prove the gate is not simply "reject everything".
 *
 * The first attempt at this used a one-dimensional gradient plus shared noise
 * and produced 35 distinct colours — fewer than the loading shell — because
 * when r, g and b all move together the 4-bit quantiser collapses them onto a
 * single diagonal through the cube. That is worth knowing: a scene is not
 * "bright and noisy", it is HUE-VARIED, and that is the property `distinct`
 * measures.
 */
function sceneFrame(size = 220, seed = 12345) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return encodePng(size, size, (x, y) => {
    const v = y / size;
    const u = x / size;
    let base;
    if (v < 0.34) base = [150 + v * 210, 170 + v * 150, 205 - v * 60];
    else if (v < 0.5) base = [90 + ((x * 13) % 90), 96 + ((y * 29) % 80), 104 + ((x * 7) % 70)];
    else if (v < 0.56) base = [40 + ((x * 17) % 60), 110 + ((x * 23) % 90), 44 + ((y * 11) % 50)];
    else base = [66 + ((x * 5) % 46) + v * 30, 68 + ((y * 3) % 44) + v * 26, 70 + ((x * 11) % 40)];
    if (v > 0.6 && Math.abs(u - 0.5) < 0.02) base = [214, 216, 208];
    return base.map((c) => Math.max(0, Math.min(255, Math.round(c + rnd() * 34 - 17))));
  });
}

test("a textured scene passes — the gate is not simply 'reject everything'", () => {
  const v = frameVitals(sceneFrame());
  const verdict = isWorldFrame(v);
  assert.equal(
    verdict.ok,
    true,
    `a textured scene must be accepted, else the probe can never record anything: ${verdict.reason} ` +
      `(${JSON.stringify(v)})`,
  );
});

test("frameVitals crops to the region it is given — the centre band, not the HUD", () => {
  // THE CASE THIS PROTECTS: a busy HUD around a dead canvas. Sampling the whole
  // surface would let the chrome carry a blank world past the gate, which is
  // why `worldVitals` clips to the middle of the canvas. Half scene, half flat:
  // the region argument has to isolate one from the other.
  const scene = decodePng(sceneFrame(200, 99));
  const png = encodePng(200, 200, (x, y) => {
    if (x < 100) return [10, 10, 10];
    const i = (y * scene.width + x) * scene.channels;
    return [scene.data[i], scene.data[i + 1], scene.data[i + 2]];
  });
  const left = frameVitals(png, { x: 0, y: 0, width: 100, height: 200 });
  const right = frameVitals(png, { x: 100, y: 0, width: 100, height: 200 });
  assert.equal(left.distinct, 1, "the flat half has one colour");
  assert.equal(isWorldFrame(left).ok, false, "and is not a world");
  assert.ok(right.distinct > WORLD_FRAME.minDistinct, `the scene half has many (${right.distinct})`);
  assert.equal(isWorldFrame(right).ok, true, "and is");
  assert.ok(right.busyShare > left.busyShare, "with far more neighbour-to-neighbour variation");
  // Whole-frame sampling averages the two into a verdict about neither.
  const whole = frameVitals(png);
  assert.ok(
    whole.darkShare > right.darkShare,
    `sampling everything drags the measurement toward the dead half ` +
      `(${whole.darkShare} vs ${right.darkShare}) — that is why the live path clips`,
  );
  assert.throws(
    () => frameVitals(png, { x: 400, y: 0, width: 50, height: 50 }),
    /outside a 200x200 image/,
    "a region off the edge is a mistake, not a silent empty measurement",
  );
});

// ------------------------------------------------------ (3) THE PROBE'S DUTIES
test("the driving route DECLARES that it needs a world — the requirement travels with the route", () => {
  const driving = ROUTES.find((r) => r.id === "simulator-drive");
  assert.ok(driving, "the driving route must exist — row C8 is about it");
  assert.equal(
    driving.requiresWorld,
    true,
    "`waitFor: \"canvas\"` at state:attached is satisfied by an empty black rectangle. The route " +
      "has to say it needs more than that, or the next probe repeats C8.",
  );
});

test("waitForWorld REFUSES rather than records when the canvas never draws", async () => {
  // A page that has a canvas of a believable size which never paints anything.
  const page = {
    evaluate: async (fn) =>
      typeof fn === "function" && fn.length > 0
        ? null // loadingText's needle search: no loading card in the DOM
        : { x: 0, y: 0, width: 400, height: 800 },
    screenshot: async () => encodePng(200, 400, () => [0, 0, 0]),
    waitForTimeout: async () => {},
  };
  const result = await waitForWorld(page, { timeoutMs: 40, pollMs: 5 });
  assert.equal(result.ready, false, "a canvas that never draws must never be reported as ready");
  assert.ok(result.reason, `and the refusal must say why: ${result.reason}`);
  assert.ok(result.timeline.length > 0, "with a timeline, so the refusal is auditable");
  assert.ok(
    result.timeline.every((t) => t.ok === false),
    "no black frame may ever be scored as a world, not even once",
  );
});

test("ONE LUCKY FRAME DOES NOT OPEN THE GATE — a scene, then black, then a scene", async () => {
  // The failure this guards: a single good read during a fade-in, a loading
  // card's flash, or one frame drawn before the assets swap back to black.
  // The sequence below is scene / black / scene / scene, so a gate that
  // accepted the first read would report ready at read 1 and be wrong.
  const sequence = ["scene", "black", "scene", "scene"];
  const seen = [];
  const page = {
    evaluate: async (fn) => (typeof fn === "function" && fn.length > 0 ? null : { x: 0, y: 0, width: 400, height: 800 }),
    screenshot: async () => {
      const kind = sequence[Math.min(seen.length, sequence.length - 1)];
      seen.push(kind);
      return kind === "scene" ? sceneFrame(200, 7 + seen.length) : encodePng(200, 200, () => [2, 3, 6]);
    },
    waitForTimeout: async () => {},
  };
  const result = await waitForWorld(page, { timeoutMs: 5_000, pollMs: 1, consecutive: 2 });
  assert.equal(result.ready, true, `a genuinely rendered scene must eventually be recognised: ${result.reason}`);
  assert.equal(
    seen.length,
    4,
    `the gate must open only on the two CONSECUTIVE scenes at reads 3 and 4, not on the lone ` +
      `scene at read 1 (it opened after ${seen.length}: ${seen.join(", ")})`,
  );
  assert.equal(result.timeline[0].ok, true, "read 1 was a real scene and is scored as one");
  assert.equal(result.timeline[1].ok, false, "read 2 was black and resets the streak");
});

/**
 * The probe's source with comments removed.
 *
 * NECESSARY, not fastidious: the fix for the Escape defect is DESCRIBED at
 * length in a comment that quotes the offending call verbatim, so a naive
 * source scan matches the explanation and reports the defect as still present.
 * A test that cannot tell code from prose about code is worth nothing here.
 */
function probeCode() {
  return readFileSync(join(HERE, "stability-probe.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("the source scan can tell code from prose about code — the negative control", () => {
  const sample = [
    "// this used to be page.keyboard.press(\"Escape\") and it was wrong",
    "/* also mentioned here: keyboard.press('Escape') */",
    "const url = \"https://example.test/x\"; // not a comment start",
    "await trigger.click();",
  ].join("\n");
  const stripped = sample.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(
    /keyboard\s*\.\s*press\s*\(\s*["'`]Escape["'`]/.test(stripped),
    false,
    "prose mentioning the call must not read as the call",
  );
  assert.match(stripped, /await trigger\.click\(\);/, "and real code must survive");
  assert.match(stripped, /https:\/\/example\.test\/x/, "a URL is not a line comment");
  // …and the scan must still SEE a real one. Without this the stripper could
  // delete everything and every assertion below would pass on an empty string.
  assert.ok(
    /keyboard\s*\.\s*press\s*\(\s*["'`]Escape["'`]/.test(`${stripped}\nawait page.keyboard.press("Escape");`),
    "a genuine Escape press must still be detected after stripping",
  );
  assert.ok(probeCode().length > 5_000, `the stripped probe must still be a program (${probeCode().length} chars)`);
});

test("the close phase never presses the key that OPENS the pause menu", () => {
  // modules/sim/engine/input.ts:272 — `if (e.code === "Escape")
  // this.callbacks.onTogglePause?.();`, documented at line 14 as "Escape —
  // pause menu". Pressing it in a phase named `overlayClose` measured a SECOND
  // overlay appearing, and that phase carried the worst timing in row C8.
  const source = probeCode();
  const pressesEscape = /keyboard\s*\.\s*press\s*\(\s*["'`]Escape["'`]/.test(source);
  assert.equal(
    pressesEscape,
    false,
    "stability-probe.mjs presses Escape again. On the driving shell that OPENS the „Пауза\" modal, " +
      "so the overlayClose phase would once more be timing an overlay appearing.",
  );
  assert.match(
    source,
    /row\.overlayCloseFailed\s*=\s*true/,
    "a close that did not close anything must be RECORDED, not averaged into the budget",
  );
});

test("the verdict says so when the number is mostly the probe, not the app", () => {
  // THE DEEPEST OF THE FOUR. `settle.ms` is wall clock around a polling loop
  // whose every read is a `page.evaluate` round trip, and those round trips are
  // charged to the app. The worst sample in the last recorded sweep —
  // `.out/stability/stability.json`, re-derived, not quoted — was 32,144 ms of
  // which 31,881 ms (99.2%) was `evalMs`, while `atRestMs` said the layout had
  // stopped moving at 1,477 ms. That cuts both ways: on a loaded box it fails
  // the app for the box's sins; on a quiet one it passes anything at all,
  // including a black canvas. So the verdict has to name it.
  const source = probeCode();
  assert.match(source, /evalShare/, "the share of measured time owed to the instrument must be computed");
  assert.match(
    source,
    /INSTRUMENT-BOUND/,
    "and when it dominates, the verdict must say the number is not about the product",
  );
  assert.match(
    source,
    /atRestMs/,
    "and report when the layout ACTUALLY came to rest, which is the number the budget was meant to be about",
  );
});

test("a lost run is a failed row — a quarter of the sample cannot vanish quietly", () => {
  const source = readFileSync(join(HERE, "stability-probe.mjs"), "utf8");
  assert.match(
    source,
    /r\.iterationsOk\s*<\s*r\.iterations/,
    "the --repeat sweep that produced C8 dropped run #04 in BOTH passes and printed a clean " +
      "table. Losing a sample is a finding about the measurement and must fail the row.",
  );
  assert.match(
    source,
    /LOST \$\{r\.iterations - r\.iterationsOk\}/,
    "and it must be printed, with the count and the errors, where the verdict is read",
  );
});

// --------------------------------------------- the captures, when they are here
test("MEASURED still matches the frames on disk", (t) => {
  const present = MEASURED.filter((f) => existsSync(join(CAPTURES, f.file)));
  if (present.length === 0) {
    // LOUD, not silent. `.out/` is gitignored scratch, so a clean checkout has
    // none of these — that is expected and is not a pass to be proud of.
    t.diagnostic(
      `SKIPPED: none of the ${MEASURED.length} reference captures are on this box ` +
        `(looked under ${CAPTURES}). The table above is therefore asserted, not re-measured. ` +
        `Re-create them with: node tools/mobile/stability-probe.mjs -r simulator-drive`,
    );
    t.skip("no reference captures on this box");
    return;
  }
  for (const frame of present) {
    const png = readFileSync(join(CAPTURES, frame.file));
    const { width, height } = decodePng(png);
    // The same centre 50% band `worldVitals` samples live.
    const w = Math.round(width * 0.5);
    const h = Math.round(height * 0.5);
    const v = frameVitals(png, {
      x: Math.round((width - w) / 2),
      y: Math.round((height - h) / 2),
      width: w,
      height: h,
    });
    for (const key of ["distinct", "topShare", "stdLuma", "busyShare", "darkShare"]) {
      assert.equal(
        v[key],
        frame.vitals[key],
        `${frame.file} ${key}: table says ${frame.vitals[key]}, the frame now measures ${v[key]}. ` +
          `Either the arithmetic changed or the capture was replaced — re-derive, do not adjust.`,
      );
    }
    assert.equal(isWorldFrame(v).ok, frame.world, `${frame.file}: verdict changed`);
  }
  t.diagnostic(`re-measured ${present.length} of ${MEASURED.length} reference captures from pixels`);
});
