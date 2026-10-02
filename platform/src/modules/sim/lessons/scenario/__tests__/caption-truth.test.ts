/**
 * CAPTION TRUTH for the three keep-right lessons — every recorded demo of
 * sc-ov-keep-right, sc-ln-boulevard-discipline and sc-vp-police-stop (every
 * trace any round of the 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» repair
 * touched) may only claim, in a caption, an action its recording performs.
 * The grammar, its scopes and its refusals are documented in `captionTruth.ts`.
 *
 * The matcher is tested FIRST on synthetic recordings — each rule must turn a
 * false caption red and leave a true one green — because a truth check that
 * cannot fail is worse than none. Round 3 added the rules the round-2 verifier
 * walked past (its probes B1–B6, C1, D1–D2, E1–E2 are cases below): a shoulder
 * look said as «обръща глава» / «мъртвата зона», «поглед назад»,
 * «пътепоказател», «намалява», the car's LANE, a false description inside a
 * sentence that carries a citation, «Без да …,» read as a denial, and a claim
 * borrowing an event from half a minute earlier.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { TraceEvent, TraceEventKind } from "../../../traces/types";
import { LOOKBACK_SEC, checkCaptionTruth, checkCaptionWindow, type CaptionTrace, type LaneModel } from "./captionTruth";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const LESSONS = ["sc-ov-keep-right", "sc-ln-boulevard-discipline", "sc-vp-police-stop"] as const;
const LANES: LaneModel = { leftX: 4.06, rightX: 12.19 };

/**
 * A synthetic recording: 1 Hz samples for `seconds`, an optional brake /
 * standstill window, an optional speed profile and an optional lateral path
 * (default: the right lane throughout).
 */
function rec(
  captions: [number, string][],
  events: [number, TraceEventKind, string?][],
  opts: {
    brake?: { from: number; to: number; stopAt?: number };
    seconds?: number;
    speed?: (t: number) => number;
    x?: (t: number) => number;
  } = {},
): CaptionTrace {
  const { brake, seconds = 20, speed, x } = opts;
  const samples = Array.from({ length: seconds + 1 }, (_, t) => ({
    tSec: t,
    brakeOn: brake ? t >= brake.from && t <= brake.to : false,
    speedKmh: speed ? speed(t) : brake?.stopAt !== undefined && t >= brake.stopAt ? 0 : 30,
    x: x ? x(t) : LANES.rightX,
  }));
  const ev: TraceEvent[] = [
    ...captions.map(([tSec, textBg]) => ({ tSec, kind: "annotation" as const, textBg })),
    ...events.map(([tSec, kind, detail]) => ({ tSec, kind, ...(detail ? { detail } : {}) })),
  ].sort((a, b) => a.tSec - b.tSec);
  return { samples, events: ev };
}
const fails = (t: CaptionTrace) => checkCaptionTruth(t, LANES).failures;

