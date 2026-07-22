#!/usr/bin/env node
/**
 * Standalone structural validator for /content — no build step, no deps.
 *
 * Mirrors the checks in src/lib/content/schemas.ts + loader.ts in plain JS
 * (keep the three in lockstep): per-file structure, cross-field question
 * rules, referential integrity, dependency-graph acyclicity, svg assets.
 *
 * Usage: node scripts/validate-content.mjs   (from platform/ or repo root)
 * Exit code: 0 = content valid, 1 = any error.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STATUSES = ["draft", "needs-review", "approved"];
const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// THEO-1 media limits — mirror of src/lib/content/schemas.ts (keep in lockstep).
const SCENE_ZOOM_MIN_M = 6;
const SCENE_ZOOM_MAX_M = 500;
const SCENE_MAX_POSES = 12;
const SCENE_MAX_MARKS = 8;
const SCENE_POSE_KINDS = ["car", "truck", "bus", "tram", "bike", "ped"];
const SCENE_MARK_KINDS = ["danger", "target", "proceed", "yield"];

// --------------------------------------------------------------------------
// Locate /content (repo root), robust to cwd.
// --------------------------------------------------------------------------
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(scriptDir, "..", "..", "content"), // platform/scripts -> repo root
  path.join(process.cwd(), "content"),
  path.resolve(process.cwd(), "..", "content"),
];
const contentDir = candidates.find((dir) => fs.existsSync(path.join(dir, "topics.json")));
if (!contentDir) {
  console.error(`Content directory not found. Looked in:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}

const errors = [];

function readJsonArray(relFile) {
  const file = path.join(contentDir, relFile);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    errors.push(`${relFile}: cannot read file (${err.message})`);
    return null;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    errors.push(`${relFile}: invalid JSON (${err.message})`);
    return null;
  }
  if (!Array.isArray(data)) {
    errors.push(`${relFile}: expected a top-level JSON array`);
    return null;
  }
  return data;
}

// --------------------------------------------------------------------------
// Field-level validators (plain-JS mirror of schemas.ts)
// --------------------------------------------------------------------------
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

/** Small assertion helper bound to one item; pushes "file [i] (id): message". */
function checker(relFile, index, item) {
  const label = `${relFile} [${index}]${isPlainObject(item) && isNonEmptyString(item.id) ? ` (${item.id})` : ""}`;
  return {
    fail(message) {
      errors.push(`${label}: ${message}`);
    },
    require(condition, message) {
      if (!condition) errors.push(`${label}: ${message}`);
      return Boolean(condition);
    },
    noUnknownKeys(allowed) {
      for (const key of Object.keys(item)) {
        if (!allowed.includes(key)) errors.push(`${label}: unrecognized key "${key}"`);
      }
    },
  };
}

function checkLawRefs(c, value, { min = 0 } = {}) {
  if (!c.require(Array.isArray(value), "lawRefs must be an array")) return;
  if (value.length < min) c.fail(`lawRefs must contain at least ${min} entry`);
  value.forEach((ref, i) => {
    if (!isPlainObject(ref)) return c.fail(`lawRefs[${i}] must be an object`);
    c.require(isNonEmptyString(ref.act), `lawRefs[${i}].act must be a non-empty string`);
    c.require(isNonEmptyString(ref.ref), `lawRefs[${i}].ref must be a non-empty string`);
    for (const key of Object.keys(ref)) {
      if (key !== "act" && key !== "ref") c.fail(`lawRefs[${i}]: unrecognized key "${key}"`);
    }
  });
}

function checkTopic(item, index) {
  const c = checker("topics.json", index, item);
  if (!c.require(isPlainObject(item), "topic must be an object")) return;
  c.noUnknownKeys(["id", "order", "slug", "titleBg", "titleEn", "descriptionBg"]);
  c.require(
    isNonEmptyString(item.id) && /^t-[a-z0-9-]+$/.test(item.id),
    'id must be kebab-case with "t-" prefix',
  );
  c.require(
    Number.isInteger(item.order) && item.order > 0,
    "order must be a positive integer",
  );
  c.require(
    isNonEmptyString(item.slug) && KEBAB_SLUG.test(item.slug),
    "slug must be kebab-case",
  );
  for (const key of ["titleBg", "titleEn", "descriptionBg"]) {
    c.require(isNonEmptyString(item[key]), `${key} must be a non-empty string`);
  }
}

