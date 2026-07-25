# Module Boundaries

Rules (docs/architecture/05):

1. Each module exposes its public API **only** through its `index.ts`. Importing another module's internals is a review-blocking violation.
2. Business logic lives in modules, not in React components or route handlers — those are thin adapters.
3. `sim` never touches the DB directly; it reports through `learning`/`analytics` APIs.
4. `tutor` never free-recalls law: retrieval over `/content` + citation only (ADR-002).

Modules: `auth` · `learning` · `exam` · `tutor` · `gamification` · `clips` · `content-admin` · `outcomes` · `payments` · `privacy` · `security` · `sim`

## `clips` — the mistake-clip pipeline (audit M-20)

Added because "which recorded simulator drive demonstrates this theory
mistake?" is a question neither `learning` nor `sim` owns, and while it had no
owner the answer lived in six places and produced every cross-module deep import
into the simulator. `clips` is the ONLY module allowed to reach across that
boundary.

It ships **two** public barrels rather than one, and that split is the contract:

| barrel | side | contains |
|---|---|---|
| `@/modules/clips` | server / build | the why-panel resolver, the pilot list, the generated clip plan |
| `@/modules/clips/view` | browser | the manifest reader, the why-panel fold, the webm-duration workaround |

`@/modules/clips` reaches the scenario catalogue by design; `@/modules/clips/view`
never touches the simulator, and `clips/__tests__/module-boundaries.test.ts`
fails if it starts to. Client components import the `view` barrel. The heavy
corners — `clips/replay/*` (2D canvas cores, pull `sim/traces`), `clips/capture/*`
(the `/dev` rig) and `clips/clipPlanBuilder.ts` (node-only) — are deliberately on
neither barrel and are imported by path; a re-export is a static bundle edge
whether or not the symbol is ever called (audit M-26).

## `sim/scene` — the /simulator scene layer's pure logic (audit M-19)

~4,800 LOC of non-React business logic used to live in `components/sim`: the
procedural audio graph, route derivation, the cabin state machine, the world
recipe, the instrument-cluster renderer. It is logic, so it lives in a module;
the R3F components in `components/sim` render what it computes.

`sim/scene` has **no barrel**, on purpose. Its files range from a 22-line
minimap adapter (imported by the theory page's 2D replay) to a 781-line WebAudio
engine that pulls three.js, and a barrel would put the second on the first's
bundle. Import the file you need by path.
