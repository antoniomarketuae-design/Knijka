/**
 * THE PRODUCT-WIDE KEEP-RIGHT CLAIM CENSUS (test-only helper;
 * `keep-right-claim-census.test.ts` runs it against the reviewed fixture
 * `keep-right-claim-census.json`).
 *
 * WHY THIS EXISTS. Rounds 1 and 2 of «KEEP-RIGHT FOLLOWS THE LAW» (founder
 * ruling 2026-10-01) guarded the three re-scoped lessons. The round-2 verifier
 * then put the false every-road sentence back in OTHER places those lessons
 * show — «Извън изпреварване мястото ти е в най-дясната свободна лента.» on
 * the LANE_CHANGE_WITHOUT_INDICATOR card, «…в лявата лента не се пътува.» on
 * LANE_CHANGE_WITHOUT_MIRROR_CHECK — and nothing turned red. A guard on three
 * lessons cannot answer a claim that can be written anywhere. This answers the
 * CLASS: it reads every student-facing text source the product ships, finds
 * every sentence that talks about which lane / which side of the carriageway
 * the driver belongs in, and requires each one to have been READ — classified
 * in the fixture — and, when it asserts the keep-right duty, to be true where
 * it is shown.
 *
 * THE LAW (retrieved from content/law/acts/zdvp.json, never recalled):
 *   чл. 15, ал. 1   — „се движи възможно най-вдясно по платното за движение, а
 *                      когато пътните ленти са очертани с пътна маркировка,
 *                      използва най-дясната свободна лента";
 *   ал. 2, т. 2     — not applied „в населените места, на пътно платно с две и
 *                      повече пътни ленти за движение в една посока … със
 *                      скорост не по-голяма от 80 кm/h";
 *   ал. 2, т. 3     — nor „когато навлизането по пътната лента се разрешава от
 *                      светлинен сигнал".
 *
 * WHAT IS READ (each is a `surface`):
 *   catalog       every string of every exported table in rules/catalog.ts;
 *   consequences  … in rules/consequences.ts («на пътя това струва…»);
 *   n38           … in rules/n38.ts (the exam-sheet rationale);
 *   template      every Cyrillic string of every ScenarioSpec in
 *                 SCENARIO_TEMPLATES (title, tags, objective, steps, objective
 *                 titles, mistake cards, teach cards, rung coach lines);
 *   caption       every annotation of every committed recording under
 *                 content/traces;
 *   theory        every string of every beat of every content/lessons lesson
 *                 except `grounds` (reviewer provenance, not shown);
 *   question      the question bank AS THE LOADER SERVES IT (round 5 — see
 *                 «SERVED» below): the stem, the explanation and the options
 *                 marked correct (a distractor is false by design — distractors
 *                 with the vocabulary are COUNTED, not read as claims);
 *   concept       content/concepts.json, topics.json, sections.json,
 *                 content/hazard, content/signs, content/medical;
 *   source        every string literal, template-literal chunk and JSX text
 *                 holding a Cyrillic letter in every non-test file under
 *                 platform/src — parsed with the TypeScript compiler, so a
 *                 sentence built in code (debrief, coach lines, HUD) is read
 *                 too. A sentence already attributed to one of the structured
 *                 surfaces above is not listed twice.
 * NOT read, and why: content/law (it IS the law), content/world (map metadata —
 * `meta.label` and `defaults.note` are rendered by nothing; grep
 * `meta.label|defaults.note` under platform/src), `grounds` in lessons, test
 * files.
 *
 * WHAT COUNTS AS «the vocabulary» is deliberately wide (`VOCAB`): any mention
 * of a left/right lane, the rightmost lane, a side of the carriageway as the
 * place to be, «прибиране» to a side, or чл. 15 itself. Wide, because no list
 * can enumerate the ways to say a false thing — so the census does not try to
 * recognise the claim, it makes every sentence in the neighbourhood a READ
 * sentence. `STRONG` is the narrow set that reads like the duty itself; a
 * sentence matching it may be classified «other» only with a written reason.
 *
 * WHAT THIS CENSUS IS NOT (round 4). It is the CLASSIFIER of the sentences its
 * vocabulary reads — it says which of them assert the duty and whether each is
 * true where it is shown. It is not the gate against a false sentence written
 * in OTHER words («В бързата лента не се пътува — и в града…» names no side),
 * nor against a sentence it already knows pasted into a new place: no
 * vocabulary can be. That class is answered by `reviewed-text-manifest.test.ts`
 * — one fingerprint per surface over EVERY student-facing string — which also
 * proves that everything read here is held there.
 *
 * SERVED (round 5, R4-3). A question carries a `status`, and rounds 3–4 read
 * «needs-review» as «parked». It is not: `modules/learning/session.ts` deals
 * needs-review rows in practice by default, and the loader strips the
 * `[REVIEW: …]` note in front of the explanation. q-manevri-031 told a student,
 * on a stem that opens «В града двете ленти в твоята посока…», that «мястото ти
 * по подразбиране е най-дясната свободна лента (чл. 15, ал. 1)» — false on that
 * street (ал. 2, т. 2) — while this census filed it as a known, parked sentence.
 * So, for the question surface:
 *   · the text read is the loader's (`servedQuestions.ts` → the product's
 *     ContentRepo): what a student is shown, without the staff note — a note
 *     can no longer lend a sentence the conditions its served text lacks;
 *   · every occurrence carries the row's `status` and its question id; whether
 *     PRACTICE DEALS that row is asked of the product's own practice builder
 *     with its defaults (`practiceServedQuestionIds`) by the test, and pinned
 *     per showing in the reviewed list;
 *   · the SCENE of a theory sentence is its question's stem (`sceneOf`): a
 *     stem that names ал. 1's own scope, a TOWN stem (a settlement, a street, a
 *     boulevard), or no road at all. A duty sentence that practice serves,
 *     unbounded, on a town scene is a RED — with no way to excuse it when the
 *     stem names two or more lanes one way (`namesTwoOrMoreLanesOneWay`:
 *     that is ал. 2, т. 2's own street), and only by a written, reviewed
 *     reason otherwise (a two-way street with one lane each way is NOT a т. 2
 *     street — ал. 1 binds on it).
 *
 * WHERE A SENTENCE IS SHOWN is computed, never typed:
 *   template → its own lesson → `map.districtId`;
 *   caption  → its recording's lesson → that district;
 *   theory   → the beat's `visual.templateId`, else no road;
 *   a NOT_KEEPING_RIGHT card/consequence/exam-sheet row → only where the
 *     engine bills the code, which is only where ал. 1 binds
 *     (rules/engine.ts `keepRightBinds`; rules/__tests__/
 *     keep-right-follows-the-law.test.ts);
 *   any other catalogue text and any source literal → ANY road;
 *   question / concept → no road (theory).
 * and whether ал. 1 binds on a district is measured on the BUILT map with the
 * world builder's own predicates (`districtRoadClass`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { SCENARIO_TEMPLATES } from "../templates";
import * as catalogModule from "../../../rules/catalog";
import * as consequencesModule from "../../../rules/consequences";
import * as n38Module from "../../../rules/n38";
import { KEEP_RIGHT_TOWN_MAX_KMH } from "../../../rules/types";
import { parseDistrict, type DistrictEdge } from "../../../runtime";
import { isExtraUrbanCarriageway, isMotorwayCarriageway } from "../../../world/builders/constants";
import { questionsAsServed } from "./servedQuestions";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "platform", "src");

// ───────────────────────────── the vocabulary ──────────────────────────────

const L = "\\p{L}";
const NL = `(?<!${L})`; // not preceded by a letter
const SIDE_ADJ = `(?:ляв|лев|дясн|десн)${L}*`;
const SIDE_ADV = `(?:вдясно|вляво|надясно|наляво|дясно|ляво)`;
const POSITION_VERB = `(?:дръж|държ|придърж|стой|стои|остан|остав|движ|кара|пътува|вис|настан|мяст|живее|посещава)${L}*`;

/** A sentence is in the census when ANY of these reads. */
export const VOCAB: { id: string; re: RegExp }[] = [
  { id: "rightmost", re: new RegExp(`${NL}най-(?:дясн|ляв)${L}*|${NL}най-(?:вдясно|вляво)`, "iu") },
  { id: "side-lane", re: new RegExp(`${NL}${SIDE_ADJ}\\s+(?:${L}+\\s+)?лент${L}*`, "iu") },
  {
    id: "lane-for",
    re: new RegExp(`${NL}лент${L}*[^.!?]{0,40}?\\sза\\s+(?:изпреварване|маневр${L}*|пътуване|по-бързите)`, "iu"),
  },
  {
    id: "side-is",
    re: new RegExp(`${NL}(?:лява|лявата|дясна|дясната)\\s+(?:не\\s+)?(?:е|са|се|остава|отново)(?!${L})`, "iu"),
  },
  {
    id: "return-side",
    re: new RegExp(
      `${NL}приб[еи]р${L}*[^.!?]{0,60}?${NL}(?:${SIDE_ADV}|${SIDE_ADJ})(?!${L})|${NL}(?:${SIDE_ADV})(?!${L})[^.!?]{0,30}?${NL}приб[еи]р${L}*|${NL}(?:върн|връщ)${L}*\\s+(?:се\\s+)?(?:${L}+\\s+){0,2}?(?:вдясно|надясно|в\\s+дясн${L}*)(?!${L})`,
      "iu",
    ),
  },
  {
    id: "keep-side",
    re: new RegExp(
      `${NL}${POSITION_VERB}[^.!?]{0,40}?${NL}${SIDE_ADV}(?!${L})|${NL}${SIDE_ADV}(?!${L})[^.!?]{0,30}?${NL}(?:задължител${L}*|мястото)|${NL}(?:вляво|вдясно)\\s+(?:не\\s+)?(?:се\\s+)?(?:кара|пътува|стои|живее|остава|движи|виси)(?!${L})|${NL}задърж${L}*\\s+(?:вляво|вдясно|в\\s+ляв${L}*)(?!${L})`,
      "iu",
    ),
  },
  {
    id: "keep-side-adj",
    // «десн…» since round 4: «Дръж десния край на лентата…» (sc-follow-tailgater) was unread.
    re: new RegExp(`${NL}${POSITION_VERB}\\s+(?:${L}+\\s+){0,2}?${NL}(?:ляв|дясн|десн)${L}*`, "iu"),
  },
  { id: "for-overtaking", re: new RegExp(`${NL}${SIDE_ADJ}[^.!?]{0,30}?\\sза\\s+изпреварване`, "iu") },
  { id: "half", re: new RegExp(`${NL}${SIDE_ADJ}\\s+половина`, "iu") },
  // the other side of the same article: the town CHOICE of lane (ал. 2, т. 2)
  {
    id: "lane-choice",
    re: new RegExp(
      `${NL}най-удобн${L}*|${NL}лент${L}*[^.!?]{0,40}?(?:по\\s+(?:твой\\s+)?избор|избира${L}*|избереш)|${NL}(?:избор${L}*|избира${L}*|избереш)[^.!?]{0,30}?${NL}лент${L}*`,
      "iu",
    ),
  },
  { id: "art-15", re: /чл\. ?15(?!\d)(?![а-я])(?!,\s*ал\. ?[3-7])/u },
];

