/**
 * «LIVE WHEN THE TASK USES IT» — founder ruling 2026-09-22, row
 * sc-vu-pass-clearance:d770323a. Which drills declare that their task relies on
 * the door mirrors, and does the declaration reach the compiled lesson that
 * LessonScene hands the cockpit?
 *
 * ROUND 2 — THE ROW WAS A CLASS, AND THE FIRST PASS FLAGGED ONE MEMBER OF IT.
 * The audited lesson's demand lives in its briefing («Огледало, мигач наляво…»),
 * and 24 other templates demand the same DOOR-mirror check in exactly the same
 * place — a lane change, an overtake, pulling in to the right, moving off from
 * the kerb, or a named лявото/дясното огледало. Flagging only the photographed
 * one would have shipped the ruling for one lesson and left the class open, so
 * the catalogue was walked and every demanding sentence is quoted beside the
 * flag it earned (`grep -n "DOOR-mirror check in" templates-*.ts`).
 *
 * WHAT THIS FILE HOLDS THAT A LIST OF IDS CANNOT: the class, in both
 * directions. The AUDIT below reads the briefing prose — which the product
 * predicate deliberately does not (doorMirrorTask.ts says why) — and asserts
 *   · every lesson whose briefing demands a door-mirror check is flagged by
 *     SOME channel, so the next template that demands one and is not flagged
 *     reds here instead of being noticed in a sweep a month later;
 *   · every explicit flag stands on such a sentence, so the flag cannot be
 *     sprinkled to buy a mirror pass;
 *   · lessons whose mirror is the INTERIOR one, or somebody else's, stay
 *     untasked — including a rubric moment that names «Огледало назад».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import {
  doorMirrorTaskSource,
  momentNamesDoorMirror,
  scenarioUsesDoorMirrors,
} from "../doorMirrorTask";
import { SCENARIO_TEMPLATES, scenarioById } from "../templates";
import type { ScenarioSpec } from "../types";
import { validateScenarioSpec } from "../validate";

const mustGet = (id: string): ScenarioSpec => {
  const s = scenarioById(id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};
const clone = (s: ScenarioSpec): ScenarioSpec => JSON.parse(JSON.stringify(s)) as ScenarioSpec;

// ---------------------------------------------------------------------------
// THE AUDIT — „does this drill's BRIEFING demand a door-mirror check?"
// ---------------------------------------------------------------------------
//
// This is the reader the product predicate refuses to be. It exists here
// because the flags are authored by hand, and a hand-authored set is exactly
// the thing that drifts: it is the class the audit holds, not the ids.
//
// IT REPORTS WHAT IT CANNOT READ. `demandingSentence` returns the SENTENCE, not
// a boolean, so a failure names the line an author has to look at; and the
// patterns are held against their own positive and negative cases below, so a
// matcher that has quietly stopped matching anything cannot pass this file by
// finding nothing.

/** The INTERIOR mirror, by the names the catalogue gives it — a look straight
 *  behind, which the interior glass answers and every tier already renders. */
const INTERIOR_MIRROR = /за\s+(?:задно|обратно)\s+виждане|огледал\S*\s+назад/iu;
/** A demand on the student's own DOOR mirror: named outright, or a mirror look
 *  paired with the sideways act it is for (migač + manoeuvre, shoulder check,
 *  «провери огледалото» before pulling in or out, «първо огледало, после
 *  мигач»). Each pattern has a case in „the audit reads what it claims to". */
const DOOR_MIRROR_DEMAND = [
  /(?:ляв|дясн)\S*\s+огледал/iu,
  /огледал\S*\s*(?:,|\s+и)\s*(?:десен\s+|ляв\s+)?мигач/iu,
  /провери\S*\s+огледал/iu,
  /поглед\S*\s+в\s+огледалото\s+и\s+през/iu,
  /първо\s+огледало/iu,
  /огледало,\s*поглед/iu,
  /огледал\S*\s+и\s+през/iu,
];
const sentences = (text: string): string[] => text.split(/(?<=[.!?…:])\s+/u);
/** The TASK, as the student is given it: the objective, the numbered steps and
 *  the examiner line. Not the mistake demos (those are the wrong way, and the
 *  structured channel already reads their codes) and not the teach cards. */
