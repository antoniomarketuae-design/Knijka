/**
 * Rail-track deck battery (RAIL-TRACK-VISUAL slice) — builders/railTrack.
 *
 * A railCrossing zone graded a stop-and-look ritual while the carriageway
 * showed NOTHING (only a kerbside crossbuck + sign): the road read as a plain
 * street. This battery proves the world now SHOWS the track:
 *  - a railCrossing span emits a dark ballast/sleeper deck + two steel rails
 *    landing EXACTLY on [fromM, toM], across the full carriageway;
 *  - the rails run ACROSS the road (raised, at RAIL_HEAD_Y), the deck is flat
 *    and up-facing (ballast + evenly-spaced sleeper ties);
 *  - the deck carries vertex colours (ballast vs sleeper) and the rails do not;
 *  - both guarded AND unguarded crossings render the same deck;
 *  - a non-rail zone / a zones-less district emits ZERO quads (the additive
 *    contract: every rail-free map builds bit-identically);
 *  - it flows through buildWorldGeometry with a deterministic quad count.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { LANE_WIDTH_M } from "../builders/constants";
import { analyzeNetwork } from "../builders/network";
import {
  buildRailTracks,
  RAIL_BALLAST_Y,
  RAIL_DECK_EDGE_INSET_M,
  RAIL_HEAD_Y,
  RAIL_SLEEPER_Y,
  SLEEPER_SPACING_M,
} from "../builders/railTrack";
import { assertDistrict, type District, type DistrictZone } from "../types";

// ---------------------------------------------------------------------------
// Fixture: one straight residential street north along x = 0, zones injectable.
// ---------------------------------------------------------------------------

function fixtureDistrict(zones: DistrictZone[] | undefined): District {
  return {
    format: "district-v1",
    meta: {
      district: "rt-test",
      label: "Rail-track fixture",
      boundsLocalMeters: { minX: -30, minY: 0, maxX: 30, maxY: 300 },
      attribution: {
        text: "оригинален параметричен дизайн (тестова карта)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
      },
    },
    roads: {
      nodes: [
        { id: "n-start", x: 0, y: 0 },
        { id: "n-end", x: 0, y: 300 },
      ],
      edges: [
        {
          id: "e-street",
          from: "n-start",
          to: "n-end",
          class: "residential",
          name: null,
          oneway: false,
          roundabout: false,
          lanes: 2,
          lanesSource: "tag",
          maxspeed: 50,
          maxspeedSource: "tag",
          length: 300,
          geometry: [
            [0, 0],
            [0, 300],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
    ...(zones ? { zones } : {}),
  };
}

const railZone = (overrides: Partial<DistrictZone> = {}): DistrictZone => ({
  id: "z-rail",
  kind: "railCrossing",
  edgeId: "e-street",
  fromM: 240,
  toM: 246,
  signRef: "А35",
  ...overrides,
});

function build(district: District) {
  return buildRailTracks(district, analyzeNetwork(district));
}

// Residential 2-lane → full carriageway half-width, minus the deck edge inset.
const TRAVEL_HALF = (2 * LANE_WIDTH_M) / 2;
const DECK_HALF = TRAVEL_HALF - RAIL_DECK_EDGE_INSET_M;
const N_TIES = Math.floor((2 * DECK_HALF) / SLEEPER_SPACING_M);
/** 1 ballast band + N sleeper ties. */
const DECK_QUADS = 1 + N_TIES;
/** 2 rails × (top + 2 sides). */
const RAIL_QUADS = 6;