/** Reads like the keep-right duty itself. Classifying such a sentence «other»
 *  needs a written `why` in the fixture. */
export const STRONG: { id: string; re: RegExp }[] = [
  { id: "rightmost-free", re: new RegExp(`най-дясн${L}*\\s+свободн`, "iu") },
  { id: "as-far-right", re: /възможно\s+най-вдясно/iu },
  {
    id: "left-is-for",
    re: new RegExp(
      `${NL}ляв${L}*(?:\\s+лент${L}*)?\\s+(?:не\\s+)?(?:е|са|се\\s+ползва|се\\s+използва|остава)\\s+(?:само\\s+|единствено\\s+)?(?:за|свободна\\s+за)\\s`,
      "iu",
    ),
  },
  { id: "lane-for-overtaking", re: new RegExp(`лент${L}*[^.!?]{0,20}?\\sза\\s+изпреварване`, "iu") },
  {
    id: "not-for-travel",
    re: new RegExp(`не\\s+(?:е\\s+за\\s+(?:движение|пътуване|круизиране)|се\\s+(?:пътува|живее|кара|движи))`, "iu"),
  },
  { id: "lived-visited", re: /се\s+посещава|се\s+живее/iu },
  {
    id: "your-place",
    re: new RegExp(`мястото\\s+(?:ти|му|ѝ|й|им)?\\s*е[^.!?]{0,40}?(?:вдясно|дясн${L}*)`, "iu"),
  },
  {
    id: "obligatory",
    re: new RegExp(
      `(?:дясн${L}*|вдясно|прибирането)[^.!?]{0,40}?задължител|задължител${L}*[^.!?]{0,40}?(?:дясн${L}*|вдясно)`,
      "iu",
    ),
  },
  {
    id: "left-without-cause",
    re: new RegExp(
      `ляв${L}*\\s+лент${L}*[^.!?]{0,60}?без\\s+(?:причина|изпреварване|да\\s+изпреварва)|вис(?:и|ене|ял)${L}*\\s+в\\s+ляв`,
      "iu",
    ),
  },
  {
    id: "your-place-reversed",
    re: new RegExp(`(?:дясн${L}*|вдясно)[^.!?]{0,40}?там\\s+(?:ти\\s+|му\\s+|ѝ\\s+)?е\\s+мястото`, "iu"),
  },
  {
    id: "left-lane-is-a-fault",
    re: new RegExp(`ляв${L}*\\s+лент${L}*[^.!?]{0,50}?(?:грешка|нарушение)`, "iu"),
  },
  { id: "your-lane-for-travel", re: new RegExp(`лент${L}*\\s+ти\\s+за\\s+движение`, "iu") },
  {
    id: "left-only-while",
    re: new RegExp(`${NL}(?:вляво|ляв${L}*(?:\\s+лент${L}*)?)[^.!?]{0,30}?\\sсамо\\s+(?:докато|при|за)\\s`, "iu"),
  },
  { id: "there-one-travels", re: new RegExp(`(?:вдясно|дясн${L}*)[^.!?]{0,20}?там\\s+се\\s+(?:пътува|живее|кара|движи)`, "iu") },
  { id: "keep-right-slogan", re: /дръж\s+(?:в)?дясно/iu },
  { id: "art-15-al-1", re: /чл\. ?15(?!\d)(?![а-я])(?!,\s*ал\. ?[2-7])/u },
];

