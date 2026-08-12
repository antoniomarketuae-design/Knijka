/**
 * What ships out of platform/public, and how heavy it is allowed to be.
 * (Audit 2026-07-24, findings M-28 and M-29.)
 *
 * TWO PROBLEMS, ONE DECLARATION.
 *
 * M-28 — the deploy carries ~330 MB nobody ever requests. `deploy.sh` puts the
 * live tree on the target commit with `git reset --hard`, so EVERY tracked
 * byte under public/ lands on the VPS: the 210 keyframe PNGs that exist only
 * as the founder's R0 vision evidence (247 MB), the scene-stills consumed by
 * dev routes that 404 in production (57.7 MB), and the source PNGs the KTX2
 * encoder was fed (21.6 MB). None of them is reachable from a student session.
 *
 * M-29 — nothing stops it growing back. `next/image` is used zero times, the
 * generators write whatever they write, and the 1.1 MB posters that H-10 had
 * to undo got in exactly that way. A ceiling only works if something fails
 * when it is crossed, so `check-asset-budget.mjs` exits non-zero and runs in
 * the same vitest gate as everything else.
 *
 * THE RULE THAT MAKES THIS SURVIVE: every file under public/ must match a
 * bucket. An unclassified path is a FAILURE, not a default. That is what makes
 * the next `public/whatever/` dir a deliberate decision — someone has to state
 * whether it ships and what it may weigh.
 *
 * `ship: "dev"` does NOT mean "delete": these are working assets (encoder
 * sources, review evidence) that belong in the repo. It means the deploy
 * prunes them from the live tree — see prune-public.mjs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO NUMBERS, AND THIS FILE USED TO KNOW ONLY ONE (2026-08-11).
 *
 * Everything above measures BYTES ON DISK. That is DEPLOY SIZE — the repo, the
 * git history, the VPS tree, the CI artifact — and it is a real constraint. It
 * is also silent about the number that matters to a 17-year-old on Bulgarian
 * mobile data:
 *
 *   DEPLOY SIZE      bytes under platform/public/. Lazy loading does not move
 *                    it by one byte. Paid once, by us.
 *   SESSION DOWNLOAD what ONE STUDENT pulls over the wire in one sitting.
 *                    Paid every time, by them, out of a data plan.
 *
 * The two diverge the moment an asset is fetched on demand rather than at page
 * load, and `traces` has been making that claim in prose since M-28 („heavy on
 * disk, light on the wire") with no number attached to it and nothing able to
 * fail. FR-19 forced the issue: thirteen 10–15 s tutorial clips at the measured
 * ~5–9 MB each are ~117 MB of deploy AND ~117 MB of session if the card fetches
 * them without being asked.
 *
 * So SESSION_MODELS below states, per feature, what a single session can pull
 * and what it costs when the student presses play on nothing. Read `sessionCosts`
 * for the arithmetic and the one thing it cannot see from disk.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Buckets, matched IN ORDER — the first matching bucket wins, so narrow rules
 * come before the directory they live in.
 *
 *   match         (rel) => boolean, on a POSIX-style path relative to public/
 *   ship          "prod" = deployed · "dev" = pruned from the live tree
 *   maxBytes      ceiling for the bucket's total
 *   maxFileBytes  ceiling for any SINGLE file in it (optional)
 *   why           what it is and who reads it
 *
 * Ceilings sit ~15-30% above today's measured weight: enough headroom that
 * ordinary authoring does not trip them, tight enough that a category mistake
 * (a PNG where a WebP belongs) does.
 */