describe("the matcher — each rule turns a false caption red and a true one green", () => {
  it("an affirmed mirror + right indicator is true only when both events are in scope", () => {
    const words = "Дясната е свободна: огледало, десен мигач — и плавно вдясно.";
    expect(fails(rec([[5, words]], [[5, "glance-right"], [5, "signal-on", "right"]]))).toEqual([]);
    expect(fails(rec([[5, words]], [[5, "glance-right"]]))).toHaveLength(1); // no indicator
    expect(fails(rec([[5, words]], [[5, "glance-right"], [5, "signal-on", "left"]]))).toHaveLength(1); // wrong side
    expect(fails(rec([[5, words]], [[5, "signal-on", "right"]]))).toHaveLength(1); // no mirror
  });

  it("a named mirror side must match the glance («дясното огледало» is not the rear one)", () => {
    const words = "Поглед в дясното огледало и плавно вдясно.";
    expect(fails(rec([[5, words]], [[5, "glance-right"]]))).toEqual([]);
    expect(fails(rec([[5, words]], [[5, "glance-rear"]]))).toHaveLength(1);
  });

  it("a RIGHT-shoulder claim can never be true — even with a (left) shoulder event recorded", () => {
    const words = "Огледало, десен мигач, поглед през рамо — и плавно вдясно.";
    const t = rec([[5, words]], [[5, "glance-right"], [5, "signal-on", "right"], [5, "glance-shoulder"]]);
    expect(fails(t)).toHaveLength(1);
    expect(fails(t)[0]).toMatch(/LEFT one/);
  });

  it("a left-side shoulder claim needs the glance-shoulder event", () => {
    const words = "Огледало, ляв мигач, поглед през рамо — и плавно вляво.";
    expect(fails(rec([[5, words]], [[5, "glance-left"], [5, "signal-on", "left"], [5, "glance-shoulder"]]))).toEqual([]);
    expect(fails(rec([[5, words]], [[5, "glance-left"], [5, "signal-on", "left"]]))).toHaveLength(1);
  });

  it("«без …» denies: the event must be ABSENT from the scope", () => {
    const words = "Грешка: колата се прибира вдясно — без нито един мигач.";
    expect(fails(rec([[0, words]], [[5, "glance-right"]]))).toEqual([]);
    expect(fails(rec([[0, words]], [[12, "signal-on", "right"]]))).toHaveLength(1);
  });

  it("a word BEFORE «без» is still affirmed («аварийно спиране без причина» claims a brake)", () => {
    const words = "Аварийното спиране без причина изненадва движещия се зад теб.";
    expect(fails(rec([[10, words]], [], { brake: { from: 10, to: 12 } }))).toEqual([]);
    expect(fails(rec([[10, words]], []))).toHaveLength(1);
  });

  it("«Без да <глагол>, …» is an adverbial, not a denial of what follows the comma (round 3, verifier D1/D2)", () => {
    const words = "Без да бърза, водачът дава десен мигач и поглежда в огледалото.";
    // Round 2 read both as DENIED: the false sentence passed and the true one failed.
    expect(fails(rec([[5, words]], []))).toHaveLength(2);
    expect(fails(rec([[5, words]], [[5, "signal-on", "right"], [5, "glance-right"]]))).toEqual([]);
    // …while an action INSIDE the «без да» phrase is still denied.
    const inside = "Колата тръгва вдясно, без да светне мигач, и продължава.";
    expect(fails(rec([[5, inside]], []))).toEqual([]);
    expect(fails(rec([[5, inside]], [[5, "signal-on", "right"]]))).toHaveLength(1);
  });

  it("a verb negator next to an action word is UNRESOLVED — a red, never a guess", () => {
    const t = rec([[5, "Мигачът не светна и колата тръгна вдясно."]], [[5, "signal-on", "right"]]);
    expect(fails(t)).toHaveLength(1);
    expect(fails(t)[0]).toMatch(/unresolved/);
  });

  it("the default scope is «since the previous caption, to the end of this one's display» — not the whole drive", () => {
    // The glance at t=1 belongs to the first caption's stretch; the second caption, at 12, cannot borrow it.
    const t = rec([[0, "Потегляме."], [10, "Нищо особено."], [12, "Огледалото е проверено."]], [[1, "glance-right"]]);
    expect(fails(t)).toHaveLength(1);
    const ok = rec([[0, "Потегляме."], [10, "Нищо особено."], [12, "Огледалото е проверено."]], [[11, "glance-right"]]);
    expect(fails(ok)).toEqual([]);
  });

  it(`…and never further back than ${LOOKBACK_SEC} s: a claim at 30 cannot borrow a glance from 1 (round 3, verifier E1)`, () => {
    const far = rec([[0, "Потегляме."], [30, "Сега поглед в дясното огледало."]], [[1, "glance-right"]], { seconds: 40 });
    expect(fails(far)).toHaveLength(1);
    const near = rec([[0, "Потегляме."], [30, "Сега поглед в дясното огледало."]], [[29, "glance-right"]], { seconds: 40 });
    expect(fails(near)).toEqual([]);
    expect(LOOKBACK_SEC).toBe(10);
  });

  it("an event after the caption's 4 s display is out of its scope", () => {
    expect(fails(rec([[5, "Огледало и плавно вдясно."]], [[9.5, "glance-right"]]))).toHaveLength(1);
    expect(fails(rec([[5, "Огледало и плавно вдясно."]], [[8.5, "glance-right"]]))).toEqual([]);
  });

  it("«Готово» recaps the manoeuvre from 0; «Грешка:» previews the whole recording", () => {
    const done = [[0, "Старт."], [10, "Карай."], [15, "Готово: огледало, мигач, вдясно."]] as [number, string][];
    const late = [[0, "Старт."], [10, "Карай."], [15, "Накрая: огледало, мигач, вдясно."]] as [number, string][];
    expect(fails(rec(done, [[3, "glance-right"], [3, "signal-on", "right"]]))).toEqual([]);
    expect(fails(rec(late, [[3, "glance-right"], [3, "signal-on", "right"]]))).toHaveLength(2);
    expect(fails(rec([[0, "Грешка: десният мигач светва."]], [[14, "signal-on", "right"]]))).toEqual([]);
  });

  it("…but a recap's brake / stop is about NOW: a brake in the first second does not make «плавно спиране накрая» true (verifier E2)", () => {
    const caps = [[0, "Старт."], [35, "Готово: плавно спиране накрая."]] as [number, string][];
    expect(fails(rec(caps, [], { seconds: 40, brake: { from: 0, to: 0 } }))).toHaveLength(1);
    expect(fails(rec(caps, [], { seconds: 40, brake: { from: 33, to: 36 } }))).toEqual([]);
  });

  it("an OFF claim («мигачът е изключен») needs a signal-off", () => {
    const words = "Готово — мигачът е изключен веднага след маневрата.";
    expect(fails(rec([[9, words]], [[5, "signal-on", "right"], [9, "signal-off"]]))).toEqual([]);
    expect(fails(rec([[9, words]], [[5, "signal-on", "right"]]))).toHaveLength(1);
  });

  it("the driver's own «сигнал» is an indicator claim, with its side («подава сигнал надясно», «десен сигнал»)", () => {
    const given = "Водачът подава сигнал надясно и се прибира.";
    expect(fails(rec([[5, given]], [[5, "signal-on", "right"]]))).toEqual([]);
    expect(fails(rec([[5, given]], [[5, "signal-on", "left"]]))).toHaveLength(1); // wrong side
    expect(fails(rec([[5, given]], []))).toHaveLength(1); // no indicator at all
    const named = "Подаден е десен сигнал и колата се прибира.";
    expect(fails(rec([[5, named]], [[5, "signal-on", "right"]]))).toEqual([]);
    expect(fails(rec([[5, named]], [[5, "signal-on", "left"]]))).toHaveLength(1);
  });

  it("any other «сигнал» is the officer's: not judged, but REPORTED — unread is never the same as absent", () => {
    const r = checkCaptionTruth(rec([[0, "Грешката: сигналът е видян… и водачът решава да го „заобиколи“."]], []));
    expect(r.claims).toHaveLength(0);
    expect(r.failures).toEqual([]);
    expect(r.otherSignals.map((s) => s.word)).toEqual(["сигналът"]);
    // «подаден сигнал за спиране» is the officer's order, not the driver's indicator.
    const order = checkCaptionTruth(rec([[0, "При подаден сигнал за спиране колата продължава."]], []));
    expect(order.claims).toHaveLength(0);
    expect(order.otherSignals).toHaveLength(1);
    // …and a word the indicator lexeme DID read is not reported twice.
    const own = checkCaptionTruth(rec([[5, "Водачът подава сигнал надясно."]], [[5, "signal-on", "right"]]));
    expect(own.otherSignals).toEqual([]);
  });

  it("a stop verb needs a brake AND a standstill; «сигнал за спиране» is the officer's, not a claim", () => {
    expect(fails(rec([[10, "Спряхме плътно вдясно при полицая."]], [], { brake: { from: 8, to: 12, stopAt: 11 } }))).toEqual([]);
    expect(fails(rec([[10, "Спряхме плътно вдясно при полицая."]], [], { brake: { from: 8, to: 12 } }))).toHaveLength(1);
    const officer = checkCaptionTruth(rec([[10, "Полицаят остава зад колата — разпореждането за спиране е подминато."]], []));
    expect(officer.claims).toHaveLength(0);
  });
});

