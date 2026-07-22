# 69 — Headless clip production (Claude produces the mistake clips himself)

**Status:** active · supersedes the founder-in-the-loop recording step of doc 66.
**Origin:** founder question (2026-07-21): *"why do I have to open the browser to do anything at all?"* — the recording must be the machine's job, not a human's. This doc is the answer.

## The problem it fixes

The first clip rig (`/dev/clip-capture`) screen-records the 3D scene in real time with the browser's `MediaRecorder`. That needs a **visible, GPU-backed, foreground tab** — because browsers freeze `requestAnimationFrame` the moment a tab is hidden. The only such tab in our setup is the founder's, so every recording batch required the founder to sit on the page for ~20 minutes. It also died at ~clip 12 four rounds running (20 live WebGL contexts + real-time capture exhausting 16 GB).

A driving-sim mistake replay is **fully deterministic** — the same committed trace produces the same drive every time. So it never needed real-time screen capture at all. It can be rendered **frame by frame, offline, in a headless browser Claude controls**.

## The architecture

```
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

## Commands (from `tools/clips/headless/`, dev server on :3000)

```bash
npm install                              # one-time: playwright + chromium
node render-clip.mjs <templateId> <n>    # one clip → webm + 5 keyframes + manifest
node render-all.mjs                      # the whole pilot, unattended
node render-all.mjs --only-missing       # re-render only clips lacking a webm
node contact-sheet.mjs --all             # tile keyframes for R0 vision review
```

Measured on the dev box (GTX 1060): **~58 s/clip** end-to-end at 1280×720 / 30 fps.
→ 20 clips ≈ 20 min, ~450 clips ≈ 7–8 h, fully unattended. (Headless GPU = ~30 fps; the SwiftShader software fallback is ~1 fps — kept only so WebGL never hard-fails on a GPU-less host.)

## The gate (doc 66 R0 stays law)

Nothing reaches the founder uncertified. After a batch:

1. `node contact-sheet.mjs --all` → `sheets/<id>.strip.png` (5-up) + `faults-grid.png`.
2. **Claude LOOKS** at every strip with vision and certifies each clip against its doc-66 requirements card (R1 actors present at the fault, R2 governing control in frame, R3 fault at the engine time, R4 cabin faults show the dashboard, R5 no render defects, R6 something happens). The R1 gate is *also* enforced mechanically in `render-clip.mjs` (a clip whose required actors never framed writes nothing).
3. Only certified clips are uploaded: `bash tools/upload-clips.sh` (scp to the VPS + `pm2 restart knijka` — Next caches `public/` at startup).
4. The founder does the **taste pass only**, on already-certified clips, at the staging `/review/clips` gallery. Never the operator.

## Files

- `tools/clips/headless/` — `render-clip.mjs`, `render-all.mjs`, `contact-sheet.mjs`, `probe-frame.mjs`, `gpu-probe.mjs`, `webgl-smoke.mjs`, `package.json` (its own `node_modules`; **not** part of the Next app, never shipped).
- `platform/src/app/dev/clip-headless/` — the control-surface route (dev-only).
- `platform/src/app/dev/clip-capture/clip-capture-client.tsx` — exports `loadRun` + `ClipRun` (the shared run builder). The real-time rig stays as-is for anyone who prefers to record interactively; the headless path is the default for scale.

## Two-dev note

Clip media is gitignored (doc 66). Whoever produces clips runs the headless batch locally and uploads; the manifest (committed) is the shared source of truth. No teammate ever needs to babysit a recording tab.
