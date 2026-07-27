# 69 — Headless clip production (Claude produces the mistake clips himself)

**Status:** active · supersedes the founder-in-the-loop recording step of doc 66.
**Origin:** founder question (2026-07-21): *"why do I have to open the browser to do anything at all?"* — the recording must be the machine's job, not a human's. This doc is the answer.

## The problem it fixes

The first clip rig (`/dev/clip-capture`) screen-records the 3D scene in real time with the browser's `MediaRecorder`. That needs a **visible, GPU-backed, foreground tab** — because browsers freeze `requestAnimationFrame` the moment a tab is hidden. The only such tab in our setup is the founder's, so every recording batch required the founder to sit on the page for ~20 minutes. It also died at ~clip 12 four rounds running (20 live WebGL contexts + real-time capture exhausting 16 GB).

A driving-sim mistake replay is **fully deterministic** — the same committed trace produces the same drive every time. So it never needed real-time screen capture at all. It can be rendered **frame by frame, offline, in a headless browser Claude controls**.

## The architecture

```
clip-rig.mjs ──> (prunes its cache, starts `next dev` on :3200 with its own
     │            distDir, warms /dev/clip-headless, then delegates)
     ↓
render-all.mjs ──> render-clip.mjs (one child process per clip)
                        │
                        ├─ Playwright launches HEADLESS Chromium (real GPU:
                        │  ANGLE→D3D11 on the GTX 1060; SwiftShader fallback)
                        │
                        ├─ loads /dev/clip-headless?template=X&mistake=N
                        │  (mounts the SAME CaptureScene the real-time rig uses)
                        │
                        ├─ steps the shared clock start→end at 1/30 s:
                        │     seek(t) → wait 2 fresh frames → grab canvas
                        │     (toDataURL off the preserved WebGL backbuffer)
                        │
                        ├─ enforces the R1 actor gate (readChecklist)
                        ├─ ffmpeg stitches the PNG frames → seekable VP9 .webm
                        ├─ saves the 5 R0 keyframes (start·f−2·FAULT·f+2·end)
                        └─ upserts public/clips/manifest.json
```

Key property: everything CaptureScene renders is a **pure function of the clock** (camera, ghost, overlays; the world advances in small forward steps). So the same seek sequence renders the same frames on any machine — the whole point of doc 66. The offline renderer never forks the scene; it drives the exact production path through a new dev-only control surface.

### The control surface (`/dev/clip-headless`)

Dev-only route (404 in prod). Mounts `CaptureScene` and publishes `window.__clipHeadless`:

| member | meaning |
|---|---|
| `state` | `"loading" → "ready" → "error"` (poll until ready) |
| `meta` | id/view/startSec/endSec/faultTimeSec/keyframeAt/… (built via the exported `loadRun` — byte-identical window/keyframes to the real-time rig) |
| `frameCount` | live rendered-frame counter (the fresh-frame gate) |
| `seek(t)` | set the shared clock to one value |
| `readChecklist()` | the R1 actor checklist after stepping past the fault |

## Commands (from `tools/clips/headless/`)

**Use the rig. It is one command and it starts its own server.**

```bash
npm install                                  # one-time: playwright + chromium
node clip-rig.mjs <templateId> <n>           # ONE clip → webm + 5 keyframes + manifest
node clip-rig.mjs --all [--only-missing]     # the whole pilot, unattended
node clip-rig.mjs --status                   # is the rig up? how big are the caches?
node clip-rig.mjs --stop                     # shut the rig server down
node contact-sheet.mjs --all --base http://localhost:3200   # R0 vision review sheets
```

`clip-rig.mjs` starts (or reuses) its own `next dev` on **:3200** and delegates to the
existing `render-clip.mjs` / `render-all.mjs` unchanged. The low-level scripts still work
against any server if you pass `--base` yourself.

Measured on the dev box (GTX 1060), 1280×720 / 30 fps:

| | wall clock |
|---|---|
| first render after `--stop` (cold server + route compile + 14 s clip) | **281 s**, of which 58 s is the server |
| every render after that (warm rig, 12 s clip) | **80–190 s** — the spread is other agents' load on the box, not the rig |
| route compile, `/dev/clip-headless` | **20–21 s** |

(Headless GPU = ~30 fps; the SwiftShader software fallback is ~1 fps — kept only so WebGL
never hard-fails on a GPU-less host.)

---

## Why the rig exists: the 2026-07-27 stall

