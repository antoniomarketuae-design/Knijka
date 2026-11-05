/**
 * THE DARK-LAMP OFFICER'S CARD AND FAULT NAME NO LAMP —
 * `sc-sig-controller-postures:89d24103` (minor), lane waitcard.
 *
 * MEASURED AT 479127b (liveChainReplay, every grid point; the five rig-w3a
 * careful tapes and the three committed postures demos at L1–L4):
 *   · for the whole of the officer's halt (yieldWait redLight) the advisor card
 *     said «Тук решава регулировчикът, не лампата. … страничен профил —
 *     минаваш, дори на червено; ръка горе — чакаш.», peek «Гледай
 *     регулировчика, не лампата.» — 886–927 ticks on each rig tape, 870 on
 *     shadow-correct, 187 on mistake-start-on-raised-arm (L1–L3), beside a head
 *     drawn dark and a voice that says «Светофарът на кръстовището е ЗАГАСНАЛ …
 *     няма лампа за четене»;
 *   · CONTROLLER_SIGNAL_VIOLATED on both mistake demos (L1–L4) said «…над
 *     светофара и знаците. Зеленият светофар не разрешава нищо, когато
 *     регулировчикът те спира…», peek «Той е над светофара.», corrective «…гледай
 *     неговите ръце, не светофара…» — a lit green at a junction whose lamp is
 *     out, on the toast, the «Научи» card, the debrief, the wire rebuild, the
 *     history row and the attempt reel.
 *
 * THE PIN GAP THIS FILE CLOSES: `controller-dark-lamp-head-and-voice.test.ts`
 * §3 forbids /червен|на червено/ in the officer's VOICE notices only; nothing
 * read the advisor card painted beside them, or the fault card.
 *
 * Rulings (integrator, 2026-11-04): K1 a per-act row keyed by detail
 * «lampsDark», stamped by the reducer, title = the pooled title; K2′ the dark
 * card's phone line is «Тук важи само позата на регулировчика.»; K3 the OFFICER
 * table's card fields point at the dark card; W1 the dark card names the
 * officer and the three postures and no lamp; W2 the act copy; W9 the one
 * display timer that moves (the «Защо» reading time, +1,134 ms).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TraceIndicator, ScenarioTrace, TraceSample } from "../../../traces/types";
import { advisorPromptForSession, controllerWaitAdvisorPrompt } from "../../advisor";
import { createLessonSession } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioById } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";
import { createRuleEngine, reduceTick } from "../../../rules/engine";
import { tick } from "../../../rules/__tests__/fixtures";
import type { SimTickEvent } from "../../../rules/types";
import * as catalog from "../../../rules/catalog";
import { PER_ACT_COPY, VIOLATIONS, violationCorrectiveBg, violationPeekBg } from "../../../rules/catalog";
import { rebuildRuleEvents, serializeRuleEvents } from "../../wire";
import { lessonMistakeReasonsBg } from "../../../hud/SessionEndScreen";
import { toastReadMs } from "../../../hud/HudToasts";

const TIMEOUT = 600_000;
const REPO_ROOT = path.join(process.cwd(), "..");
const POSTURES = "sc-sig-controller-postures";
const LIVE_DRILLS = ["sc-sig-controller-live", "sc-signal-controller"] as const;

/** What no line on the dark-lamp drill may say: a lit lamp, or «look past the lamp». */
const FORBIDDEN = /червен|зелен|жълт|не лампата|над светофара|не светофара/iu;

/** The ruled strings (W1 / K2′ / W2), byte for byte. */
const DARK_CARD =
  "Тук важи само позата на регулировчика: гърди/гръб към теб — стоиш; страничен профил, ти срещу рамото му — минаваш; ръка горе — чакаш.";
const DARK_PEEK = "Тук важи само позата на регулировчика.";
const LIVE_CARD =
  "Тук решава регулировчикът, не лампата. Гледай позата му: гърди/гръб към теб — стоиш; страничен профил — минаваш, дори на червено; ръка горе — чакаш.";
const LIVE_PEEK = "Гледай регулировчика, не лампата.";

