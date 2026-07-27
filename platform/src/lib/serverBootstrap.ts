/**
 * Server bootstrap — the one place a module port gets its production
 * implementation.
 *
 * WHY THERE HAS TO BE A THIRD PARTY. @/modules/hazard-play owns the item-engine
 * port and must not import @/modules/hazard: the dependency is inverted on
 * purpose, so the delivery layer, its three doors and their tests compile and
 * run without the engine, and so a test can swap the engine out (hazard-play
 * engine.ts writes the reasoning down). Something outside BOTH modules
 * therefore has to introduce them, and this is it.
 *
 * HOW IT RUNS. As a module-level side effect, exactly like @/lib/content/loader
 * registers the ContentRepo: every server surface that needs it opens with a
 * bare `import "@/lib/serverBootstrap";`. Deliberately NOT instrumentation.ts —
 * Next compiles that file as its own entry, so a singleton registered there is
 * not provably the same instance the route bundles hold, and "the engine is
 * registered" is precisely the thing that must not be probably true.
 *
 * WHAT IS NOT HERE, AND WHY THAT IS NOT AN OMISSION. The stores
 * (setPaymentsStore / setExamStore / setStripeClient / setHazardRunStore) exist
 * so tests can inject a fake; their getters lazily build the real Prisma or
 * Stripe client, so production has nothing to wire. The hazard engine
 * deliberately has no such default: a fallback would have to invent a scoring
 * window — the one measurement the whole safety claim rests on — so when this
 * file is not imported the engine stays honestly absent and the surface says so.
 *
 * Importing this is cheap: the item bank is read from disk lazily, on the first
 * run, not here.
 */

import { hazardEngine } from "@/modules/hazard";
import { setHazardEngine } from "@/modules/hazard-play";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/serverBootstrap is server-only — the engines it registers reach item banks that carry scoring windows",
  );
}

setHazardEngine(hazardEngine);