export const BUCKETS = [
  {
    id: "clips-video",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".webm"),
    ship: "prod",
    maxBytes: 140_000_000,
    // ~2.6 MB average today. A reel that lands at 10 MB is a render-settings
    // slip, not a longer clip.
    maxFileBytes: 8_000_000,
    why: "The mistake reels themselves — the product's biggest differentiator.",
  },
  {
    id: "clips-poster",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".webp"),
    ship: "prod",
    maxBytes: 8_000_000,
    // THE H-10 TRIPWIRE. The posters this replaced averaged 1,150.9 KB each
    // and were displayed in a box clamped to 140-240 px high — a 36-74x
    // overshoot that shipped because nothing measured it. 120 KB is roughly
    // 4x the current average: generous for a wider frame, impossible for a
    // full-size screenshot.
    maxFileBytes: 120_000,
    why: "Fault-keyframe posters (WebP q78 @854px) shown before a reel plays.",
  },
  {
    id: "clips-keyframes",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".png"),
    ship: "dev",
    maxBytes: 300_000_000,
    why: "R0 vision evidence (doc 66): the founder + Claude inspect these. Never fetched by a student — the manifest points at the WebP.",
  },
  {
    id: "clips-manifest",
    match: (rel) => rel === "clips/manifest.json",
    ship: "prod",
    maxBytes: 1_000_000,
    why: "The reel index the learning module resolves questions against.",
  },
  {
    id: "clips-docs",
    match: (rel) => rel.startsWith("clips/"),
    ship: "dev",
    maxBytes: 100_000,
    why: "READMEs and stray working files next to the reels.",
  },
  {
    id: "scene-stills",
    match: (rel) => rel.startsWith("scene-stills/"),
    ship: "dev",
    maxBytes: 80_000_000,
    why: "Consumed only by /dev/verdict-board and /dev/scene-still, which do not exist in production.",
  },
  {
    id: "gallery-stills",
    match: (rel) => rel.startsWith("gallery-stills/"),
    // SHIPS, unlike scene-stills: /review/gallery is an admin route on the
    // real app (the founder reviews on staging, on his phone), not a /dev one.
    ship: "prod",
    // 155 stills at the 854 px / q78 poster contract measure 2.2 MB total,
    // ~14 KB each. The ceiling is ~3× that so the catalogue can keep growing;
    // a single still over 200 KB means the WebP encode step was skipped.
    maxBytes: 7_000_000,
    maxFileBytes: 200_000,
    why: "One review still per scenario template — the founder's visual verdict surface (/review/gallery).",
  },
  {
    id: "sim-textures-ktx2",
    match: (rel) => rel.startsWith("sim/textures/") && !rel.endsWith(".png"),
    ship: "prod",
    maxBytes: 5_200_000,
    // The two normal maps are ~1.26 MB each; anything larger means a UASTC
    // setting slipped.
    maxFileBytes: 1_600_000,
    why: "The shipping ground PBR sets. Tier-gated since H-11: low pulls 509,615 B of this, high 4,465,053 B.",
  },
  {
    id: "sim-textures-src",
    match: (rel) => rel.startsWith("sim/textures/") && rel.endsWith(".png"),
    ship: "dev",
    maxBytes: 30_000_000,
    why: "The source PNGs the KTX2 encoder was fed (tools/glb/pack_ground_textures.mjs). They are also the loader's last-resort fallback — but that path already degrades further, to the procedural canvas textures, so production does not need 21.6 MB standing by for it.",
  },
  {
    id: "sim-env",
    match: (rel) => rel.startsWith("sim/env/"),
    ship: "prod",
    maxBytes: 6_000_000,
    maxFileBytes: 2_000_000,
    why: "HDRI environments for image-based lighting. Not fetched at the low tier (H-11).",
  },
  {
    // NARROW FIRST — before sim-tutorial-clip, which matches the directory.
    id: "sim-tutorial-poster",
    match: (rel) =>
      rel.startsWith("sim/tutorial/") &&
      (rel.endsWith(".webp") || rel.endsWith(".jpg") || rel.endsWith(".png")),
    ship: "prod",
    // THE THIRD NUMBER: what the thirteen cards cost when the student presses
    // play on nothing. 500 KB for the whole set, and it is the ONLY tutorial
    // byte a session pulls without being asked — see SESSION_MODELS.
    maxBytes: 500_000,
    // MEASURED, not inherited: the first real poster (adjust-seat.webp,
    // 2026-08-11) is 27,496 B, so thirteen of them are ~349 KB — which is
    // exactly the „a few hundred KB for all thirteen" this is supposed to buy.
    // The house WebP contract it was cut to (854 px, q78) measures 13.9 KB
    // across the 157 gallery stills and 17.6 KB across the 230 clip posters,
    // so 27.5 KB is already the wide end of normal. 40 KB is ~45% over the
    // measured poster: room for a busier frame, impossible for a screenshot.
    // 13 x 40 KB = 520 KB > the 500 KB total ON PURPOSE — the set cannot all
    // sit at the per-file max without someone looking at the total.
    maxFileBytes: 40_000,
    why: "Poster frames for the FR-19 clips — the still a card shows before (and instead of) fetching 9 MB of video.",
  },
  {
    id: "sim-tutorial-clip",
    match: (rel) => rel.startsWith("sim/tutorial/"),
    ship: "prod",
    // ── WHY THIS WENT FROM 2.5 MB TO 119 MB, AND WHAT STILL SAYS NO ──────────
    // It was DELIBERATELY SIZED FOR ONE CLIP on 2026-08-10 so clip #2 could not
    // land silently and would force this conversation. (It also had to come
    // before sim-models, whose own `why` says Draco-compressed GLB — the first
    // mp4 landed there unnoticed and took that bucket to 3.72 MB against a
    // 3.00 MB ceiling.) The conversation happened; the founder ratified the
    // full set of thirteen. So the ceiling is now sized for thirteen — honestly,
    // and with two separate things that can still refuse.
    //
    // 1. THE TOTAL (deploy). 13 clips at the heavier measured weight is ~117 MB
    //    added to a 195 MB prod tree. That is the deploy cost of FR-19 stated
    //    out loud, not a rounding error. 125 MB is ~23% over a realistic set
    //    (the measured pair averages 7.5 MB → ~98 MB for thirteen), inside this
    //    file's stated 15-30% convention. Note it is deliberately BELOW
    //    13 x maxFileBytes (156 MB): a whole set of maximal clips fails here
    //    even though every single file passed.
    // 2. THE LUMP (per file) — and now that loading is on demand, this is the
    //    one that binds. One 30 MB clip is worse for a student than six 5 MB
    //    ones, because it is paid in a single unskippable go.
    //    PROVENANCE, because this file's rule is measure-don't-inherit and only
    //    half of this was measurable here: the ONLY tutorial clip on disk is
    //    adjust-seat.mp4 at 2,022,418 B (stat'd 2026-08-11, and gated against
    //    its own declared `bytes` by procedures/__tests__/predrive-clip-weight).
    //    The Kling 3.0 pair this ceiling is cut for — 5.4 MB (seat) and 9.0 MB
    //    (walk-around, the heaviest step by nature: most motion, hardest to
    //    compress) — comes from the render lane's report, NOT from a stat here;
    //    neither file is in the tree. Read as MiB (the stricter reading), 9.0 MB
    //    is 9,437,184 B, so 12 MB is ~27% over the worst reported render, inside
    //    the same convention, and fails the 30 MB case by 2.5x. If a real
    //    walk-around lands heavier than 12 MB, re-measure and move this line
    //    with a reason — do not quietly widen it.
    //    It is also a BITRATE ceiling in disguise: duration is
    //    separately gated to the founder's 10-15 s (procedures/tutorial.ts), so
    //    12 MB is 6.4-9.6 Mbps and a breach means the encode slipped, never
    //    that the clip got longer.
    maxBytes: 125_000_000,
    maxFileBytes: 12_000_000,
    why: "FR-19 pre-drive tutorial clips — one generated clip per checklist step, fetched ONLY when the student presses play. Every step also has an inline-SVG still that costs zero bytes and works offline (hud/PreDriveStill.tsx).",
  },
  {
    id: "sim-models",
    match: (rel) => rel.startsWith("sim/"),
    ship: "prod",
    maxBytes: 3_000_000,
    why: "The district kit: buildings, vehicles, signs, streetscape props, vegetation — Draco-compressed GLB.",
  },
  {
    id: "world",
    match: (rel) => rel.startsWith("world/"),
    ship: "prod",
    maxBytes: 1_500_000,
    why: "District JSON — the drivable topology every lesson loads.",
  },
  {
    id: "traces",
    match: (rel) => rel.startsWith("traces/"),
    ship: "prod",
    maxBytes: 80_000_000,
    why: "Recorded drives (S1 shadow-drive + follow-line). Fetched ONE at a time, per lesson — heavy on disk, light on the wire.",
  },
  {
    id: "decoders",
    match: (rel) => rel.startsWith("basis/") || rel.startsWith("draco/"),
    ship: "prod",
    maxBytes: 3_000_000,
    why: "KTX2/Draco wasm transcoders. On the critical path to the first frame.",
  },
  {
    id: "app-models",
    match: (rel) => rel.startsWith("models/"),
    ship: "prod",
    maxBytes: 1_000_000,
    why: "Non-district GLB used outside the simulator canvas.",
  },
  {
    id: "hero-loop",
    match: (rel) => rel.startsWith("hero/"),
    ship: "prod",
    maxBytes: 1_500_000,
    // THE TRIPWIRE THAT MATTERS HERE. This is the only asset in the tree that
    // a visitor fetches before they have read a word, on a phone, on mobile
    // data — it is the still plate's replacement, and the moment it stops
    // being cheap it stops being worth having (the plate is 0 requests). Two
    // sources are declared, ONE is fetched: the browser picks the first
    // <source> it can decode, so the per-file ceiling is the real budget and
    // the bucket ceiling only stops a third rendition creeping in.
    maxFileBytes: 700_000,
    why: "The pre-rendered marketing hero loop (VP9 + H.264) every phone gets instead of a still plate — see components/marketing/hero/HeroLoopVideo.tsx.",
  },
  {
    // Before `brand`, because it lives inside icons/ — the header's "narrow
    // rules come before the directory they live in" rule.
    id: "pwa-splash",
    match: (rel) => rel.startsWith("icons/splash/"),
    ship: "prod",
    // 18 plates (9 iPhone form factors x 2 orientations) measure 228 KB total,
    // ~13 KB each: they are a flat #05070c ground with the mark on it, so an
    // 8-bit palette PNG is effectively lossless. The ceiling is ~3x that, which
    // leaves room for iPads later and still fails loudly if someone re-renders
    // them in truecolour — that alone would be ~4.5 MB.
    maxBytes: 700_000,
    // A single plate over 60 KB means the flat ground grew a gradient and the
    // palette started dithering. See scripts/generate-icons.mjs.
    maxFileBytes: 60_000,
    why: "iOS launch images (apple-touch-startup-image). Without them a standalone launch flashes WHITE before the cockpit paints.",
  },
  {
    id: "app-shell",
    match: (rel) => rel === "sw.js" || rel === "offline.html",
    ship: "prod",
    // Two hand-written text files. The ceiling is here to make it obvious if
    // someone ever bundles a framework into the service worker.
    maxBytes: 60_000,
    why: "The service worker and the self-contained offline page it serves when the network is gone.",
  },
  {
    id: "brand",
    match: (rel) => rel.startsWith("icons/") || rel === "og.png",
    ship: "prod",
    maxBytes: 400_000,
    maxFileBytes: 150_000,
    why: "Favicons, PWA icons and the OG card — every one of them is on the landing page's critical path.",
  },
];