describe("round 3 — the claims the round-2 check walked past", () => {
  it("B1 «обръща глава надясно» is a shoulder look, and a RIGHT one — it can never be true", () => {
    const words = "Дясната е свободна: огледало, десен мигач, водачът обръща глава надясно — и плавно вдясно.";
    const f = fails(rec([[5, words]], [[5, "glance-right"], [5, "signal-on", "right"], [5, "glance-shoulder"]]));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/shoulder/);
    // to the left, it needs the event
    const left = "Огледало, ляв мигач, водачът обръща глава наляво — и излиза.";
    expect(fails(rec([[5, left]], [[5, "glance-left"], [5, "signal-on", "left"], [5, "glance-shoulder"]]))).toEqual([]);
    expect(fails(rec([[5, left]], [[5, "glance-left"], [5, "signal-on", "left"]]))).toHaveLength(1);
  });

  it("B2 «проверка на мъртвата зона» is a shoulder look; «мъртвата зона» with no look word is unresolved", () => {
    const words = "Огледало, ляв мигач, проверка на мъртвата зона — и излиза наляво.";
    expect(fails(rec([[5, words]], [[5, "glance-left"], [5, "signal-on", "left"], [5, "glance-shoulder"]]))).toEqual([]);
    expect(fails(rec([[5, words]], [[5, "glance-left"], [5, "signal-on", "left"]]))).toHaveLength(1);
    const place = fails(rec([[5, "Моторът остава в мъртвата зона."]], []));
    expect(place).toHaveLength(1);
    expect(place[0]).toMatch(/unresolved/);
  });

  it("B3 «поглед назад» needs the rear mirror or the shoulder", () => {
    expect(fails(rec([[5, "Поглед назад и плавно вдясно."]], []))).toHaveLength(1);
    expect(fails(rec([[5, "Поглед назад и плавно вдясно."]], [[5, "glance-rear"]]))).toEqual([]);
    expect(fails(rec([[5, "Поглед назад и плавно вдясно."]], [[5, "glance-shoulder"]]))).toEqual([]);
    expect(fails(rec([[5, "Поглед назад и плавно вдясно."]], [[5, "glance-right"]]))).toHaveLength(1);
  });

  it("B4 «пътепоказател» is the indicator, with its side", () => {
    const words = "Десният пътепоказател свети и колата тръгва вдясно.";
    expect(fails(rec([[5, words]], []))).toHaveLength(1);
    expect(fails(rec([[5, words]], [[5, "signal-on", "left"]]))).toHaveLength(1);
    expect(fails(rec([[5, words]], [[5, "signal-on", "right"]]))).toEqual([]);
  });

  it("B5 «намалява» needs the brake or a real drop in speed", () => {
    expect(fails(rec([[5, "Водачът намалява рязко."]], []))).toHaveLength(1);
    expect(fails(rec([[5, "Водачът намалява рязко."]], [], { brake: { from: 5, to: 6 } }))).toEqual([]);
    expect(fails(rec([[5, "Водачът намалява рязко."]], [], { speed: (t) => (t < 6 ? 40 : 30) }))).toEqual([]);
    expect(fails(rec([[5, "Водачът намалява рязко."]], [], { speed: (t) => (t < 6 ? 40 : 39) }))).toHaveLength(1);
  });

  it("B6 the car's LANE is read off the samples: «колата вече е в лявата лента» needs the car there", () => {
    const words = "Колата вече е в лявата лента.";
    expect(fails(rec([[5, words]], []))).toHaveLength(1); // the synthetic car is in the right lane
    expect(fails(rec([[5, words]], [], { x: (t) => (t < 4 ? LANES.rightX : LANES.leftX) }))).toEqual([]);
    // «на самата линия» — between the two
    const line = "И увисва на самата линия.";
    expect(fails(rec([[5, line]], [], { x: () => LANES.rightX }))).toHaveLength(1);
    expect(fails(rec([[5, line]], [], { x: () => (LANES.leftX + LANES.rightX) / 2 }))).toEqual([]);
    // a preview of a move visits both
    const move = "Грешка: колата се прибира от лявата в дясната лента.";
    expect(fails(rec([[0, move]], [], { x: (t) => (t < 8 ? LANES.leftX : LANES.rightX) }))).toEqual([]);
    expect(fails(rec([[0, move]], [], { x: () => LANES.rightX }))).toHaveLength(1);
  });

  it("…a lane claim with no lane model, or over samples without x, is unresolved — never assumed true", () => {
    const words = "Колата вече е в лявата лента.";
    const t = rec([[5, words]], [], { x: () => LANES.leftX });
    expect(checkCaptionTruth(t).failures).toHaveLength(1);
    expect(checkCaptionTruth(t).failures[0]).toMatch(/no lane model/);
    const noX: CaptionTrace = {
      ...t,
      samples: t.samples.map((s) => ({ tSec: s.tSec, brakeOn: s.brakeOn, speedKmh: s.speedKmh })),
    };
    expect(checkCaptionTruth(noX, LANES).failures[0]).toMatch(/carry no x/);
  });

  it("…and a lane the sentence sets as the GOAL («да се прибереш в дясната») must be reached by the recording, whenever", () => {
    const words = "Задачата е да се прибереш в дясната.";
    expect(fails(rec([[0, words]], [], { x: (t) => (t < 15 ? LANES.leftX : LANES.rightX) }))).toEqual([]);
    expect(fails(rec([[0, words]], [], { x: () => LANES.leftX }))).toHaveLength(1);
  });

  it("a look word the grammar cannot bind to an event is REPORTED («погледът остава напред»)", () => {
    const r = checkCaptionTruth(rec([[0, "Грешка: десният мигач светва — но погледът остава напред."]], [[5, "signal-on", "right"]]), LANES);
    expect(r.failures).toEqual([]);
    expect(r.otherLooks.map((l) => l.word)).toEqual(["погледът"]);
    // …while a look word next to its mirror is part of that claim, not a second one.
    const bound = checkCaptionTruth(rec([[5, "Поглед в дясното огледало."]], [[5, "glance-right"]]), LANES);
    expect(bound.otherLooks).toEqual([]);
  });
});

