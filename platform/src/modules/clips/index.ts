/**
 * clips module — public API (audit M-20).
 *
 * The mistake-clip pipeline used to live in six places with no owner:
 * `lib/clips/`, `modules/learning/clipPlan*`, `components/theory/clip*`,
 * `app/dev/*` and `tools/clips/`. It is the most actively developed feature in
 * the product and it was the direct cause of every cross-module deep import
 * into the simulator, because "which recorded drive demonstrates this theory
 * mistake?" is a question neither `learning` nor `sim` owns. This module owns
 * it, and it is the ONLY place allowed to reach across that boundary.
 *
 * The pipeline, in order, and where each stage lives:
 *
 *   SELECT   whyPanel.ts        question id → the ev-* scenario event → the
 *                               recorded mistake demo that shows the fault.
 *   PILOT    clipPilot.ts       that resolver, folded into the clip list the
 *                               capture rig records (one per representative).
 *   PLAN     clipPlanBuilder.ts doc 66 requirements card per clip (engine-
 *                               computed fault time, R1/R2/R4). NODE ONLY.
 *            clipPlan.generated.ts  its committed output — what everything
 *                               else reads.
 *   CAPTURE  capture/           the /dev rig's pure logic (trim windows,
 *                               chunking, ghost feed, actor checks) + the
 *                               manifest WRITER.
 *   PUBLISH  view/clipManifest  the manifest READER — the shared contract.
 *   PLAY     view/, replay/     what the browser renders.
 *
 * WHAT IS DELIBERATELY NOT ON THIS BARREL, and why. This module spans the
 * server, a node-only generator and three browser surfaces, so a single fat
 * barrel would be a bundle-weight trap of exactly the kind audit M-26 measured
 * (a re-export is a static edge whether or not the symbol is called):
 *
 *  - `./clipPlanBuilder` — node-only (`node:fs` + the whole recorder stack via
 *    sim/traces/clipReplay). Its consumers are the freshness gate, the
 *    generator wrapper and the R0 forensic tests; they import it by path.
 *  - `./capture/*` — the rig pulls sim/runtime, sim/traffic and sim/orchestrator.
 *    It is reachable only from `/dev` routes and must stay that way.
 *  - `./replay/*` — the 2D canvas cores borrow `sampleAt` from the sim/traces
 *    barrel so the flat replay can never drift from the 3D ghost. That edge is
 *    real and heavy; only the components that draw a canvas may pay it.
 *  - `./view/*` — the browser-light surface (manifest reader, why-panel fold,
 *    the webm duration workaround). It has its OWN barrel, `@/modules/clips/view`,
 *    which is guaranteed free of the simulator by
 *    `__tests__/view-barrel-weight.test.ts`. Client components import THAT, not
 *    this file, because everything below reaches the scenario catalogue.
 *
 * So: this barrel is the SERVER/BUILD side. `@/modules/clips/view` is the
 * BROWSER side. Both are public; the split is the contract.
 */

// SELECT — THEO-2 Stage 1 (doc 64): question id → stored explanation +
// citations (+ the scenario drill demonstrating the fault). Reads the content
// repo, so callers must have initialized it (`@/lib/content/loader`).
export { resolveWhyPanel } from "./whyPanel";
export type {
  WhyPanelExperienceRef,
  WhyPanelMistakeRef,
  WhyPanelPayload,
  WhyPanelSimRef,
} from "./whyPanel";

// The generated question id → ev-* map the resolver reads (committed because
// docs/ is unreadable at runtime; freshness is gated by whyPanel.test.ts).
// Public because the coverage board audits the map itself, not the resolver.
export { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";

// PILOT — the derived clip list the /dev/clip-capture rig records (one clip per
// resolvable event's representative mistake). Pure static data.
export { clipIdFor, clipPilotList } from "./clipPilot";
export type { ClipPilotEntry } from "./clipPilot";

// PLAN — the generated per-clip requirements card (doc 66): engine-computed
// fault time + R1/R2/R4. PLAN writes it, the RIG consumes it verbatim,
// /review/clips renders it. Pure static data — never the builder.
export { CLIP_PLAN, clipPlanForId } from "./clipPlan.generated";
export type {
  ClipGoverningControl,
  ClipPlanEntry,
  ClipRequiredActor,
  ClipView,
} from "./clipPlan.generated";