/**
 * SESSION MODELS — the second number the bucket table cannot answer.
 *
 * A bucket total says what WE ship. A session model says what ONE STUDENT
 * pulls, and it needs one fact per bucket that no filesystem knows: WHEN the
 * browser fetches it.
 *
 *   upfront    fetched because the feature opened, whether or not the student
 *              asked for anything. This is the floor, and it is the only part
 *              a student cannot decline.
 *   onDemand   fetched only on an explicit act — pressing play. Capped by the
 *              bucket total (they can ask for everything), but not paid by
 *              default.
 *
 * WHAT THIS CANNOT SEE, AND WHERE IT IS PROVEN INSTEAD. `onDemand` is a claim
 * about a component, not about disk. If a <video> regains `autoPlay`, or loses
 * `preload="none"`, every byte in the onDemand bucket silently becomes upfront
 * and the floor below becomes the ceiling — with no file on disk changing size,
 * so nothing here would notice. That is the same shape as the defect the audit
 * called out for draw calls: a static estimate standing in for a runtime fact,
 * wrong for months. So each model names the source file its floor depends on and
 * the test that pins it. `idleRequires` is not a comment — it is the pointer to
 * the half of this gate that lives elsewhere.
 *
 * Be precise about what that half is worth. For FR-19 it is a SOURCE scan, not
 * a render: `vitest.config.ts` runs in `environment: "node"`, and the card
 * renders through `createPortal` behind an effect, so server markup would be an
 * empty string forever and a markup assertion would pass against nothing. The
 * zero-bytes-until-tap fact was measured once, by hand, in WebKit on
 * /dev/predrive-rig with the network panel open; the source scan's job is to
 * keep the code that was measured the code that ships. That is weaker than a
 * runtime assertion and it is written down here so nobody upgrades it in their
 * head later.
 */