interface ActRow { titleBg: string; explanationBg: string; peekBg: string; correctiveBg: string; lawRef?: string }
/** The act row, read so that a tree without it fails on an ASSERTION, not a TypeError. */
function actRow(): ActRow {
  const table = (catalog as Record<string, unknown>).CONTROLLER_SIGNAL_ACT_COPY as Record<string, ActRow> | undefined;
  expect(table?.lampsDark, "CONTROLLER_SIGNAL_ACT_COPY.lampsDark is missing — the dark-lamp halt has no copy of its own").toBeDefined();
  return table!.lampsDark!;
}
const ACT_DETAIL = "lampsDark";

// --- the replays ----------------------------------------------------------------

const RIG = JSON.parse(
  readFileSync(path.join(__dirname, "controller-dark-lamp-rig-w3a.fixture.json"), "utf-8"),
) as { drives: Record<string, { level: number; rows: Array<[number, number, number, number, number, number, TraceIndicator]> }> };

/** The rig tape as `controller-dark-lamp-praise` and the triage probe rebuild it (no dead time). */
function rigTape(cell: string): ScenarioTrace {
  const rows = RIG.drives[cell].rows;
  const at = (t: number, r: (typeof rows)[number], v: number): TraceSample => ({
    tSec: t, x: r[1], y: r[2], headingDeg: r[3], steerRad: 0, speedKmh: v, gear: r[5], indicator: r[6],
    brakeOn: v < 0.5, throttleOn: v >= 0.5,
  });
  const samples: TraceSample[] = [at(0, rows[0], 0)];
  for (const r of rows) {
    if (r[0] <= samples[samples.length - 1].tSec + 1e-9) continue;
    samples.push(at(r[0], r, r[4]));
  }
  return { meta: { scenarioId: POSTURES, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec }, samples, events: [] };
}

interface Drive {
  name: string;
  level: number;
  /** One row per grid point: the advisor card and peek, and the hold. */
  ticks: Array<{ t: number; card: string | null; peek: string | null; redHold: boolean }>;
  /** Every HUD line and teach/mistake moment, as shown text. */
  lines: string[];
  outcome: LiveReplayOutcome;
}

function drivesOf(id: string, withRig: boolean, rungs?: readonly number[]): Drive[] {
  const spec = scenarioById(id)!;
  const list: Array<[string, number, ScenarioTrace]> = [];
  if (withRig) for (const cell of Object.keys(RIG.drives)) list.push([`rig:${cell}`, RIG.drives[cell].level, rigTape(cell)]);
  const dir = path.join(REPO_ROOT, "content", "traces", id);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".trace.json")).sort()) {
    const tr = JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as ScenarioTrace;
    for (const r of spec.levels) if (rungs === undefined || rungs.includes(r.level)) list.push([`${f}@L${r.level}`, r.level, tr]);
  }
  return list.map(([name, level, trace]) => {
    const ticks: Drive["ticks"] = [];
    const lines: string[] = [];
    const outcome = liveChainReplay({
      lesson: compileScenario(spec, level as ScenarioLevel),
      districtRaw: loadDistrict(spec.map.districtId),
      trace,
      holdAfterSec: 6,
      afterApply: ({ t, step }) => {
        const p = advisorPromptForSession(step.state);
        const w = step.state.yieldWait;
        ticks.push({ t, card: p?.textBg ?? null, peek: p?.peekBg ?? null, redHold: w?.holding === true && w.reason === "redLight" });
        for (const e of step.hudEvents) {
          const v = e as { kind: string; titleBg?: string; explanationBg?: string; peekBg?: string };
          if (v.titleBg !== undefined) lines.push(`[${v.kind}] ${v.titleBg} | ${v.explanationBg ?? ""} | ${v.peekBg ?? ""}`);
        }
        for (const m of [...(step.teachMoments ?? []), ...(step.mistakeMoment ? [step.mistakeMoment] : [])]) {
          lines.push(`[moment] ${m.titleBg} | ${m.explanationBg} | ${(m as { peekBg?: string }).peekBg ?? ""}`);
        }
      },
    });
    return { name, level, ticks, lines, outcome };
  });
}

