/**
 * HAZARD-WARNING ADVANCE — builders/zoneSigns.ts, over every shipped district.
 *
 * THE DEFECT THIS EXISTS FOR. `HAZARD_WARNING_AHEAD_M` puts an А1 „Опасен
 * завой" / А15 „Хлъзгав път" 60 m before its span, because a warning whose
 * whole job is „намали ПРЕДИ" is worthless at the corner. Six of the nine
 * hazard zones in the corpus got that. The other three could not — their span
 * starts at metre 0–7 of its own edge — and `placeAt`'s clamp then posted the
 * sign INSIDE the hazard: mw-exit-v1's exit ramp and district-v1's e892658655.0
 * each stood 1.0 m PAST the arc they warn about. The world-referent gate read
 * that number straight back („curve post stands -1.0 m before the arc") and the
 * rule engine went on convicting SPEED_TOO_FAST_FOR_CURVE against an advisory
 * the world had never shown in time. zoneSigns.ts's own header called the clamp
 * „weak but never states a wrong number"; a warning sign's content IS its
 * position, so that was the wrong way round.
 *
 * The invariant, one sentence: NO hazard warning may stand at or past the first
 * metre of the hazard it warns about — on any shipped map, ever.
 *
 * This is deliberately a WHOLE-CORPUS sweep rather than a fixture. The fixture
 * batteries in world/__tests__ pass on synthetic straight streets where the
 * span always has room; every one of the three defects was on a shipped map,
 * and two of them on real OSM geometry nobody would have thought to fixture.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { polylineLength, pointAlong, type Vec2 } from "../math2d";
import { analyzeNetwork } from "../network";
import { buildZoneSigns } from "../zoneSigns";
import { assertDistrict, type District, type DistrictZone } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");

/** Zone kinds that place a WARNING (posted in advance), not a prohibition. */
const WARNING_KINDS = new Set(["curveAdvisory", "waterPatch", "icePatch"]);
/** Sign kind each warning zone posts. */
const POST_KIND: Record<string, string> = {
  curveAdvisory: "curve",
  waterPatch: "slippery",
  icePatch: "slippery",
};
/** The advance the world-referent gate asks for (referents.ts T14_ADVANCE_M). */
const GATE_ADVANCE_M = 40;

interface Built {
  id: string;
  district: District;
  network: ReturnType<typeof analyzeNetwork>;
  posts: ReturnType<typeof buildZoneSigns>;
}

const BUILT: Built[] = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const district = assertDistrict(
      JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8")),
    ) as District;
    const network = analyzeNetwork(district);
    return { id: f.replace(/\.json$/, ""), district, network, posts: buildZoneSigns(district, network) };
  })
  .filter((b) => (b.district.zones ?? []).some((z) => WARNING_KINDS.has(z.kind)));

/**
 * The HOST edge of a post: the one whose own kerb line it sits on. A post is
 * placed at `halfWidth + ZONE_SIGN_LATERAL_M` from its host's centreline, so
 * the host is the edge where that offset is reproduced exactly.
 *
 * Nearest-edge would be the wrong instrument and was tried first: at a junction
 * the nearest centreline to a kerbside post is routinely the CROSSING road, and
 * a probe built that way reported district-v1's post as having moved when it had
 * not.
 */
function hostOf(b: Built, post: { position: readonly [number, number, number] | number[] }) {
  const x = post.position[0]!;
  const y = -post.position[2]!;
  let best = { edgeId: "", s: 0, err: Infinity };
  for (const eb of b.network.edges) {
    const g = eb.edge.geometry as Vec2[];
    const total = polylineLength(g);
    const want = eb.halfWidth + 0.8;
    for (let s = 0; s <= total; s += 0.25) {
      const { point } = pointAlong(g, s);
      const err = Math.abs(Math.hypot(point[0] - x, point[1] - y) - want);
      if (err < best.err) best = { edgeId: eb.edge.id, s, err };
    }
  }
  return best;
}

/**
 * Advance of a post over a zone, ALONG THE DRIVER'S PATH: metres on the zone's
 * own edge, or (metres left on the predecessor) + fromM when the post stands on
 * the road the driver arrives down. `null` when the post is on neither.
 */
function advanceM(b: Built, zone: DistrictZone, host: { edgeId: string; s: number }): number | null {
  if (host.edgeId === zone.edgeId) return zone.fromM - host.s;
  const eb = b.network.edgeById.get(host.edgeId);
  const own = b.network.edgeById.get(zone.edgeId);
  if (!eb || !own) return null;
  const cg = eb.edge.geometry as Vec2[];
  const og = own.edge.geometry as Vec2[];
  const end = cg[cg.length - 1]!;
  const head = og[0]!;
  // Only a predecessor that actually feeds the hazard edge's head counts.
  if (Math.hypot(end[0] - head[0], end[1] - head[1]) > eb.halfWidth) return null;
  return polylineLength(cg) - host.s + zone.fromM;
}

