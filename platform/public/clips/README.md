# public/clips — pre-produced mistake clips (the why-panel video pilot)

Short `.webm` clips of each scenario-template mistake, produced by replaying
the committed mistake trace in the REAL 3D engine (the drill demo mode with
the follow camera). The theory why-panel and the „Преживей грешката"
consequence overlay play the clip for a mistake when one exists here; the 2D
top-down canvas replay stays as the fallback (founder ruling). The founder
reviews every clip at `/review/clips` (admin-only) before mass production.

## What is in git vs what is not

- `manifest.json` and this README are COMMITTED. Everything else in this
  folder (the `.webm` binaries and the `.k0..k4.webp` keyframe stills) is
  GITIGNORED — see `platform/.gitignore`.
- A fresh clone therefore has an empty gallery and canvas-only panels.
  Every reader tolerates a missing clip file quietly (falls back to canvas).

## The manifest contract (version 1)

Written by the capture rig, read by the why-panel / overlay / gallery:

```json
{
  "version": 1,
  "clips": [
    {
      "id": "<templateId>__m<mistakeIndex>",
      "templateId": "sc-jx-giveway-b1",
      "mistakeIndex": 0,
      "tracePath": "content/traces/<templateId>/<mistake>.trace.json",
      "src": "/clips/<id>.webm",
      "durationSec": 8.4,
      "recordedAt": "2026-07-20T10:00:00.000Z",
      "titleBg": "<the mistake's stored titleBg>"
    }
  ]
}
```

`tracePath` is EXACTLY `ScenarioSpec.mistakes[i].traceRef.path` (the repo
path). Readers match clips to panels by this path, normalized through
`traceUrlForRepoPath` (`src/components/theory/clipManifest.ts` is the reader
module — keep it in sync with any contract change).

Doc 66 (CaptureScene v2) adds three ADDITIVE per-clip fields — version stays
1, pre-R0 readers ignore them:

- `keyframes`: the five R0 stills `"/clips/<id>.k0..k4.webp"` (window start,
  fault−2, fault, fault+2, window end) — what Claude inspects with vision
  before the founder reviews;
- `actors`: the R1 checklist `[{ "kind", "label", "present" }]` — the plan
  card's required actors vs what the capture actually staged;
- `view`: `"exterior" | "cockpit" | "exterior+dashboard"` (R4).

## Why the stills are WebP

The fault still (`k2`) is the `<video poster>` of every why-panel, and a
browser fetches a poster EAGERLY even under `preload="none"` — so it is the
most-downloaded student-facing asset in the product. As full-res PNGs the 42
posters weighed 47.2 MB (avg 1.15 MB) for a box clamped to 140–240 px tall.
Re-encoded at the poster contract (854 px wide, libwebp q78 —
`tools/clips/headless/webp.mjs`) the same 42 posters weigh **0.77 MB**, and all
210 stills fall from 247.3 MB to 3.7 MB (audit 80, H-10).

No PNG fallback is kept: every browser that can run the R3F simulator these
stills are frames of has supported WebP since 2020. Clips rendered before the
change were converted in place with `node keyframes-to-webp.mjs`, which also
rewrites the manifest URLs; re-running it is a no-op.

## Deploying the binaries to staging

The `.webm` files never travel through git. After a capture batch:

```
scp platform/public/clips/*.webm platform/public/clips/*.webp root@<vps>:/opt/knijka/platform/public/clips/
```

The VPS still holds the old `*.k*.png` stills from earlier batches — nothing
references them once this manifest deploys; delete them there to reclaim the
disk.

Untracked files in the VPS checkout SURVIVE `deploy.sh` (git only touches
tracked paths), so clips stay put across deploys; `manifest.json` itself is
tracked and updates with the normal commit + deploy flow. Keep manifest and
binaries in step: deploy the code/manifest first, scp the clips, then the
founder reviews on staging at `/review/clips`.