let posturesCache: Drive[] | null = null;
const postures = (): Drive[] => (posturesCache ??= drivesOf(POSTURES, true, [1, 2, 3, 4]));

// --- T1 -------------------------------------------------------------------------

describe("T1 on every grid point of the dark-lamp drill, the card, its peek and every HUD line name no lit lamp", () => {
  it(
    "the 5 rig-w3a tapes and the 3 committed demos at L1–L4: no lamp named, and the officer's halt paints the dark card",
    () => {
      const bad: string[] = [];
      let darkTicks = 0;
      let redHoldTicks = 0;
      for (const d of postures()) {
        for (const k of d.ticks) {
          for (const [what, s] of [["card", k.card], ["peek", k.peek]] as const) {
            if (s !== null && FORBIDDEN.test(s)) bad.push(`${d.name} t=${k.t.toFixed(2)} ${what}: «${s}»`);
          }
          if (k.card === DARK_CARD) {
            darkTicks++;
            expect(k.peek, `${d.name} t=${k.t}`).toBe(DARK_PEEK);
          }
          // L1–L3 paint a card on every redLight tick (L4 is the exam rung: no
          // advisor at all), and on this lesson that card is the dark one.
          if (k.redHold && d.level <= 3) {
            redHoldTicks++;
            if (k.card !== DARK_CARD) bad.push(`${d.name} t=${k.t.toFixed(2)} officer's halt painted «${k.card}»`);
          }
        }
        for (const l of d.lines) if (FORBIDDEN.test(l)) bad.push(`${d.name} ${l.slice(0, 200)}`);
      }
      expect(bad.slice(0, 12), `${bad.length} shown line(s) on the dark-lamp drill name a lamp or look past one`).toEqual([]);
      // THE POSITIVE CONTROL: the replay reaches the halt. Measured at 479127b:
      // 886 + 885 + 927 + 926 + 927 (rig) + 3 × 870 (shadow) + 3 × 187 (raised arm).
      expect(redHoldTicks).toBe(7722);
      expect(darkTicks).toBe(redHoldTicks);
    },
    TIMEOUT,
  );
});

// --- T2 -------------------------------------------------------------------------

function runOutSession(id: string): LessonSessionState {
  const lesson = compileScenario(scenarioById(id)!, 1);
  const base = createLessonSession(lesson);
  return {
    ...base,
    phase: "driving",
    currentObjectiveIndex: lesson.objectives.length,
    yieldWait: { holding: true, sinceSec: 1, reason: "redLight", pedestrianCrossingIds: [] },
  };
}

describe("T2 the run-out branch (past the last objective) chooses the officer card by the same flag", () => {
  it("postures gets the dark card; the two live-lamp drills keep the live card", () => {
    const dark = advisorPromptForSession(runOutSession(POSTURES));
    expect(dark?.textBg, "run-out on the dark-lamp drill").toBe(DARK_CARD);
    expect(dark?.peekBg).toBe(DARK_PEEK);
    for (const id of LIVE_DRILLS) {
      const live = advisorPromptForSession(runOutSession(id));
      expect(live?.textBg, `run-out on ${id}`).toBe(LIVE_CARD);
      expect(live?.peekBg).toBe(LIVE_PEEK);
    }
  });
});

// --- T3 -------------------------------------------------------------------------

/**
 * Mirrors of tools/mobile/lesson-audit.mjs's two wait matchers. The dark card
 * must not read as a wait: a right leg holding on a card cannot see him turn.
 * Pinned to the tools source below when the tree carries it (lanes do not).
 */
const LAWFUL_WAIT_RE = /Чакаш правилно|Защо чакаш|Чакането Е маневрата/;
const LAWFUL_WAIT_CARD_RE =
  /Чакаш правилно|Знак Б2 иска две неща|В кръга имат предимство\. Гледай НАЛЯВО|Знак Б1: пропускаш движещите се|На червено се спира|Пешеходецът на пътеката минава пръв|Трамваят минава пръв|Насрещните минават първи\. Брой секундите/;

/** advisorPeekSummary.test.tsx's two-lines-of-24 wrap. */
function wrap24(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.trim().split(/\s+/u)) {
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= 24) cur += ` ${w}`;
    else { out.push(cur); cur = w; }
  }
  if (cur !== "") out.push(cur);
  return out;
}

