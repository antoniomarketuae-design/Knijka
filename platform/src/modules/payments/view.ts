/**
 * payments/view — the BROWSER-side public surface of the payments module.
 *
 * Same split, and the same reasoning, as `@/modules/clips/view`: the main
 * barrel (`@/modules/payments`) reaches the entitlement store, and therefore
 * `lib/db` → `@prisma/adapter-pg` → `pg`, which requires `node:net`/`node:tls`.
 * A `"use client"` island that imports a VALUE from it does not merely ship
 * dead weight — Turbopack cannot resolve those node builtins for the browser
 * and the production build fails. That is exactly what the /checkout consent
 * island did when it reached for the consent copy.
 *
 * So: anything a client island legitimately needs from payments is re-exported
 * here, and everything re-exported here must be pure data over leaf modules.
 * Type-only edges (`PackId`) are erased by tsc and cost nothing, so they are
 * safe to widen; value edges are not.
 *
 * `__tests__/view-barrel-weight.test.ts` walks this barrel's static module
 * graph and fails if the store — or anything else that reaches the database —
 * ever becomes reachable from it.
 */

// The consent copy (H-9). The strings a buyer reads AND the strings stored as
// proof are the same constant, which is why it lives in a leaf module both
// sides can import (consentCopy.ts explains why that matters).
export { CHECKOUT_CONSENT_TEXTS_BG } from "./consentCopy";
export type { CheckoutConsentKind } from "./consentCopy";

// Pack identity, so an island can be typed by which pack it is selling without
// importing the catalogue's runtime.
export type { PackId } from "./packs";