describe("round 3 — a citation no longer carries a description past the check (rule 5)", () => {
  const cited = (text: string, events: [number, TraceEventKind, string?][] = []) =>
    checkCaptionTruth(rec([[5, text]], events), LANES);

  it("a clause with a MODAL states the rule: counted, not judged", () => {
    const r = cited("При сигнал за спиране водачът е длъжен да спре плавно вдясно (чл. 103).");
    expect(r.failures).toEqual([]);
    expect(r.claims).toHaveLength(0);
    expect(r.ruleClaims.map((c) => c.word)).toEqual(["спре"]);
  });

  it("a clause with a GENERIC marker and no actor states the rule; its appositive list does too", () => {
    const r = cited("Огледало, мигач, поглед през рамо — и чак тогава волан: преди маневрата се убеждаваш, че няма да създадеш опасност (чл. 25, ал. 1).");
    expect(r.failures).toEqual([]);
    expect(r.claims).toHaveLength(0);
    expect(r.ruleClaims.map((c) => c.action).sort()).toEqual(["indicator", "mirror", "shoulder"]);
    const tail = cited("Сигналът иска СПОКОЙНО спиране плътно вдясно при полицая — огледало, мигач, плавно (чл. 103).");
    expect(tail.failures).toEqual([]);
    expect(tail.ruleClaims).toHaveLength(3);
  });

  it("C1/CP7: a DESCRIPTION inside a cited sentence is judged — «…(чл. 15, ал. 2, т. 2), а водачът пак поглежда през рамо и дава ляв мигач — …»", () => {
    const words =
      "Тук, в града, лентата е по избор (чл. 15, ал. 2, т. 2), а водачът пак поглежда през рамо и дава ляв мигач — извън населено място или над 80 км/ч дясната е задължителна (ал. 1).";
    const r = cited(words);
    // Round 2: no claims at all, no failure. Now both are read and both are false.
    expect(r.claims.map((c) => c.action).sort()).toEqual(["indicator", "shoulder"]);
    expect(r.failures).toHaveLength(2);
    // with the events it claims, only the unreadable shoulder side is left
    // (the sentence names «ляв» and «дясната»)
    const withEvents = cited(words, [[5, "glance-shoulder"], [5, "signal-on", "left"]]);
    expect(withEvents.failures).toHaveLength(1);
    expect(withEvents.failures[0]).toMatch(/both sides/);
  });

  it("a description that only APPENDS a citation is still a description", () => {
    const r = cited("Водачът поглежда през рамо и дава ляв мигач (чл. 25, ал. 1).");
    expect(r.claims).toHaveLength(2);
    expect(r.failures).toHaveLength(2);
    expect(cited("Водачът поглежда през рамо и дава ляв мигач (чл. 25, ал. 1).", [[5, "glance-shoulder"], [5, "signal-on", "left"]]).failures).toEqual([]);
  });

  it("a modal next to an indicative action verb, a generic marker next to the actor, or no marker at all — UNRESOLVED", () => {
    const both = cited("Водачът е длъжен да спре и затова поглежда през рамо (чл. 103).", [[5, "glance-shoulder"]]);
    expect(both.failures.length).toBeGreaterThan(0);
    expect(both.failures.join(" ")).toMatch(/unresolved/);
    const generic = cited("Преди маневрата водачът поглежда през рамо (чл. 25, ал. 1).", [[5, "glance-shoulder"]]);
    expect(generic.failures.join(" ")).toMatch(/unresolved/);
    const bare = cited("Огледало и мигач (чл. 25, ал. 1).", [[5, "glance-right"], [5, "signal-on", "right"]]);
    expect(bare.failures).toHaveLength(2);
    expect(bare.failures.join(" ")).toMatch(/unresolved/);
  });

  it("an appositive list is the rule only across « — » or «: » — joined by «, а» it is a clause of its own, and unresolved", () => {
    const dash = cited("Водачът е длъжен да спре (чл. 103) — огледало, мигач.");
    expect(dash.failures).toEqual([]);
    expect(dash.ruleClaims).toHaveLength(3);
    const comma = cited("Водачът е длъжен да спре (чл. 103), а огледало и мигач.", [[5, "glance-right"], [5, "signal-on", "right"]]);
    expect(comma.failures).toHaveLength(2);
    expect(comma.failures.join(" ")).toMatch(/no rule marker/);
  });

  it("an UNCITED sentence is always a description — a modal does not make it a rule", () => {
    const r = checkCaptionTruth(rec([[5, "Водачът трябва да даде мигач и дава десен мигач."]], []), LANES);
    expect(r.ruleClaims).toHaveLength(0);
    expect(r.failures.length).toBeGreaterThan(0);
  });
});

