import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMENDATIONS, VIOLATIONS } from "../catalog";
import { SEVERITY_POINTS } from "../types";

describe("violation catalog integrity", () => {
  it("every violation's points match the official points of its severity class", () => {
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      expect(spec.points, code).toBe(SEVERITY_POINTS[spec.severityClass]);
    }
  });

  it("every violation carries Bulgarian title, explanation and a legal reference", () => {
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      expect(spec.titleBg.length, code).toBeGreaterThan(0);
      expect(spec.explanationBg.length, code).toBeGreaterThan(0);
      expect(spec.lawRef, code).toMatch(/ЗДвП|ППЗДвП|Наредба/);
    }
  });

  it("COLLISION is the only violation that terminates the session", () => {
    const terminating = Object.entries(VIOLATIONS)
      .filter(([, spec]) => spec.terminateSession)
      .map(([code]) => code);
    expect(terminating).toEqual(["COLLISION"]);
  });

  it("every linked conceptId exists in the knowledge graph (content/concepts.json)", () => {
    const conceptsPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../../../content/concepts.json",
    );
    const concepts = JSON.parse(readFileSync(conceptsPath, "utf-8")) as Array<{ id: string }>;
    const known = new Set(concepts.map((c) => c.id));

    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      if (spec.conceptId !== undefined) {
        expect(known.has(spec.conceptId), `${code} -> ${spec.conceptId}`).toBe(true);
      }
    }
    for (const [code, spec] of Object.entries(COMMENDATIONS)) {
      if (spec.conceptId !== undefined) {
        expect(known.has(spec.conceptId), `${code} -> ${spec.conceptId}`).toBe(true);
      }
    }
  });
});
