#!/usr/bin/env node
/**
 * BUILD THE SWEEP'S DRIVE SET FROM THE LIVE CORPUS.
 *
 * For each open lesson, drive exactly the legs its OPEN findings were filed on.
 * Driving a leg no finding cites photographs nothing anyone is waiting for;
 * missing a leg a finding cites leaves that row unprovable for another round.
 *
 * WHY THIS REPLACES `.audit-frames/wave-scripts/build-redrive.mjs`. That one read
 * `.audit-frames/still-batches.json` — a snapshot written by one adjudication
 * round — and `.audit-frames/` is gitignored, so neither the script nor its
 * input was version-controlled and both drifted silently.
 *
 * MEASURED 2026-08-30, and it cost a whole sweep: the w18 run dispatched 29
 * lessons across two shards and drove FIVE DRIVES. The work-list held 87 entries
 * built from a two-day-old batch file containing 222 findings against a live open
 * list of 259, and only 2 of the 29 w18 lessons appeared in it. `wave-c.mjs`
 * SELECTS from this file — `--lessons` filters it, it never adds — so shard 1
 * reported "0 lesson(s) · 0 drive(s) to run" and exited clean. A sweep that
 * drives nothing and exits 0 is the reassuring direction: it looks like a fast
 * round rather than an empty one.
 *
 * So the set is now derived from `corpusCounts().open` at the moment of the
 * sweep, and this file is tracked and tested like every other counter.
 *
 *   node tools/audit/build-redrive.mjs                        every open lesson
 *   node tools/audit/build-redrive.mjs --lessons <file>       restrict to a list
 *   node tools/audit/build-redrive.mjs --out <path>           default waveC-redrive.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BS = String.fromCharCode(92);

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const OUT = flag("--out", path.join(REPO, ".audit-frames", "waveC-redrive.json"));
const LESSONS_FILE = flag("--lessons", null);

const VALID = new Set(["pc-right", "pc-wrong", "mobile-right", "mobile-wrong"]);

/**
 * The leg a frame was photographed on. TWO SHAPES EXIST IN THIS CORPUS and
 * both are load-bearing:
 *
 *   modern  .../<sweep>/frames/<lesson>__<leg>/<file>.png
 *   sweep161 .../sweep161/<lesson>/<leg>/<file>.png
 *
 * Reading only the modern one leaves 44 of the 58 open rows in the w18 lesson
 * set with no leg, which makes the builder fall back to driving ALL FOUR legs
 * for 20 of 29 lessons — 90 drives where 34 would do, most of them
 * photographing legs no finding ever cited. Measured 2026-08-30.
 *
 * Both are answered the same way: a path segment that IS one of the four legs,
 * or a segment ending `__<leg>`. Nothing else counts, so an unrecognised shape
 * returns null and the caller drives all four rather than guessing one.
 */
export function legOfFrame(p) {
  const segments = String(p ?? "").split(BS).join("/").split("/");
  for (let k = segments.length - 1; k >= 0; k -= 1) {
    const seg = segments[k];
    if (VALID.has(seg)) return seg;
    const j2 = seg.indexOf("__");
    if (j2 >= 0 && VALID.has(seg.slice(j2 + 2))) return seg.slice(j2 + 2);
  }
  return null;
}

/**
 * THE LEGS A FINDING NAMES IN PROSE — not the one its screenshot came from.
 *
 * A cross-leg claim is a claim about TWO legs and carries ONE frame, because a
 * frame is one leg. `legOfFrame` therefore contributes half of it, and the
 * sweep photographs half of a two-halved sentence. `sc-turn-left-oncoming`'s
 * row d079e687 — "pc-right records 1 опасна грешка and 10 points, mobile-right
 * records 0 mistakes and 0 points" — has collected TEN verdict lines, and nine
 * of them say the same thing: only the two PC legs of this lesson were
 * re-driven. The judge was right every time; the work-list never sent the
 * mobile half.
 *
 * The other half exists only in `what`, so that is where it is read from.
 * Substring matching against the same `VALID` set `legOfFrame` uses, so the
 * four leg literals have one definition.
 *
 * DO NOT NORMALISE, TRIM OR REWRITE `what` ANYWHERE. `findingId` is
 * `scenario + ":" + sha1(what + "\0" + frame)`; one character edited there
 * orphans every verdict line the row has accumulated. This reads it only.
 */
