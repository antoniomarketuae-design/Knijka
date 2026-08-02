/**
 * THE INVARIANT: A REFERENT MAY ONLY BELIEVE WHAT A STUDENT CAN SEE.
 *
 * 2026-08-02. `referents.ts` graded HEADLIGHTS_OFF_AT_NIGHT / _IN_RAIN /
 * FOG_LIGHTS_OFF_IN_FOG / HIGH_BEAM_NOT_DIPPED against this line:
 *
 *     lightsInstructed: spec.instructionsBg.some((s) => LIGHTS_COPY.test(s.textBg))
 *
 * `ScenarioSpec.instructionsBg` was never rendered to anybody. `compileScenario`
 * dropped it, no `.tsx` read it, and its only non-test consumers were the type,
 * the validator and the gate itself. So a lane closed twelve rain scenarios and
 * six night scenarios by writing Bulgarian into a void, and the gate declared
 * the falsehood resolved — because the gate read the same unrendered field the
 * fix wrote. The fault still fired. The student was still never told. And the
 * gate could no longer see it.
 *
 * That is worse than the original defect: an honest red became a green lie.
 *
 * THE CLASS, not the instance: any referent whose premise is satisfiable by
 * data the student never perceives certifies itself. This file makes that
 * impossible to ship. Every rule declares its evidence channels; every channel
 * names the `.tsx` that puts it in front of a human and a token that must
 * appear there. A future referent pointed at a dead field fails HERE, on the
 * first run, with the field named and the reason spelled out.
 *
 * It is not a paperwork test: `it("is not vacuous")` builds a channel that
 * points at a field nothing renders and proves the checker rejects it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import {
  EVIDENCE_CHANNELS,
  NO_WORLD_REFERENT,
  REFERENT_RULES,
  allFaultCodes,
  type EvidenceChannel,
  type EvidenceId,
  type FaultCode,
} from "../referents";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** platform/src — every `renderedBy` path is relative to it. */
const SRC = path.resolve(HERE, "..", "..", "..", "..");
const REFERENTS_FILE = path.join(HERE, "..", "referents.ts");