describe("T3 the dark card teaches the three postures and claims nothing it cannot see", () => {
  const p = controllerWaitAdvisorPrompt(true);

  it("is the ruled card (W1) and the ruled phone line (K2′), with no chip", () => {
    expect(p.textBg).toBe(DARK_CARD);
    expect(p.peekBg).toBe(DARK_PEEK);
    expect(p.keys).toEqual([]);
  });

  it("names the officer and all three postures, in the sweep161 tokens", () => {
    for (const token of ["регулировчик", "позата", "страничен профил", "гърди", "ръка горе"]) expect(p.textBg).toContain(token);
    expect(p.textBg).toMatch(/гърди\/гръб[^;]*стоиш/u); // chest or back — stop
    expect(p.textBg).toMatch(/страничен профил[^;]*минаваш/u); // side-on — go
    expect(p.textBg).toMatch(/ръка горе[^;]*чакаш/u); // arm up — wait
  });

  it("names no lamp, approves no wait, orders no move, and fits the 240 px column", () => {
    expect(p.textBg).not.toMatch(FORBIDDEN);
    expect(p.textBg).not.toMatch(/светофар|лампа|над светофара|светофара за/u);
    expect(p.textBg).not.toContain("Чакаш правилно");
    expect(p.textBg).not.toMatch(/Тръгвай|Потегли|Мини сега/u);
    expect(p.textBg).not.toMatch(LAWFUL_WAIT_RE);
    expect(p.textBg).not.toMatch(LAWFUL_WAIT_CARD_RE);
    expect(p.textBg.length).toBeGreaterThan(40);
    expect(p.textBg.length).toBeLessThan(150);
  });

  it("its peek finishes in two lines of 24 with no figure, article or verdict word", () => {
    const lines = wrap24(p.peekBg!);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.every((l) => l.length <= 24)).toBe(true);
    expect(p.peekBg).not.toMatch(/\d|(?<!\p{L})(?:чл|ал)\.|ЗДвП|грешн|правилн/u);
    expect(p.peekBg).not.toMatch(FORBIDDEN);
  });

  it("the OFFICER table's card fields read the dark card and the dark peek by name (K3), the voice keeps its own line", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "modules", "sim", "lessons", "advisor.ts"), "utf-8");
    const at = src.indexOf("const OFFICER_LAMPS_DARK_HALT_COPY");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf("\n};", at));
    for (const f of ["cardBg", "convictedCardBg"]) expect(block, f).toMatch(new RegExp(`\\b${f}:\\s*CONTROLLER_WAIT_CARD_DARK_BG\\s*,`));
    for (const f of ["cardPeekBg", "convictedCardPeekBg"]) expect(block, f).toMatch(new RegExp(`\\b${f}:\\s*OFFICER_DARK_PEEK_BG\\s*,`));
    expect(block).toMatch(/namedPeekBg:\s*"Тук важи само неговата поза\."/u);
    expect(block).not.toContain("не лампата");
    // ONE source for the peek: the hoisted constant holds the ruled string.
    expect(src).toMatch(/const OFFICER_DARK_PEEK_BG = "Тук важи само позата на регулировчика\.";/u);
  });

  it.runIf(existsSync(path.join(REPO_ROOT, "tools", "mobile", "lesson-audit.mjs")))(
    "the two mirrored matchers are still the audit harness's own (main tree only)",
    () => {
      const tools = readFileSync(path.join(REPO_ROOT, "tools", "mobile", "lesson-audit.mjs"), "utf-8");
      expect(tools).toContain(`const LAWFUL_WAIT_RE = ${LAWFUL_WAIT_RE.toString()};`);
      expect(tools.replace(/\s+/g, " ")).toContain(`const LAWFUL_WAIT_CARD_RE = ${LAWFUL_WAIT_CARD_RE.toString()};`);
    },
  );
});

// --- T4 -------------------------------------------------------------------------