describe("round 4 (R3-5) — the five probes the round-3 verifier walked past the checker, now in its vocabulary", () => {
  // Each was a false caption over a recording with none of its events, and the
  // round-3 checker read nothing in it. The vocabulary grows; the doctrine does
  // not change — it is still a vocabulary, and the verbatim pin is still the gate.
  const LEFT = () => LANES.leftX;

  it("«проверява сляпото петно» is a shoulder look: with no glance-shoulder it is a red (and a RIGHT-side one can never be true)", () => {
    // The product's only shoulder look is the LEFT one, so over a move to the right it is false whatever was recorded.
    const right = "Водачът проверява сляпото петно и тръгва вдясно.";
    expect(fails(rec([[5, right]], []))).toHaveLength(1);
    expect(fails(rec([[5, right]], [[5, "glance-shoulder"]]))).toHaveLength(1);
    const left = "Водачът проверява сляпото петно и тръгва наляво.";
    expect(fails(rec([[5, left]], []))).toHaveLength(1);
    expect(fails(rec([[5, left]], [[5, "glance-shoulder"]]))).toEqual([]);
    // …and, like «мъртвата зона», with no look word it is unreadable, not true.
    const place = checkCaptionTruth(rec([[5, "В сляпото петно може да има мотор."]], []), LANES);
    expect(place.failures.join(" ")).toMatch(/unreadable/);
  });

  it("«мига надясно» is the right indicator: with no signal-on right it is a red", () => {
    const words = "Колата мига надясно и продължава.";
    expect(fails(rec([[5, words]], []))).toHaveLength(1);
    expect(fails(rec([[5, words]], [[5, "signal-on", "left"]]))).toHaveLength(1);
    expect(fails(rec([[5, words]], [[5, "signal-on", "right"]]))).toEqual([]);
    // «в мига, в който…» is the MOMENT, not the lamp — not read as an indicator claim.
    const moment = checkCaptionTruth(rec([[5, "В мига, в който лентата се освободи, колата тръгва."]], []), LANES);
    expect(moment.claims.filter((c) => c.action === "indicator")).toEqual([]);
  });

  it("«заковава на място» is a stop: with no brake, or with no standstill, it is a red", () => {
    const words = "Водачът заковава на място.";
    expect(fails(rec([[5, words]], []))).toHaveLength(1);
    expect(fails(rec([[5, words]], [], { brake: { from: 5, to: 7 } }))).toHaveLength(1); // braked, never stood still
    expect(fails(rec([[5, words]], [], { brake: { from: 5, to: 7, stopAt: 7 } }))).toEqual([]);
  });

  it("«Колата вече е вдясно» is a lane claim: with the car in the LEFT lane throughout it is a red", () => {
    const words = "Колата вече е вдясно.";
    expect(fails(rec([[5, words]], [], { x: LEFT }))).toHaveLength(1);
    expect(fails(rec([[5, words]], []))).toEqual([]); // the default path is the right lane
    const left = "Колата още е вляво.";
    expect(fails(rec([[5, left]], []))).toHaveLength(1);
    expect(fails(rec([[5, left]], [], { x: LEFT }))).toEqual([]);
  });

  it("«Колата се прибра» is a move INTO the right lane: a car that never left the left lane makes it a red", () => {
    const words = "Колата се прибра.";
    expect(fails(rec([[5, words]], [], { x: LEFT }))).toHaveLength(1);
    // a real return: left until 4, right from 6
    expect(fails(rec([[5, words]], [], { x: (t) => (t < 5 ? LANES.leftX : LANES.rightX) }))).toEqual([]);
    // «прибира се» in the present, and the verifier's own sentence (F4): both claims are read
    const f4 = checkCaptionTruth(rec([[5, "Колата мига надясно и се прибира."]], [], { x: LEFT }), LANES);
    expect(f4.failures).toHaveLength(2);
    expect(f4.claims.map((c) => c.action).sort()).toEqual(["indicator", "lane"]);
    // the GOAL form is still a goal: «да се прибереш» is true once the recording reaches the right lane at all
    const goal = "Задачата е да се прибереш.";
    expect(fails(rec([[0, goal]], [], { x: (t) => (t < 15 ? LANES.leftX : LANES.rightX) }))).toEqual([]);
    expect(fails(rec([[0, goal]], [], { x: LEFT }))).toHaveLength(1);
  });
});