export const SESSION_MODELS = [
  {
    id: "predrive-tutorial",
    title: "FR-19 pre-drive tutorial — one student, thirteen cards, one lesson",
    /** The thirteen PreDriveStepIds. One card, one clip, at most one fetch each. */
    steps: 13,
    upfront: ["sim-tutorial-poster"],
    onDemand: ["sim-tutorial-clip"],
    /**
     * THE FLOOR: thirteen cards opened in order, play pressed on nothing.
     * Deliberately equal to the sim-tutorial-poster ceiling — a test asserts
     * they stay equal, so the duplication is gated rather than drifting. This
     * is the founder's „a few hundred KB for all thirteen".
     */
    maxIdleBytes: 500_000,
    idleRequires:
      "hud/PreDriveTutorial.tsx never puts `src` on the <video> until the student taps play " +
      '(preload="none" on top, hand teardown on unmount) — pinned by ' +
      "hud/__tests__/predrive-clip-lazy.test.ts, and measured once in WebKit on /dev/predrive-rig",
    why:
      "Only one <video> exists at a time (the open card) and React destroys it on a step change, " +
      "so the worst case is each clip fetched once — not thirteen in flight. Lazy loading does NOT " +
      "lower that worst case: thirteen played once is thirteen. What it buys is that the worst case " +
      "stops being the DEFAULT, and the floor drops from ~117 MB to the posters.",
  },
];

