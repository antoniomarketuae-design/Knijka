# public/gallery-stills — one review still per scenario template

The images behind `/review/gallery`, the founder's visual verdict surface.

## Why this folder exists

The verdict board could tell the founder *what* the catalogue contains but
showed him nothing to judge, and his review stalled on exactly that: „to answer
the rest I need visualisations… I have to review all our 150 questions visually
to have a good verdict."

A full mistake reel is minutes of render each — which is why only 42 of ~300
mistakes have one. A scene still is ~6 s on the GPU. So every scenario template
gets ONE deterministic frame: its real committed district, framed on the
learner's car at the moment the recorded shadow drive is *teaching* about, with
the parked neighbours placed and the target bay marked where the district says
there is one.

## Contract

- `sc__<templateId>.webp` — the still. 854 px wide, libwebp q78 (the shared
  poster contract, `tools/clips/headless/webp.mjs`) — the founder reviews on his
  phone, so the whole set is a few MB, not a few hundred.
- `manifest.json` — `{ version, generatedAt, renderedCount, sources, notRendered }`.
  `sources[key]` records HOW the ego pose was resolved (`shadow-trace` /
  `start-position` / `spawn-point`); `notRendered` is the honest gap list the
  gallery's „Липсва" tab is built from.

## Regenerating

Needs a DEV server (the job feed and the render rig are both `/dev` routes) —
use your own lane's port, never a shared one:

```
cd platform && KNIJKA_DIST_DIR=.next-gallery npx next dev -p 3260 --hostname localhost
node tools/gallery/build-gallery-stills.mjs --base http://localhost:3260
```

`--force` re-renders everything, `--only <ids>` a subset, `--limit N` a smoke
run, `--swiftshader` the software fallback for a box with no usable GPU.

The picture-bearing QUESTIONS are not rendered here: their 3D stills already
live in `public/scene-stills/` and come from the older
`tools/clips/headless/render-scene-still.mjs`. The gallery reads that folder
directly, and falls back to the in-app 2D canvas for any question missing one.

## Git and staging

Everything except this README is GITIGNORED — same rule as `/public/clips` and
`/public/scene-stills`: binaries never travel through git. After a batch:

```
scp platform/public/gallery-stills/*.webp platform/public/gallery-stills/manifest.json \
    root@<vps>:/opt/knijka/platform/public/gallery-stills/
```

Untracked files in the VPS checkout survive `deploy.sh`, so the stills stay put
across deploys. A fresh clone shows „Кадърът не е рендиран още" on every card
and lists all of them under „Липсва" — honest, and never a blank page.
