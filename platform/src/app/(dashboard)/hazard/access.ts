/**
 * Who may open a hazard door — ONE decision, every call site.
 *
 * Modelled directly on simulator/access.ts, and for the same reason audit C-3
 * gave for that file: a feature the pricing page sells must have exactly one
 * function that answers "may this account do this?", and every entry point must
 * ask it. A server action is a public POST endpoint, so gating the page alone
 * leaves the action wide open to a hand-crafted request.
 *
 * Two properties come from the shape of the input and are the whole guarantee:
 *  - it takes a SessionUser — server-resolved from a signed cookie — never an
 *    id or a flag off the wire, so a client cannot claim access;
 *  - the entitlement is read from the DB inside getEntitlements, so it can only
 *    exist because a Stripe session was fulfilled.
 *
 * WHICH PACK, AND WHY THE QUESTION IS DELIBERATELY NOT ANSWERED HERE. The
 * check is `hasCore`, i.e. "this account has an active pack" — premium implies
 * core, so both packs pass. That is the honest gate while pricing is undecided
 * (docs/business/41; /pricing itself prints no comparative price claim): the
 * founder has not chosen which pack carries hazard training, and encoding a
 * guess would silently create a product tier nobody agreed to. When the packaging
 * lands, this one expression changes and every door follows.
 *
 * NO NEW GATE WAS INVENTED. The free doors are free — hazardDoorRequiresPack is
 * the only thing that decides — and the paid door reuses the entitlement
 * machinery in @/modules/payments unchanged.
 *
 * The admin bypass is the same one the exam, practice and simulator gates use:
 * the role comes from the SERVER session, so the founder/test account can
 * exercise the section on staging — which is exactly where a gate has to be
 * observable. There is deliberately no `NODE_ENV !== "production"` escape
 * hatch: a gate that is invisible outside production is a gate nobody ever sees
 * fail.
 */

import type { SessionUser } from "@/modules/auth";
import type { HazardDoor } from "@/components/hazard/types";
import { hazardDoorRequiresPack } from "@/modules/hazard-play";
import { getEntitlements } from "@/modules/payments";

export async function canOpenHazardDoor(
  user: SessionUser,
  door: HazardDoor,
): Promise<boolean> {
  if (!hazardDoorRequiresPack(door)) return true;
  if (user.isAdmin) return true;
  const access = await getEntitlements(user.id);
  return access.hasCore;
}
