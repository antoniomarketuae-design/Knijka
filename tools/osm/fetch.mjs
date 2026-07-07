#!/usr/bin/env node
// fetch.mjs — download raw OSM data for the configured district from the
// Overpass API and cache it under tools/osm/cache/<district>.json.
//
// Usage:
//   node fetch.mjs            # uses cache if present
//   node fetch.mjs --force    # re-download even if cached
//
// The cache file is the single input of build.mjs; build output is a pure
// deterministic function of it. Cache is gitignored (raw OSM extracts are
// re-fetchable; we do not version multi-MB blobs).

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DISTRICT } from "./district.config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, "cache");
const CACHE_FILE = path.join(CACHE_DIR, `${DISTRICT.name}.json`);

// Public Overpass instances, tried in order. Be polite: one request, generous
// timeout, identifying User-Agent (Overpass usage policy asks for this).
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const USER_AGENT = "ai-driving-academy-osm-pipeline/0.1 (Bulgaria driving-sim world build)";

function buildQuery({ south, west, north, east }) {
  // One query for everything the district build needs:
  // - drivable ways (filtered further in build.mjs)
  // - traffic signal + pedestrian crossing nodes
  // - building footprints (ways and multipolygon relations)
  // (._;>;) recurses down so every referenced node/way arrives with tags.
  return `
[out:json][timeout:180][bbox:${south},${west},${north},${east}];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  node["highway"~"^(traffic_signals|crossing)$"];
  way["building"];
  relation["building"];
);
(._;>;);
out body;
`.trim();
}

async function fetchOverpass(query) {
  let lastErr;
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error("Malformed Overpass response (no elements[])");
      return { endpoint, json };
    } catch (err) {
      console.warn(`  failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All Overpass endpoints failed. Last error: ${lastErr?.message}`);
}

async function main() {
  const force = process.argv.includes("--force");

  if (existsSync(CACHE_FILE) && !force) {
    console.log(`Cache already present: ${CACHE_FILE}`);
    console.log("Use --force to re-download.");
    return;
  }

  const query = buildQuery(DISTRICT.bbox);
  const { endpoint, json } = await fetchOverpass(query);

  const counts = { node: 0, way: 0, relation: 0 };
  for (const el of json.elements) counts[el.type] = (counts[el.type] ?? 0) + 1;

  mkdirSync(CACHE_DIR, { recursive: true });
  const wrapper = {
    // Provenance of this extract. build.mjs treats `overpass` as its sole
    // data input; fetchedAt/endpoint are informational only.
    fetch: {
      district: DISTRICT.name,
      bbox: DISTRICT.bbox,
      endpoint,
      fetchedAt: new Date().toISOString(),
      query,
      attribution: "Data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
    },
    overpass: json,
  };
  writeFileSync(CACHE_FILE, JSON.stringify(wrapper));

  console.log(`Saved ${CACHE_FILE}`);
  console.log(`  elements: ${json.elements.length} (nodes ${counts.node}, ways ${counts.way}, relations ${counts.relation})`);
  console.log(`  OSM data timestamp: ${json.osm3s?.timestamp_osm_base ?? "unknown"}`);
  console.log(`Next: node build.mjs`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