const briefing = (s: ScenarioSpec): string[] => [
  s.objectiveBg,
  ...s.instructionsBg.map((x) => x.textBg),
  s.teach.examinerBg,
];
/** The demanding sentence, or null — never a bare boolean. */
const demandingSentence = (s: ScenarioSpec): string | null => {
  for (const field of briefing(s)) {
    for (const sentence of sentences(field)) {
      if (INTERIOR_MIRROR.test(sentence)) continue;
      if (DOOR_MIRROR_DEMAND.some((re) => re.test(sentence))) return sentence;
    }
  }
  return null;
};

describe("the audit reads what it claims to", () => {
  it("matches the shapes the catalogue writes a door-mirror demand in", () => {
    const yes = [
      "Огледай се — дясното огледало, после през рамо — и пусни десен мигач.",
      "Огледало, мигач наляво и излез решително — подмини бавната кола без бавене.",
      "Без паника: провери огледалото, пусни десен мигач и започни плавно да намаляваш отрано.",
      "Преди колелата да се завъртят: поглед в огледалото и през ЛЯВОТО рамо.",
      "Първо огледът — огледало и през ЛЯВОТО рамо, чак после потегляш.",
      "По реда: огледало, ляв мигач, поглед през рамо, после плавно излизане в лявата лента.",
      "Лентите се сменят само с огледало и мигач, с ясна причина.",
    ];
    for (const s of yes) expect(DOOR_MIRROR_DEMAND.some((re) => re.test(s)), s).toBe(true);
  });

  it("…and does NOT match the interior mirror, or another driver's", () => {
    const no = [
      "Погледни в огледалото: кола е залепена на метри зад теб.",
      "Погледни в огледалото за задно виждане. Колата зад теб се движи с магистрална скорост.",
      "Огледай в огледалото за задно виждане, преди да се отклониш — заобикалянето също е маневра.",
      "Помни: предният те чете само по фаровете ти в огледалото си.",
      "Превключи на къси, щом настигнеш кола — иначе я заслепяваш през огледалата ѝ.",
      "Прибери се плавно надясно с десен мигач, щом целият камион е в огледалото.",
    ];
    for (const s of no) {
      const hit = !INTERIOR_MIRROR.test(s) && DOOR_MIRROR_DEMAND.some((re) => re.test(s));
      expect(hit, s).toBe(false);
    }
  });

  it("reports the SENTENCE, so a failure names the line to read", () => {
    expect(demandingSentence(mustGet("sc-pk-move-off"))).toMatch(/огледал/iu);
    expect(demandingSentence(mustGet("sc-park-45"))).toContain("дясното огледало");
    expect(demandingSentence(mustGet("sc-follow-tailgater"))).toBeNull();
  });
});

