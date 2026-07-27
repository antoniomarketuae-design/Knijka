/**
 * Door policy — the whole of "three doors, one engine", in one table.
 *
 * The founder's decision (docs/00 product map, safety differentiator) is that
 * hazard perception is reachable from three places: free inside the simulator,
 * as its own paid section, and as a theory lesson step. The trap in that
 * decision is obvious the moment you start building: three entry points invite
 * three implementations, and six weeks later „hazard in theory" scores
 * differently from „hazard in the section" and the safety claim is worthless
 * because the numbers cannot be pooled.
 *
 * So the rule this file exists to enforce is: A DOOR MAY CHANGE WHO IS LET IN
 * AND HOW LONG THE RUN IS. IT MAY NOT CHANGE WHAT A REACTION IS WORTH.
 *
 * Length lives in HAZARD_RUN_LENGTH (attempts.ts, next to the code that uses
 * it); admission lives here. Between them they are the complete list of things
 * a door is allowed to vary — and both are consumed by the SAME start path, so
 * a fourth surface is a row in two tables, not a fourth code path.
 */

import type { HazardDoor } from "@/components/hazard/types";

/**
 * Does this door need an active pack?
 *
 * Only the standalone section does. The reasoning is commercial and it is worth
 * writing down, because "the safety feature is the paid one" reads badly at
 * first glance:
 *
 *  - The two EMBEDDED doors are free because their job is coverage. Hazard
 *    perception only becomes a safety claim if enough students actually do it,
 *    and a student who never meets it contributes no data to the ДАИ outcome
 *    correlation (@/modules/outcomes) the claim will eventually rest on. Gating
 *    the free doors would be selling the evidence we need to collect.
 *  - The SECTION is paid because a differentiator has to be visible to be sold.
 *    It is the long-form version: a real sitting, history, progress over time.
 *
 * NOTE the function does not enforce anything — it answers. Enforcement belongs
 * at the server action, because a server action is a public POST endpoint and a
 * gate inside a helper the action may forget to call is decoration
 * (@/modules/payments quota.ts says the same thing at more length).
 */
export function hazardDoorRequiresPack(door: HazardDoor): boolean {
  return door === "section";
}