/** ал. 1's own scope: the sentence says WHERE the duty binds. */
export const AL1_SCOPE = new RegExp(`извън\\s+населен|извънградск|извън\\s+града|магистрал|над\\s+80`, "iu");
/** ал. 2, т. 2 stated with BOTH of its conditions (two+ lanes one way, ≤ 80). */
export function statesTownExemption(text: string): boolean {
  return (
    /населен\p{L}*\s+м[яе]ст|в\s+града|градск/iu.test(text) &&
    /дв[еа]\s+и\s+повече|две\s+ленти|повече\s+ленти/iu.test(text) &&
    /80/u.test(text)
  );
}

/** ал. 1's scope said in words that would otherwise read as a town («извънградски», «извън града»). */
const OUT_OF_TOWN_WORDS = new RegExp(`извън\\s+населен${L}*\\s+м[яе]ст${L}*|извънградск${L}*|извън\\s+града`, "giu");
/** A theory scene that puts the car IN a settlement: the settlement itself, a street, a boulevard. */
export const TOWN_SCENE = new RegExp(`населен${L}*\\s+м[яе]ст|${NL}в\\s+града|градск|булевард|${NL}улиц`, "iu");
export type Scene = "al1-scope" | "town" | "no-road";
/**
 * The scene a question's stem sets for its answer and its explanation.
 * «town» wins over «al1-scope» when a stem names both: the rule this feeds
 * asks «could a student read this sentence on a town street?».
 */