/**
 * What the check reads across the nine recordings today. Exact: it moves only
 * with the captions (pinned verbatim) or with the grammar.
 */
const CENSUS = {
  // 8 lane claims: «в ЛЯВАТА лента» / «в дясната» / «от лявата в дясната» /
  // «на самата линия» — read against the samples' x since round 3.
  byAction: { mirror: 9, indicator: 11, shoulder: 2, brake: 3, lane: 8 } as Record<string, number>,
  denials: 6,
  goals: 1,
  // Two descriptions name the officer's signal («сигналът е видян…», «сигналът
  // стряска»); the lane lessons have none. A new bare «сигнал» is a red here.
  officerSignals: {
    "sc-vp-police-stop/mistake-drive-past": 1,
    "sc-vp-police-stop/mistake-panic-stop": 1,
  } as Record<string, number>,
  // «…но погледът остава напред» in the two no-mirror previews: a look the
  // grammar cannot bind to an event (it names a moment, not a recording).
  unboundLooks: {
    "sc-ln-boulevard-discipline/mistake-no-mirror": ["погледът"],
    "sc-ov-keep-right/mistake-no-mirror": ["погледът"],
  } as Record<string, string[]>,
  // Action words inside RULE clauses (rule 5), per recording.
  ruleClaims: {
    "sc-ov-keep-right/shadow-correct": 0,
    "sc-ov-keep-right/mistake-no-indicator": 4,
    "sc-ov-keep-right/mistake-no-mirror": 3,
    "sc-ln-boulevard-discipline/shadow-correct": 0,
    "sc-ln-boulevard-discipline/mistake-no-mirror": 3,
    "sc-ln-boulevard-discipline/mistake-weaving": 1,
    "sc-vp-police-stop/shadow-correct": 1,
    "sc-vp-police-stop/mistake-drive-past": 1,
    "sc-vp-police-stop/mistake-panic-stop": 3,
  } as Record<string, number>,
};

