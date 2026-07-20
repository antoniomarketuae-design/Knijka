/**
 * gen_why_panel_map.mjs — THEO-2 Stage 1 (doc 64) build-time artifact:
 * docs/simulation/scenario-engine/scenario-map.json (1,016 rows, docs/ is
 * unreadable at runtime) → platform/src/modules/learning/whyPanelMap.generated.ts
 * (the COMPACT question-id → ev-* map, ids only — 585 entries).
 *
 * The district-snapshot mold (tools/maps/gen_parking_lot.mjs): generator +
 * committed output + a freshness test asserting the output still matches the
 * source (platform/src/modules/learning/whyPanel.test.ts). Rerun after any
 * scenario-map edit:
 *
 *   node tools/theory/gen_why_panel_map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SOURCE = path.join(
  REPO_ROOT,
  "docs",
  "simulation",
  "scenario-engine",
  "scenario-map.json",
);
const TARGET = path.join(
  REPO_ROOT,
  "platform",
  "src",
  "modules",
  "learning",
  "whyPanelMap.generated.ts",
);

const EVENT_ID_RE = /^ev-[a-z0-9]+(-[a-z0-9]+)*$/;
const QUESTION_ID_RE = /^q-[a-z0-9]+(-[a-z0-9]+)*$/;

const rows = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
if (!Array.isArray(rows)) throw new Error("scenario-map.json: expected an array");

const seen = new Set();
const entries = [];
for (const row of rows) {
  if (typeof row.id !== "string" || !QUESTION_ID_RE.test(row.id)) {
    throw new Error(`scenario-map.json: bad question id ${JSON.stringify(row.id)}`);
  }
  if (seen.has(row.id)) throw new Error(`scenario-map.json: duplicate id "${row.id}"`);
  seen.add(row.id);
  if (row.eventType == null) continue;
  if (typeof row.eventType !== "string" || !EVENT_ID_RE.test(row.eventType)) {
    throw new Error(`scenario-map.json: bad eventType "${row.eventType}" on "${row.id}"`);
  }
  entries.push([row.id, row.eventType]);
}
entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const body = entries.map(([id, ev]) => `  "${id}": "${ev}",`).join("\n");
const out = `/**
 * GENERATED FILE — do not edit. Regenerate with:
 *   node tools/theory/gen_why_panel_map.mjs
 *
 * Source: docs/simulation/scenario-engine/scenario-map.json (the question →
 * sim-event bridge; docs/ is unreadable at runtime, so the ${entries.length} rows that
 * carry a usable eventType are committed here, ids only). Freshness is
 * test-gated: whyPanel.test.ts re-derives this map from the source and fails
 * on any drift.
 */

/** question id → scenario event id (ev-*), sorted by question id. */
export const QUESTION_EVENT_TYPE: Readonly<Record<string, string>> = {
${body}
};
`;

fs.writeFileSync(TARGET, out, "utf8");
console.log(`wrote ${path.relative(REPO_ROOT, TARGET)} (${entries.length} entries)`);