describe("the catalogue, both directions", () => {
  it("every briefing that demands a DOOR mirror is flagged — this is the class", () => {
    const missed = SCENARIO_TEMPLATES.filter(
      (s) => demandingSentence(s) !== null && !scenarioUsesDoorMirrors(s),
    ).map((s) => `${s.id}: «${demandingSentence(s)}»`);
    expect(missed, "these briefings demand a door-mirror check and no channel says so").toEqual([]);
    // …and the audit is not vacuous: it finds the demand in a good share of the
    // catalogue, so a regex that stopped matching cannot pass the line above.
    const demanding = SCENARIO_TEMPLATES.filter((s) => demandingSentence(s) !== null);
    expect(demanding.length).toBeGreaterThanOrEqual(25);
  });

  it("every EXPLICIT flag stands on such a sentence — it cannot be sprinkled", () => {
    const declared = SCENARIO_TEMPLATES.filter((s) => s.doorMirrorsInTask === true);
    // 25: the audited row plus the 24 the class walk found. A new one is a
    // content change and arrives with its own quoted sentence in the template.
    expect(declared.length).toBe(25);
    const unearned = declared.filter((s) => demandingSentence(s) === null).map((s) => s.id);
    expect(unearned, "flagged with nothing in the briefing that asks for it").toEqual([]);
  });

  it("…and only where no structured channel already carries it", () => {
    const redundant = SCENARIO_TEMPLATES.filter((s) => s.doorMirrorsInTask === true)
      .filter((s) => {
        const bare = clone(s);
        delete bare.doorMirrorsInTask;
        return doorMirrorTaskSource(bare) !== null;
      })
      .map((s) => s.id);
    expect(redundant, "the flag duplicates a channel that already answers yes").toEqual([]);
  });

  it("a sample of INTERIOR-mirror lessons stays untasked", () => {
    // Each of these says «огледало» in its briefing and means the interior
    // glass (or another driver's), so the door pass is not bought for them.
    for (const id of [
      "sc-follow-tailgater",
      "sc-mw-min-speed",
      "sc-hazard-obstacle",
      "sc-ov-being-overtaken",
      "sc-jx-priority-confidence",
      "sc-follow-distance",
      "sc-ac-highbeam-lead",
      "sc-ac-wind-truck-pass",
    ]) {
      const spec = mustGet(id);
      expect(briefing(spec).join(" "), id).toMatch(/огледал/iu);
      expect(scenarioUsesDoorMirrors(spec), id).toBe(false);
      expect("doorMirrorsInTask" in compileScenario(spec, 3), id).toBe(false);
    }
  });

  it("is rung-invariant: no drill tasks the mirrors on one rung and not another", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const flags = new Set(
        spec.levels.map(({ level }) => compileScenario(spec, level).doorMirrorsInTask === true),
      );
      expect(flags.size, spec.id).toBe(1);
    }
  });
});

describe("each structured channel on its own", () => {
  it("a mistake demo coded LANE_CHANGE_WITHOUT_MIRROR_CHECK", () => {
    expect(doorMirrorTaskSource(mustGet("sc-lane-change"))).toBe("mistakeCode");
  });

  it("a rubric observation moment that names a DOOR mirror", () => {
    const spec = mustGet("sc-park-perp-rev");
    // «Огледала и рамо преди включване на задна» — the plural set, paired with
    // the shoulder check, i.e. not the interior mirror alone.
    expect(doorMirrorTaskSource(spec)).toBe("observationMoment");
    // The noun is what counts: the same rubric reworded to shoulder and
    // windscreen looks only is no longer a mirror task.
    const reworded = clone(spec);
    reworded.rubric!.observation!.moments = reworded.rubric!.observation!.moments.map((m) => ({
      ...m,
      titleBg: "Поглед през рамо в мъртвата зона",
    }));
    expect(doorMirrorTaskSource(reworded)).toBeNull();
  });

  it("…including one authored on a RUNG, and then every rung says yes", () => {
    const base = clone(mustGet("sc-follow-tailgater"));
    expect(doorMirrorTaskSource(base)).toBeNull();
    base.levels = base.levels.map((l) =>
      l.level === 5
        ? { ...l, rubric: { observation: { moments: [{ id: "obs-x", titleBg: "Ляво огледало" }] } } }
        : l,
    );
    expect(doorMirrorTaskSource(base)).toBe("observationMoment");
  });

  it("a moment naming NO mirror (windscreen / pavement looks) does not count", () => {
    // sc-merge-from-property authors two observation moments, both looks through
    // the windscreen, and no mirror-check demo.
    expect(doorMirrorTaskSource(mustGet("sc-merge-from-property"))).toBeNull();
  });
});