const readIfPresent = (rel: string): string | null => {
  const abs = path.join(SRC, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
};

/**
 * THE PREDICATE, as one function, so the vacuity proof below drives exactly the
 * code the real check drives. Returns the reasons this channel does NOT reach a
 * student; empty = it does.
 */
export function channelUnreachableReasons(id: string, ch: EvidenceChannel): string[] {
  const out: string[] = [];
  if (ch.renderedBy.length === 0) {
    out.push(`evidence channel "${id}" names no rendering component at all`);
    return out;
  }
  if (ch.symbols.length === 0) {
    out.push(`evidence channel "${id}" names no symbol to look for`);
    return out;
  }
  const sources = new Map<string, string>();
  for (const rel of ch.renderedBy) {
    if (!rel.endsWith(".tsx")) {
      out.push(
        `evidence channel "${id}" lists ${rel}, which is not a .tsx. A rendering surface is a ` +
          `component. A .ts module can be read by nothing but a test and still look like plumbing — ` +
          `that is exactly how ScenarioSpec.instructionsBg passed for three months.`,
      );
      continue;
    }
    const text = readIfPresent(rel);
    if (text === null) {
      out.push(
        `evidence channel "${id}" says ${rel} renders it, but that file does not exist. ` +
          `Referents read ${ch.reads}; nothing shows it to a student.`,
      );
      continue;
    }
    sources.set(rel, text);
  }
  for (const sym of ch.symbols) {
    const hit = [...sources].some(([, text]) => text.includes(sym));
    if (hit) continue;
    out.push(
      `THE FIELD "${sym}" IS NOT RENDERED. Evidence channel "${id}" reads ${ch.reads} and claims ` +
        `${ch.renderedBy.join(", ")} shows it, but none of those components mentions "${sym}". ` +
        `A referent that accepts ${sym} as proof is certifying itself: the fault still fires, the ` +
        `student is never told, and the gate can no longer see it. Either render "${sym}", or ` +
        `repoint the referent at something the student can actually perceive.`,
    );
  }
  return out;
}

describe("referent evidence is reachable from a rendered surface", () => {
  it("every referent declares at least one evidence channel", () => {
    const bare: string[] = [];
    for (const [code, rule] of Object.entries(REFERENT_RULES)) {
      if (!rule) continue;
      if (!Array.isArray(rule.evidence) || rule.evidence.length === 0) {
        bare.push(
          `${code}: declares no evidence. Say which channel(s) of EVIDENCE_CHANNELS its check ` +
            `treats as proof — a referent nobody can name the evidence of is a referent nobody ` +
            `can audit.`,
        );
      }
    }
    expect(bare).toEqual([]);
  });

  it("every declared channel exists in EVIDENCE_CHANNELS", () => {
    const unknown: string[] = [];
    for (const [code, rule] of Object.entries(REFERENT_RULES)) {
      if (!rule) continue;
      for (const id of rule.evidence) {
        if (!(id in EVIDENCE_CHANNELS)) {
          unknown.push(`${code}: evidence "${id}" is not a channel in EVIDENCE_CHANNELS`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("EVERY FIELD A REFERENT READS AS EVIDENCE REACHES A STUDENT", () => {
    // The whole point. Reported per REFERENT, not per channel, so the failure
    // says which fault code would start convicting on invisible proof.
    const dead: string[] = [];
    for (const [code, rule] of Object.entries(REFERENT_RULES)) {
      if (!rule) continue;
      for (const id of rule.evidence) {
        const ch = EVIDENCE_CHANNELS[id as EvidenceId];
        if (!ch) continue;
        for (const reason of channelUnreachableReasons(id, ch)) {
          dead.push(`${code} → ${reason}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("is not vacuous: a channel pointing at a dead field is rejected, with the field named", () => {
    // The 2026-08-02 defect, reconstructed exactly: a referent believing a
    // field whose only consumers are the type, the validator and the gate.
    const theBugAsItShipped: EvidenceChannel = {
      reads: "ScenarioSpec.instructionsBg",
      studentSees: "(nothing — compileScenario dropped it and no component read it)",
      renderedBy: ["components/sim/lesson-ui/LessonPlayShell.tsx"],
      symbols: ["spec.instructionsBg"],
    };
    const reasons = channelUnreachableReasons("theBugAsItShipped", theBugAsItShipped);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain('THE FIELD "spec.instructionsBg" IS NOT RENDERED');
    expect(reasons[0]).toContain("certifying itself");

    // …and the same guard catches the lazier version: a .ts "surface".
    const notAComponent: EvidenceChannel = {
      reads: "whatever",
      studentSees: "(nothing)",
      renderedBy: ["modules/sim/lessons/scenario/validate.ts"],
      symbols: ["instructionsBg"],
    };
    expect(channelUnreachableReasons("notAComponent", notAComponent)[0]).toContain(
      "is not a .tsx",
    );
  });

  it("no channel is declared and never used — the table is the audit, not decoration", () => {
    const used = new Set<string>();
    for (const rule of Object.values(REFERENT_RULES)) {
      if (!rule) continue;
      for (const id of rule.evidence) used.add(id);
    }
    const orphans = Object.keys(EVIDENCE_CHANNELS).filter((id) => !used.has(id));
    expect(orphans, "delete an unused channel; a table nobody reads drifts").toEqual([]);
  });

  it("the 45/13 arithmetic still holds — a new code cannot ship unchecked", () => {
    const all = allFaultCodes();
    const withRule = all.filter((c: FaultCode) => REFERENT_RULES[c] !== undefined);
    const exempt = all.filter((c: FaultCode) => NO_WORLD_REFERENT.has(c));
    expect(withRule.length + exempt.length).toBe(all.length);
  });

  // -------------------------------------------------------------------------
  // The delivery half, asserted end to end
  // -------------------------------------------------------------------------

  it("compileScenario carries the authored instructions onto the compiled lesson", () => {
    let checked = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const level = spec.levels[0]!.level;
      const lesson = compileScenario(spec, level);
      expect(lesson.briefingBg, `${spec.id}@L${level} compiled no briefing`).toBeDefined();
      expect(lesson.briefingBg!.map((s) => s.textBg)).toEqual(
        spec.instructionsBg.map((s) => s.textBg),
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("the lights copy survives the compile on every template that authors it", () => {
    const LIGHTS = /светлин|фаров/i;
    const authored = SCENARIO_TEMPLATES.filter((s) =>
      s.instructionsBg.some((i) => LIGHTS.test(i.textBg)),
    );
    // The sixteen the founder's lanes wrote, plus whatever has landed since.
    expect(authored.length).toBeGreaterThanOrEqual(16);
    const lost: string[] = [];
    for (const spec of authored) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level);
        if (!(lesson.briefingBg ?? []).some((s) => LIGHTS.test(s.textBg))) {
          lost.push(`${spec.id}@L${rung.level}`);
        }
      }
    }
    expect(lost, "the lights instruction was authored and then compiled away again").toEqual([]);
  });

  it("the THEO-3 sandbox drops the briefing — its assignment is the mistake", () => {
    const withMistakes = SCENARIO_TEMPLATES.find((s) => s.mistakes.length > 0)!;
    const level = withMistakes.levels[0]!.level;
    const sandbox = compileScenario(withMistakes, level, {
      mistakeExperience: { mistakeIndex: 0 },
    });
    expect(sandbox.briefingBg).toBeUndefined();
  });

  it("referents.ts never reads the template's own instructionsBg again", () => {
    // The single line this whole file exists because of. Named literally, so a
    // revert is a red test rather than a quiet regression.
    const src = fs.readFileSync(REFERENTS_FILE, "utf8");
    const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);
    const offending = src
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      // The prose ABOUT the defect is the record of it and must survive; only
      // a line of code that reads the field again is the regression.
      .filter(({ line }) => /spec\.instructionsBg/.test(line) && !isComment(line));
    expect(
      offending.map(
        ({ line, n }) =>
          `referents.ts:${n} reads spec.instructionsBg — the field compileScenario drops and no ` +
          `component renders. Read lesson.briefingBg instead. ${line.trim()}`,
      ),
    ).toEqual([]);
  });
});