function checkConcept(item, index) {
  const c = checker("concepts.json", index, item);
  if (!c.require(isPlainObject(item), "concept must be an object")) return;
  c.noUnknownKeys([
    "id", "topicId", "titleBg", "titleEn", "summaryBg", "dependsOn", "lawRefs", "difficulty",
  ]);
  c.require(
    isNonEmptyString(item.id) && /^c-[a-z0-9-]+$/.test(item.id),
    'id must be kebab-case with "c-" prefix',
  );
  c.require(isNonEmptyString(item.topicId), "topicId must be a non-empty string");
  for (const key of ["titleBg", "titleEn", "summaryBg"]) {
    c.require(isNonEmptyString(item[key]), `${key} must be a non-empty string`);
  }
  if (c.require(
    Array.isArray(item.dependsOn) && item.dependsOn.every(isNonEmptyString),
    "dependsOn must be an array of non-empty strings",
  )) {
    const dupes = duplicates(item.dependsOn);
    if (dupes.length > 0) c.fail(`dependsOn contains duplicate ids: ${dupes.join(", ")}`);
  }
  checkLawRefs(c, item.lawRefs, { min: 1 });
  c.require([1, 2, 3].includes(item.difficulty), "difficulty must be 1, 2 or 3");
}

/** Finite number guard (NaN/Infinity are authoring garbage). */
const isFinite_ = (v) => typeof v === "number" && Number.isFinite(v);

/** { kind: "sign", signRef } shape (question media and option media). */
function checkSignMedia(c, media, label) {
  for (const key of Object.keys(media)) {
    if (key !== "kind" && key !== "signRef") c.fail(`${label}: unrecognized key "${key}"`);
  }
  c.require(isNonEmptyString(media.signRef), `${label}.signRef must be a non-empty string`);
}