describe("the rubric channel names the DOOR mirror, not any mirror", () => {
  it("«Огледало назад, преди да отпуснеш газта» is the INTERIOR one", () => {
    // sc-merge-bus-pullout's second moment: a look straight behind before
    // slowing for the bus. The interior glass is live on every tier already, so
    // this moment buys no door pass — and that lesson's briefing demands no
    // door-mirror check either, so it stays untasked (the sample above).
    expect(momentNamesDoorMirror("Огледало назад, преди да отпуснеш газта")).toBe(false);
    // …and the lesson that authors it is untasked: its briefing says nothing
    // about a mirror at all, so no channel and no prose asks for the door pass.
    expect(demandingSentence(mustGet("sc-merge-bus-pullout"))).toBeNull();
    expect(doorMirrorTaskSource(mustGet("sc-merge-bus-pullout"))).toBeNull();
  });

  it("the titles the catalogue actually authors, one by one", () => {
    for (const title of [
      "Огледала и рамо преди включване на задна",
      "Огледала и през рамо ПРЕДИ включване на задна",
      "Огледало и през ляво рамо преди изнасянето в лентата",
      "Ляво огледало, докато ускоряваш в лентата",
      "Огледало преди излизането и преди прибирането",
      "Огледало и рамо назад — движещият се направо велосипедист",
      "Поглед в огледалото, преди колата да тръгне",
      "Огледало и рамо, преди да се престроиш вдясно",
    ]) {
      expect(momentNamesDoorMirror(title), title).toBe(true);
    }
    for (const title of [
      "Огледало назад, преди да отпуснеш газта",
      "Поглед през рамо в мъртвата зона, преди волана",
      "Мъртва зона през рамо, преди да завъртиш волана",
      "Поглед в огледалото за задно виждане",
      "Вътрешното огледало, преди спирането",
      // The two that need the INTERIOR clause to answer no: each pairs the
      // interior mirror with a sideways cue, so without it the cue would carry
      // the title and buy a door pass for an interior-mirror moment.
      "Огледало за задно виждане, преди да се престроиш вдясно",
      "Вътрешното огледало и мигач, преди маневрата",
    ]) {
      expect(momentNamesDoorMirror(title), title).toBe(false);
    }
  });
});

describe("the audited row: sc-vu-pass-clearance", () => {
  const spec = mustGet("sc-vu-pass-clearance");

  it("declares the task explicitly — no structured channel could carry it", () => {
    expect(doorMirrorTaskSource(spec)).toBe("declared");
    // …and without the flag nothing else would: its demos are coded
    // VULNERABLE_PASS_TOO_CLOSE and it authors no observation rubric.
    const bare = clone(spec);
    delete bare.doorMirrorsInTask;
    expect(doorMirrorTaskSource(bare)).toBeNull();
    expect(demandingSentence(spec)).toMatch(/огледало, мигач наляво/iu);
  });

  it("reaches the compiled lesson on EVERY rung (the thing MirrorRig reads)", () => {
    for (const { level } of spec.levels) {
      expect(compileScenario(spec, level).doorMirrorsInTask, `L${level}`).toBe(true);
    }
  });

  it("…and a template without it compiles with the field ABSENT, not false", () => {
    const bare = clone(mustGet("sc-follow-tailgater"));
    expect("doorMirrorsInTask" in compileScenario(bare, 3)).toBe(false);
  });

  it("survives into the THEO-3 mistake sandbox — same world, same mirror", () => {
    const lesson = compileScenario(spec, 1, { mistakeExperience: { mistakeIndex: 0 } });
    expect(lesson.doorMirrorsInTask).toBe(true);
  });

  it("a false flag is refused — it would read as an opt-out and be none", () => {
    const loose = clone(spec) as unknown as { doorMirrorsInTask: unknown };
    loose.doorMirrorsInTask = false;
    expect(validateScenarioSpec(loose as ScenarioSpec).join("\n")).toMatch(
      /doorMirrorsInTask must be true or absent/,
    );
    loose.doorMirrorsInTask = true;
    expect(validateScenarioSpec(loose as ScenarioSpec).join("\n")).not.toMatch(/doorMirrorsInTask/);
  });
});

