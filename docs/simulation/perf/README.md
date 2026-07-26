# Performance measurement artifacts

**Owner:** founder · **Spec:** [`../82_SIM_QUALITY_AND_INNOVATION.md`](../82_SIM_QUALITY_AND_INNOVATION.md) §2.1–§2.4, §6.2 P1

This directory holds **measured** simulator performance runs, one committed
markdown file per run. It exists because of one sentence in doc 82 §6.2:

> **Every number in §2.2 is a prediction until this exists.**

`68_ALPHA_RECONSTRUCTION_PLAN.md:191` — *"Runs on a mid-range Android phone:
30+ fps median at tier-low, <10 s load"* — has been an unchecked box since it
was written, and there is no `.har`, Lighthouse run or trace anywhere in the
repo. Phases P2 onward in doc 82 are gated on a real artifact landing here.

---

## What is measured, and why those things

doc 82 §2.1 is the load-bearing finding: **on a mid-range Android the phone is a
weak CPU, not a weak GPU.** At dpr 1.0 in landscape a Mali-G57 MP2 has roughly
the same fragment-shading headroom *per output pixel* (769 GFLOP/Mpx) as the
Iris Xe laptop the `med` tier was tuned for (800). The phone's real deficits
are draw-call submission on two big cores, JS parse/compile (~0.5–0.8 KB/ms
compressed), and memory (Chromium on Android will not grow a WASM heap past
256 MB).

So the report leads with the things that follow from that, not with an fps
average:

| Line | Why it is in the table |
| --- | --- |
| fps median of 1 s windows | The §2.2 target (**flat 30** at `low`, not a chased 60) |
| fps worst window · frame-time p95 | One number cannot tell a locked 30 from a 45→25 decay |
| **fps last third ÷ first third** | The thermal-decay ratio §7.3 #13 is actually about — this is why a run is 60 s and not 10 s |
| draw calls / frame, **all passes** | The phone's true bottleneck. Includes the mirror RTT pass and the composer's internal passes |
| triangles / frame, all passes | Same accounting |
| WebGL context losses | A run whose context died is never a pass, whatever the fps said (doc 82 §2.3 fix 4) |
| first rendered frame | The "<10 s load" half of the alpha gate |
| script bytes transferred | The §2.1 parse budget — ≤500 KB gz at `low` |
| first-playable wire MB | §2.2 bottom row |

The budget each line is scored against lives in
`platform/src/modules/sim/environment/perfBudget.ts` (`PERF_BUDGETS`), which is
doc 82 §2.2 transcribed verbatim and unit-tested against it.

---

## The procedure

**Reference device:** Samsung Galaxy A16 (Helio G99, Mali-G57 MP2, 4 GB,
1080×2340) — 244.48 лв ≈ €125. Samsung leads Bulgaria at 34.57% mobile vendor
share, and this is the §2.2 `low` column's reference hardware.

> **DevTools device emulation and Android emulators do not emulate the GPU and
> will give a false green** (doc 82 §2.4). The artifact records the unmasked
> `WEBGL_debug_renderer_info` string precisely so a reader can tell an emulated
> run from a real one. If that field says `SwiftShader`, `ANGLE (Google, Vulkan
> 1.3.0 (SwiftShader…` or a desktop GPU, the run is not evidence.

1. **Build and serve production.** A dev build runs unminified React with no
   chunk splitting; its load time and parse cost describe no student's session.
   ```
   cd platform && npm run build && npm run start
   ```
2. **Attach the phone.** USB debugging on, `chrome://inspect` on the laptop,
   inspect the phone's tab. Either put both on the same Wi-Fi and browse to the
   laptop's LAN address, or `adb reverse tcp:3000 tcp:3000` and use
   `http://localhost:3000` on the phone.
3. **Open the sim with `?simPerf=1`.** The flag works in production builds on
   purpose (see `shouldLogPerf` in `LessonScene.tsx`) — it is the only way this
   measurement can be honest. Nothing is transmitted; the probe only writes to
   the console the inspector is already attached to (ADR-004).
4. **Label the run** in the inspected console so two logs are comparable:
   ```js
   __simPerf.scene('d2-v1 city run')
   ```
5. **Drive for at least 60 s.** The report prints itself at 60 s; call
   `__simPerf.report()` at any time to re-print it, or `__simPerf.reset()` to
   start a fresh window set without reloading.
6. **File it.** Copy the whole markdown block, then on the laptop:
   ```
   cd platform && node scripts/perf-report.mjs --stdin      # paste, Ctrl-D
   ```
   (or `--json run.json` for the raw `__simPerf.json()` output). It writes
   `docs/simulation/perf/<date>-<tier>.md` and never overwrites an existing
   run.
7. **Commit it.** If it passed, tick
   `docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md:191` in the same commit.

### The runs worth taking

Take at least these three before declaring P1 closed. Each is one file here.

| Run | Tier | Why |
| --- | --- | --- |
| `d2-v1` city run | `low` | 21.7 km of road, 102 intersections — the heaviest world, and the one §1.2 says reads worst |
| A busy scenario template (traffic + pedestrians) | `low` | The draw-call number the ≤70 budget is really about |
| The same city run on the dev laptop | `med` | The desktop control. Without it a phone number has nothing to be a ratio of |

---

## Reading a filed run

Each file is self-contained: it restates the budget column it was scored
against and the device that produced it, so it still means something after
§2.2 is retuned. Do not edit a filed run — take a new one.

A `WARN` is not a failure; it means the value crossed the soft budget but not
the hard cap. A `FAIL` on `fps-stability` with everything else green is the
signal §7.3 #13 predicts: the device is thermally throttling, and the fix is to
lower the fixed per-frame cost, not to chase a higher peak.