/** POSIX-ise a path so the rules read the same on Windows and on the VPS. */
export function toRel(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join("/");
}

/** The bucket a public/-relative path belongs to, or null if undeclared. */
export function classify(rel) {
  return BUCKETS.find((b) => b.match(rel)) ?? null;
}

/** Every file under `dir`, as public/-relative POSIX paths. */
export function walk(root, dir = root) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, abs));
    else if (entry.isFile()) out.push(toRel(root, abs));
  }
  return out;
}

/**
 * Weigh public/ against the declaration.
 *
 * Returns per-bucket totals plus the two things a gate acts on: `violations`
 * (a hard failure) and `unclassified` (also a hard failure — see the header).
 */
export function scanPublic(root) {
  const files = walk(root);
  const byBucket = new Map(
    BUCKETS.map((b) => [b.id, { bucket: b, bytes: 0, files: 0, biggest: { rel: "", bytes: 0 } }]),
  );
  const unclassified = [];
  const oversizeFiles = [];

  for (const rel of files) {
    const bucket = classify(rel);
    const bytes = statSync(path.join(root, rel)).size;
    if (!bucket) {
      unclassified.push({ rel, bytes });
      continue;
    }
    const acc = byBucket.get(bucket.id);
    acc.bytes += bytes;
    acc.files += 1;
    if (bytes > acc.biggest.bytes) acc.biggest = { rel, bytes };
    if (bucket.maxFileBytes && bytes > bucket.maxFileBytes) {
      oversizeFiles.push({ rel, bytes, bucket: bucket.id, limit: bucket.maxFileBytes });
    }
  }

  const buckets = [...byBucket.values()];
  const violations = [
    ...buckets
      .filter((b) => b.bytes > b.bucket.maxBytes)
      .map((b) => ({
        kind: "bucket",
        id: b.bucket.id,
        bytes: b.bytes,
        limit: b.bucket.maxBytes,
      })),
    ...oversizeFiles.map((f) => ({
      kind: "file",
      id: `${f.bucket}: ${f.rel}`,
      bytes: f.bytes,
      limit: f.limit,
    })),
  ];

  const sum = (ship) =>
    buckets.filter((b) => b.bucket.ship === ship).reduce((n, b) => n + b.bytes, 0);

  return {
    buckets,
    unclassified,
    violations,
    totalBytes: buckets.reduce((n, b) => n + b.bytes, 0) + unclassified.reduce((n, f) => n + f.bytes, 0),
    prodBytes: sum("prod"),
    devBytes: sum("dev"),
  };
}