describe("T4 the two live-lamp officer drills keep every word they had", () => {
  it(
    "every committed trace × every rung: the officer card they paint is the live card, and nothing of the dark copy reaches them",
    () => {
      // Read without asserting: this test is the PRESERVATION half and is green on
      // 479127b too (its mutant is M4).
      const row = ((catalog as Record<string, unknown>).CONTROLLER_SIGNAL_ACT_COPY as Record<string, ActRow> | undefined)?.lampsDark;
      const darkStrings = [DARK_CARD, DARK_PEEK, ...(row ? [row.explanationBg, row.peekBg, row.correctiveBg] : [])];
      for (const id of LIVE_DRILLS) {
        let officerTicks = 0;
        let drivesWithOfficer = 0;
        for (const d of drivesOf(id, false)) {
          let here = 0;
          for (const k of d.ticks) {
            if (k.card !== null && /регулировчик/u.test(k.card) && /позата/u.test(k.card)) {
              expect(k.card, `${id} ${d.name} t=${k.t}`).toBe(LIVE_CARD);
              expect(k.peek, `${id} ${d.name} t=${k.t}`).toBe(LIVE_PEEK);
              here++;
            }
          }
          officerTicks += here;
          if (here > 0) drivesWithOfficer++;
          const shown = [...d.ticks.flatMap((k) => [k.card ?? "", k.peek ?? ""]), ...d.lines, d.outcome.debrief].join("\n");
          for (const s of darkStrings) expect(shown.includes(s), `${id} ${d.name} shows dark-lamp copy «${s.slice(0, 40)}…»`).toBe(false);
          for (const e of d.outcome.session.events) {
            if (e.kind !== "violation" || e.code !== "CONTROLLER_SIGNAL_VIOLATED") continue;
            expect(e.detail, `${id} ${d.name}`).toBeUndefined();
            expect(e.explanationBg).toBe(VIOLATIONS.CONTROLLER_SIGNAL_VIOLATED.explanationBg);
            expect(e.explanationBg).toContain("Зеленият светофар не разрешава нищо");
          }
        }
        // Positive control (measured at 479127b): the officer card is painted on
        // 6 drives of sc-sig-controller-live (2237 / 860 ticks × 3 rungs) and on 4
        // of sc-signal-controller (968 ticks × L1, L2, L3, L5).
        expect(drivesWithOfficer, id).toBeGreaterThanOrEqual(4);
        expect(officerTicks, id).toBe(id === "sc-sig-controller-live" ? 3 * (2237 + 860) : 4 * 968);
      }
    },
    TIMEOUT,
  );
});

// --- T5 -------------------------------------------------------------------------

function violationsFor(event: SimTickEvent) {
  return reduceTick(createRuleEngine(), tick(10, { speedKmh: 20, events: [event] })).events.filter(
    (e) => e.kind === "violation",
  );
}

