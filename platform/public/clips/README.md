# public/clips — pre-produced mistake clips (the why-panel video pilot)

Short `.webm` clips of each scenario-template mistake, produced by replaying
the committed mistake trace in the REAL 3D engine (the drill demo mode with
the follow camera). The theory why-panel and the „Преживей грешката"
consequence overlay play the clip for a mistake when one exists here; the 2D
top-down canvas replay stays as the fallback (founder ruling). The founder
reviews every clip at `/review/clips` (admin-only) before mass production.

## What is in git vs what is not

- `manifest.json` and this README are COMMITTED. Everything else in this
  folder (the `.webm` binaries) is GITIGNORED — see `platform/.gitignore`.
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

## Deploying the binaries to staging

The `.webm` files never travel through git. After a capture batch:

```
scp platform/public/clips/*.webm root@<vps>:/opt/knijka/platform/public/clips/
```

Untracked files in the VPS checkout SURVIVE `deploy.sh` (git only touches
tracked paths), so clips stay put across deploys; `manifest.json` itself is
tracked and updates with the normal commit + deploy flow. Keep manifest and
binaries in step: deploy the code/manifest first, scp the clips, then the
founder reviews on staging at `/review/clips`.