export function sceneOf(stem: string | undefined): Scene {
  if (!stem) return "no-road";
  if (TOWN_SCENE.test(stem.replace(OUT_OF_TOWN_WORDS, " "))) return "town";
  return AL1_SCOPE.test(stem) ? "al1-scope" : "no-road";
}
const TWO_PLUS_LANES_ONE_WAY = new RegExp(
  `${NL}дв[еа](?:те)?\\s+(?:пътни\\s+)?ленти|${NL}дв[еа]\\s+и\\s+повече|${NL}(?:три|трите|четири|четирите|няколко)\\s+(?:пътни\\s+)?ленти|повече\\s+(?:пътни\\s+)?ленти|ленти\\s+в\\s+(?:твоята|една|едната|същата|всяка)\\s+посока|${NL}(?:дву|три|четири|много)лент`,
  "iu",
);
/**
 * Does the stem name two or more lanes ONE WAY — the street ал. 2, т. 2 is
 * written for («на пътно платно с две и повече пътни ленти за движение в една
 * посока»)? On such a town scene an unbounded duty sentence is false, and no
 * reviewed reason may excuse it.
 */
export function namesTwoOrMoreLanesOneWay(stem: string | undefined): boolean {
  return !!stem && TWO_PLUS_LANES_ONE_WAY.test(stem);
}

