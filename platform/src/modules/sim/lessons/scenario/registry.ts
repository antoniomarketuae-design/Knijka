/**
 * Doc-72 archetype registry — the 152 catalogued real-life scenario
 * archetypes of docs/simulation/72_REAL_LIFE_SCENARIO_TAXONOMY.md (§ per
 * family). ScenarioSpec.archetypeIds is validated against this list so a
 * template can never cite provenance that does not exist (typo armor for the
 * 150-template assembly line).
 *
 * Regenerate check (must stay in sync with the doc):
 *   grep -oE '^\*\*[A-Z]{2}-[0-9]{2}' docs/simulation/72_REAL_LIFE_SCENARIO_TAXONOMY.md
 */

const IDS = [
  // AC — Adverse conditions (13)
  "AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08",
  "AC-09", "AC-10", "AC-11", "AC-12", "AC-13",
  // FO — Following & queues (8)
  "FO-01", "FO-02", "FO-03", "FO-04", "FO-05", "FO-06", "FO-07", "FO-08",
  // JU — Junctions (24)
  "JU-01", "JU-02", "JU-03", "JU-04", "JU-05", "JU-06", "JU-07", "JU-08",
  "JU-09", "JU-10", "JU-11", "JU-12", "JU-13", "JU-14", "JU-15", "JU-16",
  "JU-17", "JU-18", "JU-19", "JU-20", "JU-21", "JU-22", "JU-23", "JU-24",
  // OV — Overtaking / lane use / meeting (18)
  "OV-01", "OV-02", "OV-03", "OV-04", "OV-05", "OV-06", "OV-07", "OV-08",
  "OV-09", "OV-10", "OV-11", "OV-12", "OV-13", "OV-14", "OV-15", "OV-16",
  "OV-17", "OV-18",
  // PE — Pedestrians (16)
  "PE-01", "PE-02", "PE-03", "PE-04", "PE-05", "PE-06", "PE-07", "PE-08",
  "PE-09", "PE-10", "PE-11", "PE-12", "PE-13", "PE-14", "PE-15", "PE-16",
  // PK — Parking, stopping & low-speed maneuvering (14)
  "PK-01", "PK-02", "PK-03", "PK-04", "PK-05", "PK-06", "PK-07", "PK-08",
  "PK-09", "PK-10", "PK-11", "PK-12", "PK-13", "PK-14",
  // RB — Roundabouts (6)
  "RB-01", "RB-02", "RB-03", "RB-04", "RB-05", "RB-06",
  // RX — Rail / tram crossings (5)
  "RX-01", "RX-02", "RX-03", "RX-04", "RX-05",
  // SN — Signs, markings & zones (8)
  "SN-01", "SN-02", "SN-03", "SN-04", "SN-05", "SN-06", "SN-07", "SN-08",
  // SP — Speed management (13)
  "SP-01", "SP-02", "SP-03", "SP-04", "SP-05", "SP-06", "SP-07", "SP-08",
  "SP-09", "SP-10", "SP-11", "SP-12", "SP-13",
  // VP — Vehicle procedures & cockpit (13)
  "VP-01", "VP-02", "VP-03", "VP-04", "VP-05", "VP-06", "VP-07", "VP-08",
  "VP-09", "VP-10", "VP-11", "VP-12", "VP-13",
  // VU — Vulnerable road users (14)
  "VU-01", "VU-02", "VU-03", "VU-04", "VU-05", "VU-06", "VU-07", "VU-08",
  "VU-09", "VU-10", "VU-11", "VU-12", "VU-13", "VU-14",
] as const;

/** Every valid doc-72 archetype id (152 entries, 151 unique archetypes —
 *  PK-04 is a catalogued cross-family alias of VP-05). */
export const DOC72_ARCHETYPE_IDS: ReadonlySet<string> = new Set(IDS);

export function isDoc72ArchetypeId(id: string): boolean {
  return DOC72_ARCHETYPE_IDS.has(id);
}