/** THEO-1 question media union — mirror of QuestionMediaSchema in schemas.ts. */
function checkQuestionMedia(c, media) {
  if (!c.require(isPlainObject(media), "media must be null or an object")) return;

  if (media.kind === "sign") {
    checkSignMedia(c, media, "media");
    return;
  }

  if (media.kind === "sceneStill") {
    for (const key of Object.keys(media)) {
      if (!["kind", "districtId", "focus", "poses", "marks"].includes(key)) {
        c.fail(`media: unrecognized key "${key}"`);
      }
    }
    c.require(
      isNonEmptyString(media.districtId) && KEBAB_SLUG.test(media.districtId),
      "media.districtId must be kebab-case",
    );
    const focusOk =
      isPlainObject(media.focus) &&
      isFinite_(media.focus.x) &&
      isFinite_(media.focus.y) &&
      isFinite_(media.focus.zoomM);
    c.require(focusOk, "media.focus must be { x, y, zoomM } with finite numbers");
    if (focusOk) {
      c.require(
        media.focus.zoomM >= SCENE_ZOOM_MIN_M && media.focus.zoomM <= SCENE_ZOOM_MAX_M,
        `media.focus.zoomM must be between ${SCENE_ZOOM_MIN_M} and ${SCENE_ZOOM_MAX_M} meters`,
      );
      for (const key of Object.keys(media.focus)) {
        if (!["x", "y", "zoomM"].includes(key)) c.fail(`media.focus: unrecognized key "${key}"`);
      }
    }
    const half = focusOk ? media.focus.zoomM / 2 : Infinity;
    const outside = (x, y) =>
      focusOk && (Math.abs(x - media.focus.x) > half || Math.abs(y - media.focus.y) > half);

    if (c.require(Array.isArray(media.poses), "media.poses must be an array")) {
      if (media.poses.length > SCENE_MAX_POSES) {
        c.fail(`media.poses must contain at most ${SCENE_MAX_POSES} entries`);
      }
      media.poses.forEach((pose, i) => {
        if (!isPlainObject(pose)) return c.fail(`media.poses[${i}] must be an object`);
        for (const key of Object.keys(pose)) {
          if (!["kind", "x", "y", "headingDeg", "variant"].includes(key)) {
            c.fail(`media.poses[${i}]: unrecognized key "${key}"`);
          }
        }
        c.require(
          SCENE_POSE_KINDS.includes(pose.kind),
          `media.poses[${i}].kind must be one of: ${SCENE_POSE_KINDS.join(", ")}`,
        );
        c.require(isFinite_(pose.x) && isFinite_(pose.y), `media.poses[${i}] x/y must be finite numbers`);
        c.require(
          isFinite_(pose.headingDeg) && pose.headingDeg >= -360 && pose.headingDeg <= 360,
          `media.poses[${i}].headingDeg must be a finite number in [-360, 360]`,
        );
        if (pose.variant !== undefined) {
          c.require(pose.variant === "ego", `media.poses[${i}].variant must be "ego" when present`);
        }
        if (isFinite_(pose.x) && isFinite_(pose.y) && outside(pose.x, pose.y)) {
          c.fail(`media.poses[${i}] at (${pose.x}, ${pose.y}) is outside the focus window (±${half} m around the focus)`);
        }
      });
    }

    if (media.marks !== undefined) {
      if (c.require(Array.isArray(media.marks), "media.marks must be an array when present")) {
        if (media.marks.length > SCENE_MAX_MARKS) {
          c.fail(`media.marks must contain at most ${SCENE_MAX_MARKS} entries`);
        }
        media.marks.forEach((mark, i) => {
          if (!isPlainObject(mark)) return c.fail(`media.marks[${i}] must be an object`);
          for (const key of Object.keys(mark)) {
            if (!["kind", "x", "y"].includes(key)) c.fail(`media.marks[${i}]: unrecognized key "${key}"`);
          }
          c.require(
            SCENE_MARK_KINDS.includes(mark.kind),
            `media.marks[${i}].kind must be one of: ${SCENE_MARK_KINDS.join(", ")}`,
          );
          c.require(isFinite_(mark.x) && isFinite_(mark.y), `media.marks[${i}] x/y must be finite numbers`);
          if (isFinite_(mark.x) && isFinite_(mark.y) && outside(mark.x, mark.y)) {
            c.fail(`media.marks[${i}] at (${mark.x}, ${mark.y}) is outside the focus window (±${half} m around the focus)`);
          }
        });
      }
    }
    return;
  }

  // Legacy binary-ref shape (kept for contract compatibility, unused).
  if (media.type === "image" || media.type === "video") {
    c.require(isNonEmptyString(media.ref), "media.ref must be a non-empty string");
    for (const key of Object.keys(media)) {
      if (key !== "type" && key !== "ref") c.fail(`media: unrecognized key "${key}"`);
    }
    return;
  }

  c.fail('media must be null, { kind: "sign" }, { kind: "sceneStill" } or the legacy { type: "image"|"video" } shape');
}