export const sentencesOf = (text: string): string[] =>
  text
    .split(/\n+/u)
    .flatMap((p) => p.split(/(?<=[.!?…»"“])\s+(?=[А-ЯЁA-Z„«"(])/u))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
export const vocabOf = (sentence: string): string[] => VOCAB.filter((v) => v.re.test(sentence)).map((v) => v.id);
export const strongOf = (sentence: string): string[] => STRONG.filter((v) => v.re.test(sentence)).map((v) => v.id);

// ───────────────────────── the built world, per district ─────────────────────

export type RoadClass = "binds" | "town-choice" | "mixed";
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");
const perDirection = (e: DistrictEdge): number => (e.oneway ? e.lanes : Math.floor(e.lanes / 2));
const roadClassCache = new Map<string, { cls: RoadClass; t2: number; binding: number }>();
/**
 * Does ал. 1 bind on this district's multi-lane carriageways? Measured on the
 * committed map with the world builder's own predicates — the same three terms
 * the engine arms on (settlement-signal.test.ts proves the runtime publishes
 * exactly these): an edge with two or more lanes one way is a т. 2 street when
 * it is NOT outside a settlement, NOT a motorway and posted ≤ 80.
 *   town-choice  at least one т. 2 edge and no binding multi-lane edge;
 *   mixed        both;
 *   binds        no т. 2 edge at all (every multi-lane bank binds, or the map
 *                has one lane per direction, where ал. 1's «възможно
 *                най-вдясно» is never switched off).
 */
export function districtRoadClass(id: string): { cls: RoadClass; t2: number; binding: number } {
  const hit = roadClassCache.get(id);
  if (hit) return hit;
  const d = parseDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")));
  let t2 = 0;
  let binding = 0;
  for (const e of d.roads.edges as DistrictEdge[]) {
    if (perDirection(e) < 2) continue;
    if (isMotorwayCarriageway(e) || isExtraUrbanCarriageway(e) || e.maxspeed > KEEP_RIGHT_TOWN_MAX_KMH) binding++;
    else t2++;
  }
  const out = { cls: (t2 === 0 ? "binds" : binding === 0 ? "town-choice" : "mixed") as RoadClass, t2, binding };
  roadClassCache.set(id, out);
  return out;
}

// ─────────────────────────────── the sources ───────────────────────────────

export type Surface =
  | "catalog"
  | "consequences"
  | "n38"
  | "template"
  | "caption"
  | "theory"
  | "question"
  | "concept"
  | "source";
export type Road =
  | { kind: "districts"; lessons: string[]; districts: string[] }
  | { kind: "any" }
  | { kind: "none" }
  | { kind: "billed-only-where-al1-binds" };
export interface Occurrence {
  surface: Surface;
  /** A stable locator (no line numbers). */
  where: string;
  /** The whole string the sentence sits in (a question's answer or
   *  explanation: its stem, then the text). */
  unit: string;
  /** A question's stem — the scene its answer and explanation are read in. */
  scene?: string;
  /** Question surface only: the row's id and its `status` as the loader serves it. */
  questionId?: string;
  status?: string;
  road: Road;
}
export interface Census {
  /** sentence → every place it is shown. */
  sentences: Map<string, Occurrence[]>;
  /** Vocabulary-bearing question options marked INCORRECT (not read as claims). */
  distractors: number;
  /** How many strings / files each surface actually read — a surface that read
   *  nothing is a blind check, not a clean one. */
  read: Record<Surface, number>;
}

const CYRILLIC = /\p{Script=Cyrillic}/u;
function walkStrings(root: unknown, skipKeys: ReadonlySet<string>, cb: (path: string, s: string) => void): void {
  const seen = new Set<unknown>();
  const walk = (o: unknown, p: string) => {
    if (typeof o === "string") {
      if (CYRILLIC.test(o)) cb(p, o);
      return;
    }
    if (o === null || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, `${p}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (skipKeys.has(k)) continue;
      walk(v, p ? `${p}.${k}` : k);
    }
  };
  walk(root, "");
}
const NONE: ReadonlySet<string> = new Set();
const districtOf = new Map(SCENARIO_TEMPLATES.map((s) => [s.id, s.map.districtId]));

function lessonRoad(ids: string[]): Road {
  const lessons = [...new Set(ids)].sort();
  const districts = [...new Set(lessons.map((id) => districtOf.get(id)).filter((d): d is string => !!d))].sort();
  return { kind: "districts", lessons, districts };
}

/** Run the census. Deterministic; reads the worktree. */
export function runCensus(): Census {
  const sentences = new Map<string, Occurrence[]>();
  const read: Record<Surface, number> = {
    catalog: 0,
    consequences: 0,
    n38: 0,
    template: 0,
    caption: 0,
    theory: 0,
    question: 0,
    concept: 0,
    source: 0,
  };
  const add = (surface: Surface, where: string, text: string, road: Road, scene?: string, question?: { id: string; status: string }) => {
    read[surface]++;
    const unit = scene ? `${scene}\n${text}` : text;
    for (const s of sentencesOf(text)) {
      if (vocabOf(s).length === 0) continue;
      const list = sentences.get(s) ?? [];
      // One occurrence per (surface, where): a sentence repeated in one string is one showing.
      if (!list.some((o) => o.surface === surface && o.where === where)) {
        list.push(question ? { surface, where, unit, road, scene, questionId: question.id, status: question.status } : { surface, where, unit, road, scene });
      }
      sentences.set(s, list);
    }
  };

  // 1–3. the rules tables: every exported object, every string.
  const tables: [Surface, Record<string, unknown>][] = [
    ["catalog", catalogModule as unknown as Record<string, unknown>],
    ["consequences", consequencesModule as unknown as Record<string, unknown>],
    ["n38", n38Module as unknown as Record<string, unknown>],
  ];
  for (const [surface, mod] of tables) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue;
      if (typeof value === "string") {
        if (CYRILLIC.test(value)) add(surface, name, value, { kind: "any" });
        continue;
      }
      walkStrings(value, NONE, (p, s) => {
        const keepRightRow = /^NOT_KEEPING_RIGHT(?:[.[]|$)/u.test(p);
        add(surface, `${name}.${p}`, s, keepRightRow ? { kind: "billed-only-where-al1-binds" } : { kind: "any" });
      });
    }
  }
  // `allLawQuotes()` is how the consequences' module-private quotes reach a
  // student; they are all reachable from ROAD_CONSEQUENCES above, by reference.

  // 4. every lesson template.
  for (const spec of SCENARIO_TEMPLATES) {
    walkStrings(spec, NONE, (p, s) => add("template", `${spec.id}:${p}`, s, lessonRoad([spec.id])));
  }

  // 5. every committed recording's captions.
  const tracesDir = path.join(REPO_ROOT, "content", "traces");
  for (const lesson of fs.readdirSync(tracesDir).sort()) {
    const dir = path.join(tracesDir, lesson);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".trace.json")) continue;
      const trace = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as {
        events: { kind: string; tSec: number; textBg?: string }[];
      };
      for (const e of trace.events) {
        if (e.kind !== "annotation" || !e.textBg) continue;
        add("caption", `${lesson}/${f.replace(".trace.json", "")}@${e.tSec.toFixed(2)}`, e.textBg, lessonRoad([lesson]));
      }
    }
  }

  // 6. every theory lesson beat (all strings but `grounds`).
  const lessonsDir = path.join(REPO_ROOT, "content", "lessons");
  const SKIP_GROUNDS = new Set(["grounds"]);
  for (const f of fs.readdirSync(lessonsDir).sort()) {
    if (!f.endsWith(".json")) continue;
    const lesson = JSON.parse(fs.readFileSync(path.join(lessonsDir, f), "utf-8")) as {
      id: string;
      titleBg?: string;
      beats: { id: string; visual?: { templateId?: string } }[];
    };
    if (lesson.titleBg) add("theory", `${lesson.id}:titleBg`, lesson.titleBg, { kind: "none" });
    for (const beat of lesson.beats) {
      const tpl = beat.visual?.templateId;
      const road: Road = tpl ? lessonRoad([tpl]) : { kind: "none" };
      walkStrings(beat, SKIP_GROUNDS, (p, s) => add("theory", `${lesson.id}/${beat.id}:${p}`, s, road));
    }
  }

  // 7. the question bank AS SERVED: stem, explanation, correct options — the
  // loader's rows (sanitised: no staff `[REVIEW: …]` note), each with its status.
  let distractors = 0;
  for (const q of [...questionsAsServed()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const meta = { id: q.id, status: q.status };
    // The stem is the question's SCENE («Движиш се извън населено място…»):
    // an answer or an explanation is read inside it, so the unit of each is
    // «stem ⏎ text» and the sentences come from the text alone.
    add("question", `${q.id}:textBg`, q.textBg, { kind: "none" }, undefined, meta);
    if (q.explanationBg) add("question", `${q.id}:explanationBg`, q.explanationBg, { kind: "none" }, q.textBg, meta);
    for (const o of q.options ?? []) {
      if (o.correct) add("question", `${q.id}:options.${o.id}`, o.textBg, { kind: "none" }, q.textBg, meta);
      else if (sentencesOf(o.textBg).some((s) => vocabOf(s).length > 0)) distractors++;
    }
  }

  // 8. the rest of the theory content.
  const contentDir = path.join(REPO_ROOT, "content");
  const readJsonTree = (abs: string, rel: string) => {
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs).sort()) readJsonTree(path.join(abs, f), `${rel}/${f}`);
      return;
    }
    if (!abs.endsWith(".json")) return;
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(abs, "utf-8"));
    } catch {
      return;
    }
    walkStrings(doc, NONE, (p, s) => add("concept", `${rel}:${p}`, s, { kind: "none" }));
  };
  for (const name of ["concepts.json", "topics.json", "sections.json", "hazard", "signs", "medical"]) {
    const abs = path.join(contentDir, name);
    if (fs.existsSync(abs)) readJsonTree(abs, name);
  }

  // 9. every Cyrillic literal in every non-test source file.
  const literal = (file: string, text: string) => {
    if (!CYRILLIC.test(text)) return;
    read.source++;
    for (const s of sentencesOf(text)) {
      if (vocabOf(s).length === 0) continue;
      const list = sentences.get(s) ?? [];
      // Already attributed to a structured surface (the catalogue, a template,
      // a recorded caption): the literal is that text's source, not a second showing.
      if (list.some((o) => o.surface !== "source")) continue;
      if (!list.some((o) => o.where === file)) list.push({ surface: "source", where: file, unit: text, road: { kind: "any" } });
      sentences.set(s, list);
    }
  };
  const anyVocab = new RegExp(VOCAB.map((v) => `(?:${v.re.source})`).join("|"), "iu");
  const scanSource = (abs: string) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "__tests__" || ent.name === "node_modules") continue;
        scanSource(p);
        continue;
      }
      if (!/\.(?:ts|tsx)$/u.test(ent.name) || /\.test\.tsx?$/u.test(ent.name) || ent.name.endsWith(".d.ts")) continue;
      const text = fs.readFileSync(p, "utf-8").replace(/\r\n/gu, "\n"); // a CRLF checkout must read as the LF tree does
      if (!anyVocab.test(text)) continue; // cheap pre-filter: parse only files that can hold a hit
      const rel = path.relative(REPO_ROOT, p).split(path.sep).join("/");
      const sf = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, false, ent.name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literal(rel, node.text);
        else if (ts.isTemplateExpression(node)) {
          literal(rel, node.head.text);
          for (const span of node.templateSpans) literal(rel, span.literal.text);
        } else if (ts.isJsxText(node)) literal(rel, node.text);
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  };
  scanSource(SRC_ROOT);

  return { sentences, distractors, read };
}

// ─────────────────────────────── the verdicts ───────────────────────────────

export type Verdict =
  | "sentence-names-al1-scope"
  | "theory-scene-names-al1-scope"
  | "unit-states-town-exemption"
  | "shown-only-where-al1-binds"
  | "billed-only-where-al1-binds"
  | "UNBOUNDED";

/** Is a sentence asserting the keep-right duty TRUE in this showing? */
export function dutyVerdict(sentence: string, o: Occurrence): Verdict {
  if (o.road.kind === "billed-only-where-al1-binds") return "billed-only-where-al1-binds";
  if (AL1_SCOPE.test(sentence)) return "sentence-names-al1-scope";
  if (o.road.kind === "districts" && o.road.districts.length > 0 && o.road.districts.every((d) => districtRoadClass(d).cls === "binds")) {
    return "shown-only-where-al1-binds";
  }
  if (statesTownExemption(o.unit)) return "unit-states-town-exemption";
  // Road-less theory: the question's stem («Движиш се извън населено място…»)
  // or the concept's own summary («…на обикновени извънградски пътища…») is
  // the scene the sentence is read in. Never on a surface that has a road.
  // Round 5: the SCENE, not the whole unit — another sentence of the same
  // explanation that happens to say «извън населено място» does not put a duty
  // sentence on a town stem out of town.
  if ((o.surface === "question" || o.surface === "concept") && AL1_SCOPE.test(o.scene ?? o.unit)) return "theory-scene-names-al1-scope";
  return "UNBOUNDED";
}

export type ExemptionVerdict =
  | "sentence-states-both-conditions"
  | "unit-states-both-conditions"
  | "says-here-on-a-t2-street"
  | "UNCONDITIONED";

/**
 * Is a sentence stating the town choice of lane TRUE in this showing? It must
 * carry ал. 2, т. 2's two conditions — two or more lanes one way, ≤ 80 — in
 * the sentence or in its unit. One more way: a sentence that says «Тук» is a
 * claim about THIS road, and is true when every district it is shown on is a
 * т. 2 street on the built map («Тук, в града, лентата е по избор» over the
 * sc-ov-keep-right boulevard).
 */
export function exemptionVerdict(sentence: string, o: Occurrence): ExemptionVerdict {
  if (statesTownExemption(sentence)) return "sentence-states-both-conditions";
  if (statesTownExemption(o.unit)) return "unit-states-both-conditions";
  if (
    /(?<!\p{L})тук(?!\p{L})/iu.test(sentence) &&
    o.road.kind === "districts" &&
    o.road.districts.length > 0 &&
    o.road.districts.every((d) => districtRoadClass(d).cls === "town-choice")
  ) {
    return "says-here-on-a-t2-street";
  }
  return "UNCONDITIONED";
}

/**
 * One line per showing, for the fixture and the report. A QUESTION showing
 * also says the row's status, whether default practice deals it (`served` —
 * the ids `practiceServedQuestionIds()` returned) and the scene its stem sets:
 * a row that moves from parked to served, or whose stem changes scene, changes
 * its line, and the reviewed list turns red until it is re-read.
 */
export function showingLine(sentence: string, o: Occurrence, verdict: string, served?: ReadonlySet<string>): string {
  const road =
    o.road.kind === "districts"
      ? o.road.districts.length > 0
        ? o.road.districts.map((d) => `${d}=${districtRoadClass(d).cls}`).join(",")
        : "no-district"
      : o.road.kind;
  const serving =
    o.surface === "question" && served
      ? ` | ${o.status ?? "?"}, practice ${o.questionId !== undefined && served.has(o.questionId) ? "SERVES it" : "does not serve it"}, scene ${sceneOf(o.scene ?? o.unit)}`
      : "";
  return `${o.surface} | ${o.where} | ${road} | ${verdict}${serving}`;
}