/**
 * THE WIRING, read off the source — the one layer vitest's node environment
 * cannot render (a lesson declaring the task is worth nothing if the flag stops
 * at the LessonSpec).
 *
 * ROUND 2: the round-1 version pinned that `mirrorGlassIsWatched(` appeared
 * twice, which a mutation could satisfy while passing `false` for the task
 * flag at either call. The glass decision is now ONE pure function
 * (`mirrorAttention.mirrorGlassDecision`, tested in mirrorTaskLive.test.ts) and
 * the pin below PARSES each call site's argument list and requires the flag in
 * its declared position — so replacing it with `false` at either site, or
 * dropping the prop in VitokCockpit, reds here.
 */
describe("the declaration reaches MirrorRig", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../../../../", p), "utf8");

  /** The argument lists of every `name(` call in `src`, split at top level. */
  const callArgs = (src: string, name: string): string[][] => {
    const out: string[][] = [];
    let i = src.indexOf(`${name}(`);
    while (i >= 0) {
      let depth = 0;
      let j = i + name.length;
      const start = j + 1;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) throw new Error(`unbalanced call to ${name} — the pin cannot read it`);
      const body = src.slice(start, j);
      const args: string[] = [];
      let d = 0;
      let last = 0;
      for (let k = 0; k < body.length; k++) {
        const c = body[k];
        if (c === "(" || c === "[" || c === "{") d++;
        else if (c === ")" || c === "]" || c === "}") d--;
        else if (c === "," && d === 0) {
          args.push(body.slice(last, k).trim());
          last = k + 1;
        }
      }
      const tail = body.slice(last).trim();
      if (tail.length > 0) args.push(tail);
      out.push(args);
      i = src.indexOf(`${name}(`, j);
    }
    return out;
  };

  it("the call-site reader works on a source it is given (it can fail)", () => {
    expect(callArgs("f(a, g(b, c), d)", "f")).toEqual([["a", "g(b, c)", "d"]]);
    expect(callArgs("no calls here", "f")).toEqual([]);
    expect(() => callArgs("f(a, b", "f")).toThrow(/unbalanced/);
  });

  it("LessonScene puts the compiled flag on the cockpit context", () => {
    const src = read("components/sim/LessonScene.tsx");
    expect(src).toContain("const doorMirrorsInTask = lesson.doorMirrorsInTask === true;");
    expect(src).toMatch(/highlightStepId: preDriveHighlightStepId, doorMirrorsInTask \}/);
  });

  it("VitokCockpit reads it off the context and hands it to MirrorRig", () => {
    const cockpit = read("components/sim/vitok/VitokCockpit.tsx");
    expect(cockpit).toMatch(
      /const \{ enabled: cockpitView, doorMirrorsInTask = false \} = useContext\(\s*CockpitInteractionContext,?\s*\)/,
    );
    // The prop on the ONE <MirrorRig …> element, and it carries the variable —
    // `doorMirrorsInTask={false}` is a different string and reds.
    const rig = cockpit.slice(cockpit.indexOf("<MirrorRig"));
    const element = rig.slice(0, rig.indexOf("/>"));
    expect(element).toContain("doorMirrorsInTask={doorMirrorsInTask}");
  });

  it("MirrorRig derives the tier rule once and passes it to BOTH glass decisions", () => {
    const rig = read("components/sim/vitok/MirrorRig.tsx");
    expect(rig).toContain("const doorsFollowTask = doorMirrorsFollowTask(preset, doorMirrorsInTask);");
    // The scheduler.
    const select = callArgs(rig, "selectMirrorPass");
    expect(select.length, "selectMirrorPass is called exactly once in the rig").toBe(1);
    expect(select[0][6]).toBe("doorsFollowTask");
    // …and the glass, at both points the frame loop decides it (the blanking
    // sweep, `passedThisFrame = false`, and the post-pass promotion, `true`).
    const glass = callArgs(rig, "mirrorGlassDecision");
    expect(glass.length, "the two glass decisions").toBe(2);
    expect(glass.map((a) => a[2]).sort()).toEqual(["false", "true"]);
    for (const args of glass) {
      expect(args).toHaveLength(7);
      expect(args[3], "the task flag is the 4th argument").toBe("doorsFollowTask");
      expect(args.slice(4)).toEqual(["glanceMirror", "glanceStrength", "lookPose"]);
    }
  });
});