function checkQuestion(item, index, relFile) {
  const c = checker(relFile, index, item);
  if (!c.require(isPlainObject(item), "question must be an object")) return;
  c.noUnknownKeys([
    "id", "conceptIds", "type", "points", "textBg", "options",
    "explanationBg", "lawRefs", "media", "status",
  ]);
  c.require(isNonEmptyString(item.id), "id must be a non-empty string");
  if (c.require(
    Array.isArray(item.conceptIds) && item.conceptIds.every(isNonEmptyString),
    "conceptIds must be an array of non-empty strings",
  )) {
    if (item.conceptIds.length < 1) c.fail("question must reference at least one concept");
    const dupes = duplicates(item.conceptIds);
    if (dupes.length > 0) c.fail(`conceptIds contains duplicate ids: ${dupes.join(", ")}`);
  }
  const typeOk = c.require(
    item.type === "single" || item.type === "multi",
    'type must be "single" or "multi"',
  );
  c.require([1, 2, 3].includes(item.points), "points must be 1, 2 or 3");
  c.require(isNonEmptyString(item.textBg), "textBg must be a non-empty string");
  c.require(isNonEmptyString(item.explanationBg), "explanationBg must be a non-empty string");
  checkLawRefs(c, item.lawRefs, { min: 1 });
  if (item.media !== null) checkQuestionMedia(c, item.media);
  c.require(STATUSES.includes(item.status), `status must be one of: ${STATUSES.join(", ")}`);

  if (!c.require(Array.isArray(item.options), "options must be an array")) return;
  if (item.options.length < 2) c.fail("question must offer at least 2 options");
  let correctCount = 0;
  item.options.forEach((option, i) => {
    if (!isPlainObject(option)) return c.fail(`options[${i}] must be an object`);
    c.require(isNonEmptyString(option.id), `options[${i}].id must be a non-empty string`);
    c.require(isNonEmptyString(option.textBg), `options[${i}].textBg must be a non-empty string`);
    c.require(typeof option.correct === "boolean", `options[${i}].correct must be a boolean`);
    if (option.correct === true) correctCount += 1;
    for (const key of Object.keys(option)) {
      if (!["id", "textBg", "correct", "media"].includes(key)) {
        c.fail(`options[${i}]: unrecognized key "${key}"`);
      }
    }
    // Option media (THEO-1): sign faces only.
    if (option.media !== undefined) {
      if (c.require(isPlainObject(option.media), `options[${i}].media must be an object when present`)) {
        c.require(option.media.kind === "sign", `options[${i}].media.kind must be "sign"`);
        checkSignMedia(c, option.media, `options[${i}].media`);
      }
    }
  });
  const optionDupes = duplicates(item.options.map((o) => (isPlainObject(o) ? o.id : "")));
  if (optionDupes.length > 0) {
    c.fail(`option ids must be unique within a question, duplicated: ${optionDupes.join(", ")}`);
  }
  if (typeOk) {
    if (item.type === "single" && correctCount !== 1) {
      c.fail(`"single" question must have exactly 1 correct option, found ${correctCount}`);
    }
    if (item.type === "multi" && correctCount < 2) {
      c.fail(`"multi" question must have at least 2 correct options, found ${correctCount}`);
    }
  }
}

function checkSection(item, index) {
  const c = checker("sections.json", index, item);
  if (!c.require(isPlainObject(item), "section must be an object")) return;
  c.noUnknownKeys(["id", "topicId", "titleBg", "conceptIds"]);
  c.require(
    isNonEmptyString(item.id) && /^s-[a-z0-9-]+$/.test(item.id),
    'id must be kebab-case with "s-" prefix',
  );
  c.require(isNonEmptyString(item.topicId), "topicId must be a non-empty string");
  c.require(isNonEmptyString(item.titleBg), "titleBg must be a non-empty string");
  if (c.require(
    Array.isArray(item.conceptIds) && item.conceptIds.every(isNonEmptyString),
    "conceptIds must be an array of non-empty strings",
  )) {
    if (item.conceptIds.length < 1) c.fail("section must reference at least one concept");
    const dupes = duplicates(item.conceptIds);
    if (dupes.length > 0) c.fail(`conceptIds contains duplicate ids: ${dupes.join(", ")}`);
  }
}

function checkSign(item, index) {
  const c = checker("signs/signs.json", index, item);
  if (!c.require(isPlainObject(item), "sign must be an object")) return;
  c.noUnknownKeys([
    "id", "code", "group", "nameBg", "meaningBg", "svgFile", "lawRefs", "status",
  ]);
  c.require(
    isNonEmptyString(item.id) && /^sign-[a-z0-9-]+$/.test(item.id),
    'id must be kebab-case with "sign-" prefix',
  );
  for (const key of ["code", "group", "nameBg", "meaningBg", "svgFile"]) {
    c.require(isNonEmptyString(item[key]), `${key} must be a non-empty string`);
  }
  checkLawRefs(c, item.lawRefs);
  c.require(STATUSES.includes(item.status), `status must be one of: ${STATUSES.join(", ")}`);
  if (isNonEmptyString(item.svgFile) && !fs.existsSync(path.join(contentDir, item.svgFile))) {
    c.fail(`svgFile "${item.svgFile}" does not exist`);
  }
}

// --------------------------------------------------------------------------
// Load + structural validation
// --------------------------------------------------------------------------
const topics = readJsonArray("topics.json") ?? [];
const concepts = readJsonArray("concepts.json") ?? [];
const signs = readJsonArray(path.join("signs", "signs.json")) ?? [];
const sectionsFileExists = fs.existsSync(path.join(contentDir, "sections.json"));
const sections = sectionsFileExists ? (readJsonArray("sections.json") ?? []) : [];