describe("T5 the reducer names the dark-lamp halt for what it was, and only that one", () => {
  const base = { kind: "stopLineCrossed", control: "trafficLight" } as const;
  const pooled = VIOLATIONS.CONTROLLER_SIGNAL_VIOLATED;

  it("{controller: halt, lampsDark: true}: same code, points, severity, title and lawRef; the act's words", () => {
    const [v, ...rest] = violationsFor({ ...base, lampsDark: true, controller: "halt" });
    expect(rest).toEqual([]);
    expect(v.code).toBe("CONTROLLER_SIGNAL_VIOLATED");
    expect(v.detail).toBe(ACT_DETAIL);
    expect((catalog as Record<string, unknown>).CONTROLLER_ACT_LAMPS_DARK, "the detail is a named exported constant (W3)").toBe("lampsDark");
    expect(v.titleBg).toBe(pooled.titleBg);
    expect(v.explanationBg).toBe(actRow().explanationBg);
    expect(v.lawRef).toBe(pooled.lawRef);
    expect(v.points).toBe(pooled.points);
    expect(v.severityClass).toBe(pooled.severityClass);
    expect(v.terminateSession).toBe(pooled.terminateSession === true ? true : undefined);
    expect(v.explanationBg).not.toMatch(FORBIDDEN);
    expect(violationPeekBg(v.code, v.detail)).toBe("Позата му те спираше.");
    expect(violationCorrectiveBg(v.code, v.detail)).not.toMatch(FORBIDDEN);
  });

  it("{controller: halt} on every LIT lamp: no detail, the pooled paragraph byte for byte", () => {
    for (const lightState of ["red", "redYellow", "green", "yellow"] as const) {
      const [v, ...rest] = violationsFor({ ...base, lightState, controller: "halt" });
      expect(rest).toEqual([]);
      expect(v.code, lightState).toBe("CONTROLLER_SIGNAL_VIOLATED");
      expect(v.detail, lightState).toBeUndefined();
      expect(v.explanationBg, lightState).toBe(pooled.explanationBg);
      expect(violationPeekBg(v.code, v.detail)).toBe(pooled.peekBg);
      expect(violationCorrectiveBg(v.code, v.detail)).toBe(pooled.correctiveBg);
    }
  });

  it("the act row carries no lawRef of its own, and its peek is one body line under the two-line title", () => {
    const row = actRow();
    expect(row.lawRef).toBeUndefined();
    expect(row.titleBg).toBe(pooled.titleBg);
    expect(row.peekBg.length).toBeLessThanOrEqual(26);
    expect(PER_ACT_COPY.CONTROLLER_SIGNAL_VIOLATED?.lampsDark, "registered in PER_ACT_COPY").toBe(row);
  });

  it("W9 — the one display timer that moves: the «Защо» reading time, +1,134 ms", () => {
    expect(pooled.explanationBg.length).toBe(276);
    expect(actRow().explanationBg.length).toBe(293);
    expect(toastReadMs(293) - toastReadMs(276)).toBe(1134);
  });
});

// --- T6 -------------------------------------------------------------------------

describe("T6 the server's rebuild, the debrief and the end card say what the client said", () => {
  it(
    "the two mistake demos at L1–L4: wire round trip, debrief and end-card reason carry the act, never «Зеленият светофар…»",
    () => {
      const act = actRow();
      let convictions = 0;
      for (const d of postures().filter((x) => x.name.startsWith("mistake-"))) {
        const client = d.outcome.session.events.filter((e) => e.kind === "violation" && e.code === "CONTROLLER_SIGNAL_VIOLATED");
        expect(client.length, d.name).toBe(1);
        const wire = JSON.parse(JSON.stringify(serializeRuleEvents(d.outcome.session.events)));
        const rebuilt = (rebuildRuleEvents(wire) ?? []).filter((e) => e.kind === "violation" && e.code === "CONTROLLER_SIGNAL_VIOLATED");
        expect(rebuilt.length, d.name).toBe(1);
        const [c, s] = [client[0]!, rebuilt[0]!];
        if (c.kind !== "violation" || s.kind !== "violation") throw new Error("unreachable");
        expect(s.detail, d.name).toBe(ACT_DETAIL);
        expect(s.titleBg).toBe(c.titleBg);
        expect(s.explanationBg).toBe(c.explanationBg);
        expect(s.explanationBg, d.name).toBe(act.explanationBg);
        expect(violationPeekBg(s.code, s.detail)).toBe(act.peekBg);
        expect(violationCorrectiveBg(s.code, s.detail)).toBe(act.correctiveBg);
        expect(d.outcome.debrief, d.name).toContain(act.correctiveBg);
        expect(d.outcome.debrief, d.name).toContain(act.explanationBg);
        expect(d.outcome.debrief, d.name).not.toContain("Зеленият светофар");
        expect(d.outcome.debrief, d.name).not.toMatch(/не светофара|над светофара/u);
        // The end card's «Грешката на този урок» rows read the same act.
        const result: LessonResult = {
          ...d.outcome.result,
          passed: false,
          lessonMistakes: [{ code: c.code, t: c.t, charged: false, detail: c.detail, titleBg: c.titleBg }],
        };
        const [reason] = lessonMistakeReasonsBg(result);
        expect(reason?.explanationBg, d.name).toBe(act.explanationBg);
        expect(reason?.correctiveBg, d.name).toBe(act.correctiveBg);
        convictions++;
      }
      expect(convictions).toBe(8);
    },
    TIMEOUT,
  );
});