describe("buildRailTracks on the fixture street", () => {
  it("one railCrossing span → the ballast/sleeper deck + two steel rails on [fromM, toM]", () => {
    const { deck, rails, deckQuads, railQuads } = build(fixtureDistrict([railZone()]));
    expect(deckQuads).toBe(DECK_QUADS);
    expect(railQuads).toBe(RAIL_QUADS);
    expect(deck.vertexCount).toBe(DECK_QUADS * 4);
    expect(deck.triangleCount).toBe(DECK_QUADS * 2);
    expect(rails.vertexCount).toBe(RAIL_QUADS * 4);

    const deckData = deck.toMeshData();
    const railData = rails.toMeshData();

    // Deck carries ballast/sleeper vertex colours; the rails do not (one
    // metallic material tints them at render time).
    expect(deckData.colors).toBeDefined();
    expect(railData.colors).toBeUndefined();

    // Every deck vertex is flat at the ballast OR the sleeper plane…
    for (let i = 1; i < deckData.positions.length; i += 3) {
      const y = deckData.positions[i]!;
      const onBallast = Math.abs(y - RAIL_BALLAST_Y) < 1e-6;
      const onSleeper = Math.abs(y - RAIL_SLEEPER_Y) < 1e-6;
      expect(onBallast || onSleeper).toBe(true);
    }
    // …and every rail vertex is at the raised crown OR its foot (the sides).
    let sawCrown = false;
    for (let i = 1; i < railData.positions.length; i += 3) {
      const y = railData.positions[i]!;
      const onCrown = Math.abs(y - RAIL_HEAD_Y) < 1e-6;
      const onFoot = Math.abs(y - RAIL_SLEEPER_Y) < 1e-6;
      expect(onCrown || onFoot).toBe(true);
      sawCrown ||= onCrown;
    }
    expect(sawCrown).toBe(true); // the rails are actually raised

    // Both meshes land inside the span (district y ∈ [240, 246] → world
    // z ∈ [-246, -240]) and inside the carriageway across it.
    for (const { positions } of [deckData, railData]) {
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.abs(positions[i]!)).toBeLessThanOrEqual(DECK_HALF + 1e-4);
        expect(positions[i + 2]!).toBeGreaterThanOrEqual(-246 - 1e-4);
        expect(positions[i + 2]!).toBeLessThanOrEqual(-240 + 1e-4);
      }
    }

    // The deck is flat and faces UP (district-CCW after world mapping) — the
    // road-surface convention (buildWorldGeometry.test.ts / water-decals.test).
    const { positions, indices } = deckData;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      const abx = positions[b]! - positions[a]!;
      const abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!;
      const acz = positions[c + 2]! - positions[a + 2]!;
      expect(abz * acx - abx * acz).toBeGreaterThan(0);
    }
  });

  it("guarded and unguarded crossings render the SAME deck", () => {
    const unguarded = build(fixtureDistrict([railZone()]));
    const guarded = build(
      fixtureDistrict([
        railZone({ guarded: true, barrier: { cycleSec: 90, downFromSec: 0, downToSec: 40 } }),
      ]),
    );
    expect(guarded.deckQuads).toBe(unguarded.deckQuads);
    expect(guarded.railQuads).toBe(unguarded.railQuads);
    expect(Array.from(guarded.deck.toMeshData().positions)).toEqual(
      Array.from(unguarded.deck.toMeshData().positions),
    );
  });

  it("a non-rail zone emits NOTHING (only railCrossing spans build track)", () => {
    const { deckQuads, railQuads } = build(
      fixtureDistrict([
        { id: "z-w", kind: "waterPatch", edgeId: "e-street", fromM: 240, toM: 246, signRef: "А15" },
      ]),
    );
    expect(deckQuads).toBe(0);
    expect(railQuads).toBe(0);
  });

  it("districts without zones emit ZERO geometry (the additive contract)", () => {
    const { deck, rails, deckQuads, railQuads } = build(fixtureDistrict(undefined));
    expect(deckQuads).toBe(0);
    expect(railQuads).toBe(0);
    expect(deck.vertexCount).toBe(0);
    expect(rails.vertexCount).toBe(0);
  });

  it("degenerate spans build nothing (inverted / non-finite / unknown edge)", () => {
    const dead: DistrictZone[][] = [
      [railZone({ fromM: 246, toM: 240 })], // inverted
      [railZone({ fromM: Number.NaN })], // non-finite
      [railZone({ fromM: 245.8, toM: 246 })], // sub-MIN_SPAN
      [railZone({ edgeId: "e-unknown" })], // unknown edge
    ];
    for (const zones of dead) {
      const { deckQuads, railQuads } = build(fixtureDistrict(zones));
      expect(deckQuads, JSON.stringify(zones)).toBe(0);
      expect(railQuads, JSON.stringify(zones)).toBe(0);
    }
  });

  it("flows through buildWorldGeometry: stats + merged meshes + deterministic", () => {
    const withRail = buildWorldGeometry(fixtureDistrict([railZone()]), { seed: 7 });
    const without = buildWorldGeometry(fixtureDistrict(undefined), { seed: 7 });
    expect(withRail.stats.railTrackQuads).toBe(DECK_QUADS + RAIL_QUADS);
    expect(withRail.railTracks.deck.positions.length).toBe(DECK_QUADS * 4 * 3);
    expect(withRail.railTracks.rails.positions.length).toBe(RAIL_QUADS * 4 * 3);
    expect(without.stats.railTrackQuads).toBe(0);
    expect(without.railTracks.deck.positions.length).toBe(0);
    expect(without.railTracks.rails.positions.length).toBe(0);
    // The rail deck + rails add exactly two draw calls (the zone posts are the
    // separate zoneSigns pass).
    const again = buildWorldGeometry(fixtureDistrict([railZone()]), { seed: 7 });
    expect(again.stats).toEqual(withRail.stats);
    expect(Array.from(again.railTracks.deck.positions)).toEqual(
      Array.from(withRail.railTracks.deck.positions),
    );
    expect(Array.from(again.railTracks.rails.positions)).toEqual(
      Array.from(withRail.railTracks.rails.positions),
    );
  });
});

// ---------------------------------------------------------------------------
// The shipped rail maps (content/world — read-only contracts)
// ---------------------------------------------------------------------------

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
  return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
}

describe("rail-track deck on the shipped rail maps", () => {
  for (const id of ["rx-unguarded-v1", "rx-guarded-v1", "rx-drop-v1"] as const) {
    it(`${id}: a visible track deck over its authored [150, 156] band`, () => {
      const world = buildWorldGeometry(loadDistrict(id), { seed: 7 });
      expect(world.stats.railTrackQuads).toBeGreaterThan(0);
      const deck = world.railTracks.deck.positions;
      const rails = world.railTracks.rails.positions;
      expect(deck.length).toBeGreaterThan(0);
      expect(rails.length).toBeGreaterThan(0);
      // Every rail-deck vertex sits on the authored band (y ∈ [150, 156]).
      for (const positions of [deck, rails]) {
        for (let i = 2; i < positions.length; i += 3) {
          expect(positions[i]!).toBeGreaterThanOrEqual(-156 - 1e-3);
          expect(positions[i]!).toBeLessThanOrEqual(-150 + 1e-3);
        }
        for (let i = 0; i < positions.length; i++) expect(Number.isFinite(positions[i])).toBe(true);
      }
    });
  }
});