/**
 * What ONE STUDENT pulls, per session model — the wire number, next to the
 * disk number, so neither can be quoted as the other.
 *
 * Each model yields three figures and one violation channel:
 *
 *   idle       bytes a student cannot decline: the feature opened, they asked
 *              for nothing. Gated by `maxIdleBytes`.
 *   worstCase  they asked for everything once — every card, every clip. Not
 *              separately gated: it IS the sum of the bucket ceilings, and
 *              gating it twice would just be two numbers to keep in step. It
 *              is REPORTED because it is what a data plan actually feels.
 *   biggestFetch  the largest single unskippable lump. Now that loading is on
 *              demand this is the figure that binds — one 30 MB clip is worse
 *              for a student than six 5 MB ones. Gated by the onDemand
 *              bucket's `maxFileBytes`, which the bucket table already fails on.
 *
 * `measured` is today's tree. `permitted` is what the declaration allows once
 * every step is authored — reported because `measured` is VACUOUS on a fresh
 * clone: the clips are large media, and large media in this repo has a history
 * of not being in git (public/clips/* is gitignored and scp'd). A ceiling that
 * only bites on the one box holding the files is not a ceiling.
 */
export function sessionCosts(scan) {
  const byId = new Map(scan.buckets.map((b) => [b.bucket.id, b]));
  /**
   * THROWS on an unknown id rather than skipping it. A session model names its
   * buckets by string, so renaming a bucket would otherwise drop it silently
   * and the model would report a comfortable 0 MB — the precise shape of green
   * this gate exists to refuse.
   */
  const pick = (ids) =>
    ids.map((id) => {
      const row = byId.get(id);
      if (row === undefined) {
        throw new Error(`session model names bucket "${id}", which no longer exists in BUCKETS`);
      }
      return row;
    });
  const total = (rows, f) => rows.reduce((n, b) => n + f(b), 0);

  return SESSION_MODELS.map((model) => {
    const upfront = pick(model.upfront);
    const onDemand = pick(model.onDemand);

    const measured = {
      idleBytes: total(upfront, (b) => b.bytes),
      onDemandBytes: total(onDemand, (b) => b.bytes),
      upfrontFiles: total(upfront, (b) => b.files),
      onDemandFiles: total(onDemand, (b) => b.files),
      biggestFetch: onDemand.reduce(
        (best, b) => (b.biggest.bytes > best.bytes ? b.biggest : best),
        { rel: "", bytes: 0 },
      ),
    };
    measured.worstCaseBytes = measured.idleBytes + measured.onDemandBytes;

    const permitted = {
      idleBytes: total(upfront, (b) => b.bucket.maxBytes),
      onDemandBytes: total(onDemand, (b) => b.bucket.maxBytes),
      biggestFetchBytes: onDemand.reduce(
        (n, b) => Math.max(n, b.bucket.maxFileBytes ?? b.bucket.maxBytes),
        0,
      ),
    };
    permitted.worstCaseBytes = permitted.idleBytes + permitted.onDemandBytes;

    const violations =
      measured.idleBytes > model.maxIdleBytes
        ? [
            {
              kind: "session-idle",
              id: model.id,
              bytes: measured.idleBytes,
              limit: model.maxIdleBytes,
            },
          ]
        : [];

    return { model, measured, permitted, violations };
  });
}

export function mb(bytes) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Bytes as KB — the poster/idle figures are unreadable in MB. */
export function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * The unit that makes a BREACH readable. Reporting the poster floor in MB
 * printed „0.5 MB > 0.5 MB" — a failure message that shows no daylight between
 * the value and the limit tells the reader nothing about how far over they are.
 */
export function size(bytes) {
  return bytes < 1_048_576 ? kb(bytes) : mb(bytes);
}
