/**
 * whyPanel resolver — THEO-2 Stage 1 (doc 64).
 *
 * Battery:
 *  1. Freshness gate: whyPanelMap.generated.ts must still equal what
 *     tools/theory/gen_why_panel_map.mjs derives from
 *     docs/simulation/scenario-engine/scenario-map.json (the district-snapshot
 *     pattern: generator + committed output + this drift test).
 *  2. The full chain on real questions with PINNED picks — the representative
 *     choice is part of the contract and must never flap.
 *  3. The no-sim fallbacks (no event row; event without rule codes) and
 *     null-safety on unknown ids.
 *  4. Every resolvable sim ref points at files that exist (trace + district) —
 *     the panel lazy-loads the replay from them.
 *
 * Runs against the REAL /content repo (loader import side effect), the real
 * scenario templates and the real rules catalog.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { resolveWhyPanel } from "./whyPanel";
import { QUESTION_EVENT_TYPE } from "./whyPanelMap.generated";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

describe("whyPanelMap.generated.ts — freshness gate", () => {
  const source = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "docs/simulation/scenario-engine/scenario-map.json"),
      "utf-8",
    ),
  ) as Array<{ id: string; eventType: string | null }>;

  it("matches the scenario-map source exactly (rerun tools/theory/gen_why_panel_map.mjs on drift)", () => {
    const expected: Record<string, string> = {};
    for (const row of source) {
      if (row.eventType != null) expected[row.id] = row.eventType;
    }
    expect(QUESTION_EVENT_TYPE).toEqual(expected);
  });

  it("covers exactly the 585 event-mapped rows, keys sorted", () => {
    const keys = Object.keys(QUESTION_EVENT_TYPE);
    expect(keys.length).toBe(585);
    expect(keys).toEqual([...keys].sort());
  });

  it("every key is a real question id in the content repo", () => {
    const repo = getContentRepo();
    for (const id of Object.keys(QUESTION_EVENT_TYPE)) {
      expect(repo.questionById(id), id).toBeDefined();
    }
  });
});

describe("resolveWhyPanel — the question → drill chain (pinned picks)", () => {
  it("q-krastovishta-024 (ev-stop-sign) → sc-junction-stop / „Търкалящо спиране“", () => {
    const payload = resolveWhyPanel("q-krastovishta-024");
    expect(payload).not.toBeNull();
    expect(payload!.sim).toEqual({
      templateId: "sc-junction-stop",
      level: 1,
      titleBg: "Знак Стоп",
      mistake: {
        titleBg: "Търкалящо спиране",
        whatWentWrongBg: expect.stringContaining("стоп-линията"),
        tracePath: "content/traces/sc-junction-stop/mistake-rolling-stop.trace.json",
        districtId: "tj-stop-v1",
      },
    });
  });

  it("q-osnovni-017 (ev-seatbelt) → sc-vp-readiness / „Тръгване без колан“", () => {
    const payload = resolveWhyPanel("q-osnovni-017");
    expect(payload?.sim?.templateId).toBe("sc-vp-readiness");
    expect(payload?.sim?.level).toBe(1);
    expect(payload?.sim?.mistake.titleBg).toBe("Тръгване без колан");
    expect(payload?.sim?.mistake.tracePath).toBe(
      "content/traces/sc-vp-readiness/mistake-no-belt.trace.json",
    );
    expect(payload?.sim?.mistake.districtId).toBe("vp-ready-v1");
  });

  it("q-krastovishta-030 (ev-ped-crossing-marked) → sc-zebra-approach / „Твърде бързо приближаване“", () => {
    const payload = resolveWhyPanel("q-krastovishta-030");
    expect(payload?.sim?.templateId).toBe("sc-zebra-approach");
    expect(payload?.sim?.mistake.tracePath).toBe(
      "content/traces/sc-zebra-approach/mistake-too-fast.trace.json",
    );
    expect(payload?.sim?.mistake.districtId).toBe("zb-v1");
  });

  it("q-krastovishta-005 (ev-junction-priority-sign) → sc-roundabout-entry (catalog order: flow spreads before junctions)", () => {
    // FAILED_TO_YIELD is the event's only catalog code; the FIRST template in
    // SCENARIO_TEMPLATES order whose mistake cites it exactly is
    // sc-roundabout-entry (templates-flow.ts) — sc-junction-rhr comes later.
    // Pinned so a template reorder is caught here, never silently shipped.
    const payload = resolveWhyPanel("q-krastovishta-005");
    expect(payload?.sim?.templateId).toBe("sc-roundabout-entry");
    expect(payload?.sim?.mistake.titleBg).toBe("Влизане без пропускане");
    expect(payload?.sim?.mistake.tracePath).toBe(
      "content/traces/sc-roundabout-entry/mistake-barge-entry.trace.json",
    );
  });

  it("returns the STORED explanation + citations verbatim (ADR-002)", () => {
    const question = getContentRepo().questionById("q-krastovishta-024")!;
    const payload = resolveWhyPanel("q-krastovishta-024")!;
    expect(payload.explanationBg).toBe(question.explanationBg);
    expect(payload.lawRefs).toEqual(question.lawRefs);
  });

  it("is deterministic: repeated calls give identical payloads and the same sim ref", () => {
    const first = resolveWhyPanel("q-krastovishta-024")!;
    const second = resolveWhyPanel("q-krastovishta-024")!;
    expect(second).toEqual(first);
    // The event → drill index is built once; the ref is the same frozen object.
    expect(second.sim).toBe(first.sim);
    expect(Object.isFrozen(first.sim)).toBe(true);
    expect(Object.isFrozen(first.sim!.mistake)).toBe(true);
  });
});

describe("resolveWhyPanel — fallbacks", () => {
  it("question without a scenario-map event (q-ptp-002) → text + law, no sim", () => {
    const payload = resolveWhyPanel("q-ptp-002");
    expect(payload).not.toBeNull();
    expect(payload!.explanationBg.length).toBeGreaterThan(0);
    expect(payload!.lawRefs.length).toBeGreaterThan(0);
    expect(payload!.sim).toBeUndefined();
    expect("sim" in payload!).toBe(false);
  });

  it("event without rule-engine codes (q-krastovishta-012, ev-roundabout) → no sim", () => {
    expect(QUESTION_EVENT_TYPE["q-krastovishta-012"]).toBe("ev-roundabout");
    const payload = resolveWhyPanel("q-krastovishta-012");
    expect(payload).not.toBeNull();
    expect(payload!.sim).toBeUndefined();
  });

  it("unknown question id → null", () => {
    expect(resolveWhyPanel("q-does-not-exist-999")).toBeNull();
    expect(resolveWhyPanel("")).toBeNull();
  });
});

describe("resolveWhyPanel — every resolvable drill ref is playable", () => {
  it("trace + district files exist for one question per mapped event", () => {
    // First question id per distinct event (keys are sorted — deterministic).
    const firstByEvent = new Map<string, string>();
    for (const [id, event] of Object.entries(QUESTION_EVENT_TYPE)) {
      if (!firstByEvent.has(event)) firstByEvent.set(event, id);
    }
    let resolved = 0;
    for (const [event, id] of firstByEvent) {
      const sim = resolveWhyPanel(id)?.sim;
      if (!sim) continue; // events without codes/demos degrade to text-only
      resolved++;
      expect(existsSync(path.join(REPO_ROOT, sim.mistake.tracePath)), `${event}: ${sim.mistake.tracePath}`).toBe(true);
      expect(
        existsSync(path.join(REPO_ROOT, "content/world", `${sim.mistake.districtId}.json`)),
        `${event}: ${sim.mistake.districtId}`,
      ).toBe(true);
      expect(sim.titleBg.length).toBeGreaterThan(0);
      expect(sim.mistake.whatWentWrongBg.length).toBeGreaterThan(0);
    }
    // 20 of the 45 events carry rule-engine codes today; all must resolve.
    expect(resolved).toBe(20);
  });
});