For most of a day `/dev/clip-headless` could not be rendered at all. Two agents in a row
concluded the route was broken and gave up; `public/clips/` still holds their evidence —
three empty `.frames_*` directories, created and never written to. Measured, not reported:

* a plain `GET /dev/clip-headless` on the shared `:3000` dev server returned **nothing for
  433 s** and then died with the server. Earlier attempts sat at `○ Compiling
  /dev/clip-headless ...` for 35+ minutes and never resolved.
* the dev server burned **~0 s of CPU** across a 60 s sample *with that request pending*.
  It was not compiling. It was blocked on disk.
* Next said so itself: `⚠ Slow filesystem detected. The benchmark took 468ms.`

**The route was never the problem.** Turbopack keeps a persistent LSM cache under
`<distDir>/dev/cache/turbopack`. It had grown to **12.4 GB across 19,447 files**, unpruned
since 2026-07-10, and `.next` lives on E: — a 7200 rpm **mechanical** disk where a random
4 KB read costs ~79 ms against 0.33 ms on C:, a 240× difference. Every module lookup was a
seek into a 12 GB LSM. The tell that settles it: a 5-module, 17 KB `/dev/cluster` took
**112 s** on that same server, while `/dev/ghost-demo` — a *bigger* module graph than
clip-headless, sim and all — compiled in ~1 s when its entries happened to be cache-warm.

So the fix is not "shrink the module graph" and not "split CaptureScene". It is: **give the
render path its own build directory, keep that directory small, and keep a server warm on
it.**

### What the rig does

1. **Prunes** its Turbopack cache when it passes `--cache-limit` (default 2 GB). This is
   the actual disease — the cache is never pruned, so it grows until every lookup is a
   seek. After four renders the rig's cache is **0.33 GB / 212 files** against the shared
   server's **11.3 GB / 15,184 files**.
2. Runs `next dev -p 3200` with `KNIJKA_DIST_DIR=.next-rig` (`next.config.ts` reads that
   env var; unset it is exactly `.next`, so every normal build is unaffected). Never
   :3000 — that is other agents' surface, and the whole point is that a render must not
   depend on their server's health.
3. **Warms** `/dev/clip-headless` once and *prints the compile seconds*, so a regression
   shows up as a number instead of as a hang.
4. Runs the existing renderer against the rig. Same page, same `CaptureScene`, same seek
   loop, same ffmpeg arguments.

### Two traps that cost a render cycle each — do not re-learn them

* **`localhost`, never `127.0.0.1`.** Next 16 blocks cross-origin requests to `/_next/*`
  dev resources by default. A server started as `next dev -p 3200` treats `127.0.0.1` as a
  foreign host, so the IP form gets the HTML but **every dev chunk and the HMR socket are
  refused**. The page still returns 200, `window.__clipHeadless` never appears, and
  `render-clip.mjs` times out at `waitForFunction` after 120 s looking exactly like "the
  scene is broken". The dev-server log is the only place that says what really happened.
* **`next dev` rewrites `tsconfig.json`.** On startup it adds its distDir's generated types
  to `include` — and reformats every inline array while it is there, producing a 14-line
  diff in a *committed* file describing a *gitignored* directory. The rig snapshots the
  file before starting the server and restores it after. Two developers share this repo
  (doc 61); a stray `tsconfig.json` in `git status` with no author is not acceptable.

### Reclaiming the shared server's cache

`node clip-rig.mjs --prune-shared` deletes `.next/dev/cache/turbopack` and **refuses while
anything is listening on :3000**, because deleting the cache under a live Turbopack yields a
dev server that half-works and lies about why. Whoever owns :3000 stops it, runs this,
starts it again; the next compile is slow exactly once. A virgin cache rebuilds to ~440 MB.

---

## Determinism: what is actually true (measured, 2026-07-27)

Doc 66 calls these clips deterministic, and the pipeline is built for it — a committed
`ScenarioTrace`, never re-simulated physics. **Renders are not byte-identical, and never
were.** Two consecutive renders of `sc-sign-warning__m0` from the *same warm server* and the
*same compiled bundle* produced different bytes:

```
SSIM Y 0.9688  All 0.9778        PSNR Y 34.30 dB  (360 frames)
```