export function legsInProse(what) {
  const s = String(what ?? "");
  return [...VALID].filter((leg) => s.includes(leg));
}

/**
 * lesson -> { total, critical, legs } over the rows given.
 *
 * A lesson whose findings name NO leg gets an empty list, and `wave-c.mjs`
 * reads that as "drive all four" — which is correct and deliberate: the finding
 * could be on any of them, and guessing one is how coverage counts go wrong.
 *
 * TWO SETS, AND THE UNION CAN ONLY GROW. `frameLegs` is what a screenshot
 * proves; `proseLegs` is what the finding's sentence names. The emitted list is
 * their union — a SUPERSET of what this function returned before, for every
 * lesson, or empty for both.
 *
 * THE EMPTY GUARD IS LOAD-BEARING, and it is the one way this could REDUCE
 * coverage. If no frame names a leg the list must stay `[]`, because `[]` means
 * "drive all four" downstream and all four already contains any prose leg —
 * letting prose populate an otherwise-empty list would turn 4 drives into 1.
 * Measured 2026-08-30: 0 of 114 open lessons are all-frameless, so the guard is
 * LATENT, which is exactly when someone tidying deletes it. `build-redrive.test.mjs`
 * §3(b) goes red if they do.
 */
export function redriveSet(open, { only = null } = {}) {
  const per = new Map();
  for (const f of open) {
    const lesson = f.scenario || f.lesson;
    if (!lesson) continue;
    if (only && !only.has(lesson)) continue;
    const cur = per.get(lesson) || {
      lesson, total: 0, critical: 0, frameLegs: new Set(), proseLegs: new Set(),
    };
    cur.total += 1;
    if (String(f.severity).toLowerCase() === "critical") cur.critical += 1;
    const leg = legOfFrame(f.frame);
    if (leg) cur.frameLegs.add(leg);
    for (const L of legsInProse(f.what)) cur.proseLegs.add(L);
    per.set(lesson, cur);
  }
  // Heaviest-in-critical first: the sweep dispatcher interleaves shards, so the
  // expensive lessons spread across drivers instead of piling on shard 0.
  return [...per.values()]
    .sort((a, b) => b.critical - a.critical || b.total - a.total || a.lesson.localeCompare(b.lesson))
    .map((x) => ({
      lesson: x.lesson,
      total: x.total,
      critical: x.critical,
      // Union only when a frame named a leg — see THE EMPTY GUARD above.
      legs: x.frameLegs.size ? [...new Set([...x.frameLegs, ...x.proseLegs])].sort() : [],
    }));
}

// ---------------------------------------------------------------------- main
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].split(BS).join("/")}`).href;
if (isMain || process.argv[1]?.endsWith("build-redrive.mjs")) {
  const counts = corpusCounts();
  console.log(openListLine(counts));

  let only = null;
  if (LESSONS_FILE) {
    if (!fs.existsSync(LESSONS_FILE)) {
      console.error("no such lessons file: " + LESSONS_FILE);
      process.exit(2);
    }
    only = new Set(
      fs.readFileSync(LESSONS_FILE, "utf8").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    );
  }

  const used = only ? counts.open.filter((f) => only.has(f.scenario || f.lesson)) : counts.open;
  console.log(workedLine("open", used));

  const set = redriveSet(counts.open, { only });
  const drives = set.reduce((n, r) => n + (r.legs.length || 4), 0);

  console.log("lessons in the drive set : " + set.length + (only ? "  (restricted to " + only.size + " named)" : ""));
  console.log("drives it will dispatch  : " + drives);
  const noLeg = set.filter((r) => r.legs.length === 0).length;
  if (noLeg) console.log("lessons whose findings name no leg (all four will be driven): " + noLeg);

  if (only) {
    const missing = [...only].filter((l) => !set.some((r) => r.lesson === l));
    if (missing.length) {
      console.log("");
      console.log(missing.length + " named lesson(s) carry NO open finding and will not be driven:");
      for (const m of missing.slice(0, 20)) console.log("   " + m);
      console.log("   (that is not an error — a lesson with nothing open has nothing to prove)");
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(set, null, 1) + "\n");
  console.log("");
  console.log("wrote " + OUT);
}