interface Trace {
  samples: { tSec: number; x: number; brakeOn: boolean; speedKmh: number }[];
  events: TraceEvent[];
}
const specOf = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};
const traceRefs = (id: string) => {
  const s = specOf(id);
  return [s.shadow, ...s.mistakes.map((m) => m.traceRef)].map((r) => r.path);
};
/** The lane centres of a lesson's map, read from the committed district. */
function lanesOf(id: string): LaneModel {
  const meta = (
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "world", `${specOf(id).map.districtId}.json`), "utf-8")) as {
      meta: { scenario: Record<string, number> };
    }
  ).meta.scenario;
  const rightX = meta.laneCenterRightM ?? meta.laneCenterOuterM;
  const leftX = meta.laneCenterLeftM ?? meta.laneCenterInnerM;
  if (typeof rightX !== "number" || typeof leftX !== "number") throw new Error(`${id}: the map carries no lane centres`);
  return { leftX, rightX };
}

describe("every caption of the three lessons' recordings is true of its recording", () => {
  const byAction: Record<string, number> = {};
  const ruleClaims: Record<string, number> = {};
  const officerSignals: Record<string, number> = {};
  const unboundLooks: Record<string, string[]> = {};
  let denials = 0;
  let goals = 0;
  for (const id of LESSONS) {
    it(`${id}: the map's lane centres are the two-lane boulevard's (the lane model the claims are read against)`, () => {
      expect(lanesOf(id)).toEqual(LANES);
    });
    for (const rel of traceRefs(id)) {
      it(`${rel}`, () => {
        const trace = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as Trace;
        const r = checkCaptionTruth(trace, lanesOf(id));
        // Census first, so a failing recording does not also blank the pins below.
        for (const c of r.claims) byAction[c.action] = (byAction[c.action] ?? 0) + 1;
        const key = rel.replace("content/traces/", "").replace(".trace.json", "");
        ruleClaims[key] = r.ruleClaims.length;
        if (r.otherSignals.length > 0) officerSignals[key] = r.otherSignals.length;
        if (r.otherLooks.length > 0) unboundLooks[key] = r.otherLooks.map((l) => l.word);
        denials += r.claims.filter((c) => c.polarity === "deny").length;
        goals += r.claims.filter((c) => c.goal === true).length;
        expect(r.failures).toEqual([]);
      });
    }
  }

  it("the check is not vacuous: the census of claims it READ across the nine recordings", () => {
    // Runs after the per-trace cases above (vitest keeps file order). Exact, so
    // a matcher that stops seeing a kind of claim is a red, not a quieter green
    // (the captions themselves are pinned verbatim by
    // keep-right-lessons-reviewed-text.test.ts, so this moves only with them).
    expect(byAction).toEqual(CENSUS.byAction);
    expect(denials).toBe(CENSUS.denials);
    expect(goals).toBe(CENSUS.goals);
  });

  it("every «сигнал» the check did NOT read as the driver's indicator is counted — the officer's signal, in the police lesson only", () => {
    expect(officerSignals).toEqual(CENSUS.officerSignals);
  });

  it("every look word the check could NOT bind to an event is listed — «погледът остава напред» in the two no-mirror previews", () => {
    expect(unboundLooks).toEqual(CENSUS.unboundLooks);
  });

  it("the rule exemption is counted per recording, by action word — a citation cannot be added to walk a claim past the check", () => {
    // Only a clause that states THE RULE (rule 5) is exempt, and how many
    // action words take that way out is pinned.
    expect(ruleClaims).toEqual(CENSUS.ruleClaims);
  });
});