Looking at the frames rather than the hashes (doc 66 R0), the difference is **rain-particle
phase only**. An amplified difference map of the fault keyframe is flat everywhere except
the rain streaks: camera pose, vehicle positions, actor placement, the ❌ fault marker and
the whole HUD are pixel-identical. The weather particle system advances per rendered frame
rather than as a pure function of the shared clock, so the number of rAFs the renderer spent
waiting between seeks leaks into the image. It is the one thing in `CaptureScene` that is
not clock-pure.

Two consequences, and both matter:

* **Do not gate anything on a clip's hash.** A re-render of an unchanged scene will differ.
  Compare with SSIM/PSNR, or look at the frames.
* **This is not the rig's doing, and cannot be.** Both renders came from one server, one
  distDir, one compiled bundle. `KNIJKA_DIST_DIR` selects where compiled output is *cached*;
  it cannot reach the scene. The variance is intrinsic and pre-dates the rig.

Worth fixing separately: seed the weather particles from the clip clock so a re-render is
reproducible. Until then, byte-faithfulness is not a property this pipeline has, and any
document that claims it is overstating the case.

### Why the rig is NOT a production build

Serving `/dev/*` from a `next build` was the obvious way to make renders fast, and it was
rejected. A production build runs the whole app with `NODE_ENV === "production"`, and this
codebase branches on that inside the sim layer — `LessonScene`'s perf probe and ghost demo,
`engine/input`'s key log. None of those sit on `CaptureScene`'s path *today*, but "not on
the path today" is not a proof of pixel equality, and doc 66 R0 says look before you ship.
It would also have meant relaxing the `/dev/*` production gate, on a product whose users are
minors, to save a compile the rig already made cheap.

**The `/dev/*` gate is untouched.** `platform/src/app/dev/__tests__/dev-surfaces-gated.test.ts`
now fails if any `/dev/**` page or `/api/dev/**` route loses its
`process.env.NODE_ENV === "production"` gate, gains an `&&`/`||` env-var escape hatch, or if
`KNIJKA_DIST_DIR` ever reaches application code. Both failure modes were verified by
breaking them on purpose. The deploy path was grepped: neither `tools/deploy/*.sh`,
`tools/deploy/knijka.cron` nor `.github/workflows/ci.yml` sets `KNIJKA_DIST_DIR` or
`NODE_ENV` — the deploy runs `npm run build` and `next start`, so the gate stays closed.

## The gate (doc 66 R0 stays law)

Nothing reaches the founder uncertified. After a batch:

1. `node contact-sheet.mjs --all` → `sheets/<id>.strip.png` (5-up) + `faults-grid.png`.
2. **Claude LOOKS** at every strip with vision and certifies each clip against its doc-66 requirements card (R1 actors present at the fault, R2 governing control in frame, R3 fault at the engine time, R4 cabin faults show the dashboard, R5 no render defects, R6 something happens). The R1 gate is *also* enforced mechanically in `render-clip.mjs` (a clip whose required actors never framed writes nothing).
3. Only certified clips are uploaded: `bash tools/upload-clips.sh` (scp to the VPS + `pm2 restart knijka` — Next caches `public/` at startup).
4. The founder does the **taste pass only**, on already-certified clips, at the staging `/review/clips` gallery. Never the operator.

## Files

- `tools/clips/headless/clip-rig.mjs` — **the entry point.** Owns the render server, the cache budget and the `tsconfig.json` snapshot/restore. Everything else below is what it drives.
- `tools/clips/headless/` — `render-clip.mjs`, `render-all.mjs`, `contact-sheet.mjs`, `probe-frame.mjs`, `gpu-probe.mjs`, `webgl-smoke.mjs`, `package.json` (its own `node_modules`; **not** part of the Next app, never shipped). `.rig/` holds the server pid + log and is gitignored.
- `platform/next.config.ts` — `distDir` reads `KNIJKA_DIST_DIR`; unset it is `.next`, unchanged.
- `platform/src/app/dev/__tests__/dev-surfaces-gated.test.ts` — fails if a dev surface would be reachable in a default production build.
- `platform/src/app/dev/clip-headless/` — the control-surface route (dev-only).
- `platform/src/app/dev/clip-capture/clip-capture-client.tsx` — exports `loadRun` + `ClipRun` (the shared run builder). The real-time rig stays as-is for anyone who prefers to record interactively; the headless path is the default for scale.

## Two-dev note

Clip media is gitignored (doc 66). Whoever produces clips runs the headless batch locally and uploads; the manifest (committed) is the shared source of truth. No teammate ever needs to babysit a recording tab.