const questionsDir = path.join(contentDir, "questions");
const questionFiles = new Map(); // slug -> questions[]
if (fs.existsSync(questionsDir)) {
  for (const file of fs.readdirSync(questionsDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const slug = file.slice(0, -".json".length);
    questionFiles.set(slug, readJsonArray(path.join("questions", file)) ?? []);
  }
}

topics.forEach(checkTopic);
concepts.forEach(checkConcept);
for (const [slug, questions] of questionFiles) {
  questions.forEach((q, i) => checkQuestion(q, i, `questions/${slug}.json`));
}
sections.forEach(checkSection);
signs.forEach(checkSign);

// --------------------------------------------------------------------------
// Referential integrity (mirror of loader.ts phase 2)
// --------------------------------------------------------------------------
const idOwner = new Map();
function registerIds(items, file) {
  for (const item of items) {
    if (!isPlainObject(item) || !isNonEmptyString(item.id)) continue;
    const owner = idOwner.get(item.id);
    if (owner !== undefined) {
      errors.push(`duplicate id "${item.id}" in ${file} (already defined in ${owner})`);
    } else {
      idOwner.set(item.id, file);
    }
  }
}
registerIds(topics, "topics.json");
registerIds(concepts, "concepts.json");
for (const [slug, questions] of questionFiles) registerIds(questions, `questions/${slug}.json`);
registerIds(sections, "sections.json");
registerIds(signs, "signs/signs.json");

for (const slug of duplicates(topics.map((t) => t?.slug))) {
  errors.push(`topics.json: duplicate slug "${slug}"`);
}
for (const order of duplicates(topics.map((t) => String(t?.order)))) {
  errors.push(`topics.json: duplicate order ${order}`);
}

const topicIds = new Set(topics.map((t) => t?.id));
const topicSlugs = new Set(topics.map((t) => t?.slug));
const conceptIds = new Set(concepts.map((c) => c?.id));

for (const concept of concepts) {
  if (!isPlainObject(concept)) continue;
  if (!topicIds.has(concept.topicId)) {
    errors.push(`concepts.json: concept "${concept.id}" references unknown topicId "${concept.topicId}"`);
  }
  for (const dep of Array.isArray(concept.dependsOn) ? concept.dependsOn : []) {
    if (!conceptIds.has(dep)) {
      errors.push(`concepts.json: concept "${concept.id}" dependsOn unknown concept "${dep}"`);
    }
  }
}

// Media references (THEO-1): signRef -> signs.json code, districtId -> world map.
const signCodes = new Set(signs.filter(isPlainObject).map((s) => s.code));
const worldDir = path.resolve(contentDir, "..", "platform", "public", "world");
const districtExists = (districtId) => fs.existsSync(path.join(worldDir, `${districtId}.json`));

for (const [slug, questions] of questionFiles) {
  if (!topicSlugs.has(slug)) {
    errors.push(`questions/${slug}.json: no topic with slug "${slug}" in topics.json`);
  }
  for (const question of questions) {
    if (!isPlainObject(question)) continue;
    const at = `questions/${slug}.json: question "${question.id}"`;
    for (const conceptId of Array.isArray(question.conceptIds) ? question.conceptIds : []) {
      if (!conceptIds.has(conceptId)) {
        errors.push(`${at} references unknown concept "${conceptId}"`);
      }
    }
    const media = question.media;
    if (isPlainObject(media)) {
      if (media.kind === "sign" && !signCodes.has(media.signRef)) {
        errors.push(`${at} media references unknown signRef "${media.signRef}" (no such code in signs/signs.json)`);
      }
      if (
        media.kind === "sceneStill" &&
        isNonEmptyString(media.districtId) &&
        KEBAB_SLUG.test(media.districtId) &&
        !districtExists(media.districtId)
      ) {
        errors.push(`${at} media references unknown districtId "${media.districtId}" (no platform/public/world/${media.districtId}.json)`);
      }
    }
    for (const option of Array.isArray(question.options) ? question.options : []) {
      if (isPlainObject(option) && isPlainObject(option.media) && !signCodes.has(option.media.signRef)) {
        errors.push(`${at} option "${option.id}" media references unknown signRef "${option.media.signRef}" (no such code in signs/signs.json)`);
      }
    }
  }
}

// Sections (optional layer): when present, must partition every concept
// exactly once and only group concepts of their own parent topic.
if (sections.length > 0) {
  const conceptTopicById = new Map(
    concepts.filter((c) => isPlainObject(c) && isNonEmptyString(c.id)).map((c) => [c.id, c.topicId]),
  );
  const conceptToSection = new Map();
  for (const section of sections) {
    if (!isPlainObject(section)) continue;
    if (!topicIds.has(section.topicId)) {
      errors.push(`sections.json: section "${section.id}" references unknown topicId "${section.topicId}"`);
    }
    for (const conceptId of Array.isArray(section.conceptIds) ? section.conceptIds : []) {
      if (!conceptIds.has(conceptId)) {
        errors.push(`sections.json: section "${section.id}" references unknown concept "${conceptId}"`);
        continue;
      }
      const conceptTopic = conceptTopicById.get(conceptId);
      if (conceptTopic !== section.topicId) {
        errors.push(
          `sections.json: section "${section.id}" (topic "${section.topicId}") includes concept "${conceptId}" of topic "${conceptTopic}"`,
        );
      }
      const owner = conceptToSection.get(conceptId);
      if (owner !== undefined) {
        errors.push(`sections.json: concept "${conceptId}" appears in multiple sections ("${owner}" and "${section.id}")`);
      } else {
        conceptToSection.set(conceptId, section.id);
      }
    }
  }
  for (const concept of concepts) {
    if (!isPlainObject(concept) || !isNonEmptyString(concept.id)) continue;
    if (!conceptToSection.has(concept.id)) {
      errors.push(`sections.json: concept "${concept.id}" is not assigned to any section`);
    }
  }
}

// Dependency graph must be acyclic (mirror of loader.ts findDependencyCycle).
{
  const byId = new Map(
    concepts.filter((c) => isPlainObject(c) && isNonEmptyString(c.id)).map((c) => [c.id, c]),
  );
  const state = new Map();
  const stack = [];
  let cycle = null;
  const visit = (id) => {
    state.set(id, "visiting");
    stack.push(id);
    const deps = byId.get(id)?.dependsOn;
    for (const dep of Array.isArray(deps) ? deps : []) {
      if (!byId.has(dep)) continue;
      const depState = state.get(dep);
      if (depState === "visiting") {
        cycle = [...stack.slice(stack.indexOf(dep)), dep];
        return true;
      }
      if (depState === undefined && visit(dep)) return true;
    }
    stack.pop();
    state.set(id, "done");
    return false;
  };
  for (const id of byId.keys()) {
    if (!state.has(id) && visit(id)) break;
  }
  if (cycle) errors.push(`concepts.json: dependsOn cycle detected: ${cycle.join(" -> ")}`);
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
const allQuestions = [...questionFiles.values()].flat();

function statusCounts(items) {
  const counts = { draft: 0, "needs-review": 0, approved: 0 };
  for (const item of items) {
    if (isPlainObject(item) && STATUSES.includes(item.status)) counts[item.status] += 1;
  }
  return counts;
}

const rows = [
  ["topics", topics.length, null],
  ["concepts", concepts.length, null],
  ["sections", sections.length, null],
  ["questions", allQuestions.length, statusCounts(allQuestions)],
  ["signs", signs.length, statusCounts(signs)],
];

console.log(`Content validation — ${contentDir}\n`);
console.log(
  "  " + "type".padEnd(11) + "count".padStart(5) +
  "draft".padStart(9) + "needs-review".padStart(14) + "approved".padStart(10),
);
console.log("  " + "-".repeat(49));
for (const [name, count, statuses] of rows) {
  console.log(
    "  " + name.padEnd(11) + String(count).padStart(5) +
    String(statuses ? statuses.draft : "-").padStart(9) +
    String(statuses ? statuses["needs-review"] : "-").padStart(14) +
    String(statuses ? statuses.approved : "-").padStart(10),
  );
}
const coveredTopics = topics.filter((t) => questionFiles.has(t?.slug)).length;
console.log(`\n  question files: ${questionFiles.size} (topics covered: ${coveredTopics}/${topics.length})`);

if (errors.length > 0) {
  console.error(`\nFAIL — ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("\nOK — all structural and referential checks passed.");