describe("hazard warnings over the shipped corpus", () => {
  it("the corpus still contains the maps this invariant was written for", () => {
    // A sweep that silently stops finding its subjects is the failure mode that
    // makes „0 defects" meaningless. Name the three that used to be broken.
    const ids = BUILT.map((b) => b.id);
    expect(ids).toContain("mw-exit-v1");
    expect(ids).toContain("district-v1");
    expect(ids).toContain("d2-v1");
    expect(BUILT.length).toBeGreaterThanOrEqual(7);
  });

  it("NO warning post stands at or past the first metre of its own hazard", () => {
    const late: string[] = [];
    for (const b of BUILT) {
      for (const zone of b.district.zones ?? []) {
        if (!WARNING_KINDS.has(zone.kind)) continue;
        const kind = POST_KIND[zone.kind]!;
        for (const post of b.posts) {
          if (post.kind !== kind) continue;
          const host = hostOf(b, post);
          const adv = advanceM(b, zone, host);
          if (adv === null) continue; // a post for a DIFFERENT zone on this map
          if (adv > 0) continue;
          late.push(
            `${b.id}: ${kind} for ${zone.id} (${zone.kind} at ${zone.fromM} m of ${zone.edgeId}) ` +
              `stands ${adv.toFixed(1)} m before it, on ${host.edgeId} @ ${host.s.toFixed(1)} m`,
          );
        }
      }
    }
    expect(late).toEqual([]);
  });

  it("the two exit-ramp warnings that had no room now stand on the road the driver arrives down", () => {
    // mw-exit-v1: the ramp's advisory-60 arc starts at metre 0 of the ramp, so
    // the 60 m of advance is on the DECELERATION LANE — 8.13 m from the ramp
    // head, inside that edge's 16.19 m half width, 0.0° of heading break. This
    // is the single placement the world-referent gate has named by line since
    // wave 1.
    const mw = BUILT.find((b) => b.id === "mw-exit-v1")!;
    const mwPost = mw.posts.find((p) => p.kind === "curve")!;
    const mwHost = hostOf(mw, mwPost);
    expect(mwHost.edgeId).toBe("mwx-e-nb-decel");
    const mwZone = (mw.district.zones ?? []).find((z) => z.id === "mwx-z-ramp-curve")!;
    expect(advanceM(mw, mwZone, mwHost)!).toBeGreaterThanOrEqual(GATE_ADVANCE_M);

    // d2-v1: a real Sofia curve 7 m into its edge, whose unique incoming
    // predecessor continues straight (3.5°). 6.0 m of advance became 53.8.
    const d2 = BUILT.find((b) => b.id === "d2-v1")!;
    const d2Post = d2.posts.find((p) => p.kind === "curve")!;
    const d2Host = hostOf(d2, d2Post);
    expect(d2Host.edgeId).toBe("e193362544.0");
    const d2Zone = (d2.district.zones ?? []).find((z) => z.id === "d2-a1-8590274380")!;
    expect(advanceM(d2, d2Zone, d2Host)!).toBeGreaterThanOrEqual(GATE_ADVANCE_M);
  });

  it("a hazard the world cannot warn about in time is left UNSIGNED, not mis-signed", () => {
    // district-v1's e892658655.0 carries a curveAdvisory at metre 0 and the road
    // TURNS 47.4° into it, so its approach is a different heading and cannot
    // host the warning. The honest answer is no post — the same answer
    // roundabout.ts gives a ring whose middle is not empty. What must NOT
    // happen is the old behaviour: an А1 clamped to metre 1, i.e. 1.0 m inside
    // the arc, telling the driver a curve is ahead while they are in it.
    const dv = BUILT.find((b) => b.id === "district-v1")!;
    const zones = (dv.district.zones ?? []).filter((z) => z.kind === "curveAdvisory");
    expect(zones.map((z) => z.id).sort()).toEqual(["dv1-a1-287801280", "dv1-a1-8926586550"]);
    const posts = dv.posts.filter((p) => p.kind === "curve");
    expect(posts).toHaveLength(1);
    // …and the one that remains is the one with room: 16.21 m of edge, so it
    // keeps its 15.2 m of advance. Short of the gate's 40, but a true warning.
    const host = hostOf(dv, posts[0]!);
    expect(host.edgeId).toBe("e28780128.0");
    const kept = zones.find((z) => z.id === "dv1-a1-287801280")!;
    expect(advanceM(dv, kept, host)!).toBeGreaterThan(0);
  });

  it("every zone with room on its own edge is untouched at exactly 60 m", () => {
    // The additive contract: the upstream walk may only ever fire where the
    // clamp used to. If this drifts, six shipped maps moved a sign for free.
    const untouched: Record<string, [string, number]> = {
      "ac-aqua-v1": ["ac-aqua-z-water", 60],
      "ac-bridge-v1": ["ac-bridge-z-deck-ice", 60],
      "ac-ice-v1": ["ac-ice-z-ice", 60],
      "ov-crest-v1": ["ovc-z-curve", 60],
      "sp-curve-v1": ["spc-z-curve", 60],
    };
    for (const [id, [zoneId, advance]] of Object.entries(untouched)) {
      const b = BUILT.find((x) => x.id === id)!;
      const zone = (b.district.zones ?? []).find((z) => z.id === zoneId)!;
      const post = b.posts.find((p) => p.kind === POST_KIND[zone.kind]!)!;
      const host = hostOf(b, post);
      expect(host.edgeId, id).toBe(zone.edgeId);
      expect(advanceM(b, zone, host)!, id).toBeCloseTo(advance, 6);
    }
  });
});