describe("a theory beat's caption over a recording of the three lessons is true of the cut it plays", () => {
  interface Beat {
    id: string;
    visual?: { kind: string; templateId?: string; file?: string; fromSec?: number; toSec?: number; captionBg?: string };
  }
  const cuts: { where: string; lesson: (typeof LESSONS)[number]; file: string; from: number; to: number; caption: string }[] = [];
  const pairs: string[] = [];
  const dir = path.join(REPO_ROOT, "content", "lessons");
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    const lesson = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as { id: string; beats: Beat[] };
    for (const b of lesson.beats) {
      const v = b.visual;
      if (!v?.templateId || !(LESSONS as readonly string[]).includes(v.templateId)) continue;
      if (v.kind === "trace" && v.file && v.fromSec !== undefined && v.toSec !== undefined && v.captionBg) {
        cuts.push({
          where: `${lesson.id}/${b.id}`,
          lesson: v.templateId as (typeof LESSONS)[number],
          file: v.file,
          from: v.fromSec,
          to: v.toSec,
          caption: v.captionBg,
        });
      } else {
        pairs.push(`${lesson.id}/${b.id}`);
      }
    }
  }

  it("the beats that play these recordings are the known ones (a new one is checked here, or listed as a pair)", () => {
    expect(cuts.map((c) => c.where)).toEqual(["l-admin-newdriver-police/b-police-interaction", "l-basics-obligations/b-right-side-rule"]);
    // A «pair» visual plays two whole recordings under one caption; its caption
    // is pinned verbatim (keep-right-lessons-reviewed-text) and not read here.
    expect(pairs).toEqual(["l-admin-newdriver-police/b-board-police-stop"]);
  });

  for (const cut of cuts) {
    it(`${cut.where}: «${cut.caption}» over ${cut.lesson}/${cut.file} ${cut.from}–${cut.to} s`, () => {
      const trace = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "content", "traces", cut.lesson, `${cut.file}.trace.json`), "utf-8"),
      ) as Trace;
      const r = checkCaptionWindow(trace, cut.caption, { fromSec: cut.from, toSec: cut.to }, lanesOf(cut.lesson));
      expect(r.failures).toEqual([]);
    });
  }

  it("…and the check binds: the same caption over a cut that lacks its events is a red", () => {
    const cut = cuts.find((c) => c.where === "l-basics-obligations/b-right-side-rule");
    expect(cut).toBeDefined();
    const trace = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "content", "traces", cut!.lesson, `${cut!.file}.trace.json`), "utf-8"),
    ) as Trace;
    // «Огледало, десен мигач, прибиране…» — true of 0–8.58, false of 10–20 (nothing happens there).
    expect(checkCaptionWindow(trace, cut!.caption, { fromSec: 10, toSec: 20 }, LANES).failures.length).toBeGreaterThan(0);
  });
});
