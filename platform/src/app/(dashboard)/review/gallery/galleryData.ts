/**
 * galleryData — SERVER-ONLY index for the founder review gallery.
 *
 * The verdict board lists the work; this assembles what the founder has to
 * LOOK at to rule on it. Two bodies of artefacts, one index:
 *
 *  - SCENARIOS: every authored `ScenarioSpec` (the ~150 templates), each with
 *    its pre-rendered scene still, its district, and whichever of its mistake
 *    demos already have a produced reel in public/clips/manifest.json.
 *  - QUESTIONS: every picture-bearing question in the bank — sign faces (served
 *    live from /api/signs) and scene stills (the committed 3D renders under
 *    public/scene-stills, falling back to the in-app 2D canvas).
 *
 * HONESTY IS THE CONTRACT. Nothing is silently omitted: a template whose still
 * has not been rendered, a mistake with no reel, a manifest entry whose .webm
 * is missing on this machine — each is carried through as an explicit gap so
 * the gallery can show the founder the true state instead of a tidy lie.
 *
 * Touches `fs` and the scenario catalogue, so only the server page and the
 * /dev/gallery-index feed may import it; the client takes the plain data.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveContentDir } from "@/lib/content/loader";
import type { QuestionMedia, SceneStillMedia } from "@/lib/content/types";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import {
  scenarioStillSpec,
  stillKeyForScenario,
  type ScenarioStillResult,
  type StillParkingBay,
  type StillSpawnPoint,
  type StillTraceSample,
} from "./galleryStillSpec";

/** Where the build script writes, and the gallery reads, its stills. */
export const GALLERY_STILL_DIR = "gallery-stills";
export const GALLERY_STILL_EXT = ".webp";

// ---------------------------------------------------------------------------
// Shapes handed to the client (plain, serializable)
// ---------------------------------------------------------------------------

export interface GalleryReel {
  /** Manifest clip id — `<templateId>__m<mistakeIndex>`. */
  id: string;
  mistakeIndex: number;
  titleBg: string;
  src: string;
  durationSec: number;
  /** The fault keyframe (poster) and the full R0 strip, when produced. */
  posterUrl: string | null;
  keyframes: string[];
  /** False when the manifest names a .webm this checkout does not have. */
  fileOnDisk: boolean;
}

export interface GalleryMistake {
  index: number;
  titleBg: string;
  whatWentWrongBg: string;
  /** The produced reel, or null — "не е рендиран още". */
  reel: GalleryReel | null;
}

export interface GalleryScenario {
  id: string;
  titleBg: string;
  objectiveBg: string;
  family: string;
  archetypeIds: string[];
  districtId: string;
  tagsBg: string[];
  lawRefBg: string;
  /** Rendered still URL, or null when it has not been produced yet. */
  stillUrl: string | null;
  /** How the still's ego pose was derived (provenance for the founder). */
  stillSource: ScenarioStillResult["source"];
  mistakes: GalleryMistake[];
  /** Mistakes with no produced reel — the honest per-card gap count. */
  reelGaps: number;
}

export interface GalleryQuestion {
  id: string;
  group: string;
  textBg: string;
  mediaKind: "sign" | "signSet" | "sceneStill";
  /** Sign questions: the official code the /api/signs endpoint serves. */
  signRef: string | null;
  /**
   * COMPARISON questions („Кой от показаните знаци…"): one code per option, in
   * option order. These carry their artwork on `options[].media`, not on
   * `question.media` — and because this loader only ever read `question.media`,
   * all 18 of them were invisible on this page. The founder could not review
   * the one question shape that is nothing BUT artwork.
   */
  signRefs: string[] | null;
  /** Scene-still questions: the committed 3D render, when one exists. */
  stillUrl: string | null;
  /** The raw spec, so the client can fall back to the in-app 2D canvas. */
  sceneStill: SceneStillMedia | null;
  correctBg: string[];
  needsReview: boolean;
}

export interface GalleryIndex {
  scenarios: GalleryScenario[];
  questions: GalleryQuestion[];
  stats: {
    scenarioCount: number;
    scenariosWithStill: number;
    mistakeCount: number;
    reelCount: number;
    questionCount: number;
    questionsWithStill: number;
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function repoRoot(): string {
  return path.resolve(resolveContentDir(), "..");
}

function publicDir(): string {
  return path.join(repoRoot(), "platform", "public");
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readJson(p: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The clip manifest (server-side read of the same file the browser fetches)
// ---------------------------------------------------------------------------

interface RawClip {
  id?: unknown;
  templateId?: unknown;
  mistakeIndex?: unknown;
  src?: unknown;
  durationSec?: unknown;
  titleBg?: unknown;
  keyframes?: unknown;
}

/** clip id → the produced reel, read straight off public/clips/manifest.json. */
function loadReels(): Map<string, GalleryReel> {
  const out = new Map<string, GalleryReel>();
  const pub = publicDir();
  const raw = readJson(path.join(pub, "clips", "manifest.json"));
  const clips = (raw as { clips?: unknown } | null)?.clips;
  if (!Array.isArray(clips)) return out;

  for (const c of clips as RawClip[]) {
    if (typeof c?.id !== "string" || typeof c?.src !== "string") continue;
    if (typeof c.templateId !== "string" || typeof c.mistakeIndex !== "number") continue;
    const keyframes = Array.isArray(c.keyframes)
      ? (c.keyframes.filter((k) => typeof k === "string") as string[])
      : [];
    // FAULT_KEYFRAME_INDEX is 2 (window start, −2 s, fault, +2 s, end).
    const poster = keyframes[2] ?? keyframes[0] ?? null;
    out.set(c.id, {
      id: c.id,
      mistakeIndex: c.mistakeIndex,
      titleBg: typeof c.titleBg === "string" ? c.titleBg : c.id,
      src: c.src,
      durationSec: typeof c.durationSec === "number" ? c.durationSec : 0,
      posterUrl: poster,
      keyframes,
      fileOnDisk: fileExists(path.join(pub, c.src.replace(/^\//, ""))),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

function loadScenarios(): { items: GalleryScenario[]; reelCount: number; mistakeCount: number } {
  const reels = loadReels();
  const stillDir = path.join(publicDir(), GALLERY_STILL_DIR);
  let reelCount = 0;
  let mistakeCount = 0;

  const items = SCENARIO_TEMPLATES.map((spec): GalleryScenario => {
    const key = stillKeyForScenario(spec.id);
    const stillFile = path.join(stillDir, key + GALLERY_STILL_EXT);
    const hasStill = fileExists(stillFile);

    const mistakes = spec.mistakes.map((m, i): GalleryMistake => {
      mistakeCount += 1;
      const reel = reels.get(`${spec.id}__m${i}`) ?? null;
      if (reel) reelCount += 1;
      return {
        index: i,
        titleBg: m.titleBg,
        whatWentWrongBg: m.whatWentWrongBg,
        reel,
      };
    });

    return {
      id: spec.id,
      titleBg: spec.titleBg,
      objectiveBg: spec.objectiveBg,
      family: spec.family,
      archetypeIds: [...spec.archetypeIds],
      districtId: spec.map.districtId,
      tagsBg: [...spec.tagsBg],
      lawRefBg: spec.teach.lawRef,
      stillUrl: hasStill ? `/${GALLERY_STILL_DIR}/${key}${GALLERY_STILL_EXT}` : null,
      stillSource: hasStill ? readStillSource(stillDir, key) : null,
      mistakes,
      reelGaps: mistakes.filter((m) => m.reel === null).length,
    };
  });

  return { items, reelCount, mistakeCount };
}

/** The build script records each still's pose provenance in a sidecar index. */
interface StillSidecar {
  sources?: Record<string, ScenarioStillResult["source"]>;
}
let sidecarCache: StillSidecar | null | undefined;
function readStillSource(stillDir: string, key: string): ScenarioStillResult["source"] {
  if (sidecarCache === undefined) {
    sidecarCache = (readJson(path.join(stillDir, "manifest.json")) as StillSidecar) ?? null;
  }
  return sidecarCache?.sources?.[key] ?? null;
}

// ---------------------------------------------------------------------------
// Questions (the picture-bearing half)
// ---------------------------------------------------------------------------

interface RawOption {
  textBg?: unknown;
  correct?: unknown;
  /** Sign-face option (THEO-1). The comparison items carry their art HERE. */
  media?: unknown;
}
interface RawQuestion {
  id?: unknown;
  textBg?: unknown;
  media?: unknown;
  status?: unknown;
  reviewNote?: unknown;
  options?: unknown;
}

function loadQuestions(): { items: GalleryQuestion[]; withStill: number } {
  const dir = path.join(resolveContentDir(), "questions");
  const sceneStillDir = path.join(publicDir(), "scene-stills");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return { items: [], withStill: 0 };
  }

  const items: GalleryQuestion[] = [];
  let withStill = 0;

  for (const file of files) {
    const parsed = readJson(path.join(dir, file));
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : ((parsed as { questions?: unknown; items?: unknown })?.questions ??
        (parsed as { items?: unknown })?.items ??
        []);
    if (!Array.isArray(arr)) continue;
    const group = file.slice(0, -".json".length);

    for (const q of arr as RawQuestion[]) {
      const media = q?.media as QuestionMedia | null | undefined;
      const options = Array.isArray(q.options) ? (q.options as RawOption[]) : [];
      // The comparison shape puts its art on the OPTIONS and leaves
      // `question.media` null — legitimately, because there is no single
      // picture to show above the text. Reading only `question.media` (what
      // this loop used to do) drops all 18 of those questions on the floor.
      const optionSignRefs = options
        .map((o) => o?.media as QuestionMedia | null | undefined)
        .filter((m): m is { kind: "sign"; signRef: string } =>
          !!m && typeof m === "object" && "kind" in m && m.kind === "sign")
        .map((m) => m.signRef);

      const hasQuestionMedia = !!media && typeof media === "object" && "kind" in media;
      if (!hasQuestionMedia && optionSignRefs.length === 0) continue;
      if (typeof q.id !== "string" || typeof q.textBg !== "string") continue;

      const correctBg = options
        .filter((o) => o?.correct === true && typeof o.textBg === "string")
        .map((o) => o.textBg as string);
      const note = typeof q.reviewNote === "string" ? q.reviewNote : "";
      const needsReview = q.status === "draft" || /NEEDS-FOUNDER-REVIEW/i.test(note);

      if (!hasQuestionMedia) {
        // „Кой от показаните знаци…" — the answer IS one of the pictures, so
        // the correct option's own code is what the founder has to check.
        const correctRefs = options
          .filter((o) => o?.correct === true)
          .map((o) => o?.media as { signRef?: string } | undefined)
          .map((m) => m?.signRef)
          .filter((s): s is string => typeof s === "string");
        items.push({
          id: q.id,
          group,
          textBg: q.textBg,
          mediaKind: "signSet",
          signRef: null,
          signRefs: optionSignRefs,
          stillUrl: null,
          sceneStill: null,
          correctBg: correctRefs.length > 0 ? correctRefs : correctBg,
          needsReview,
        });
        continue;
      }

      if (media!.kind === "sign") {
        items.push({
          id: q.id,
          group,
          textBg: q.textBg,
          mediaKind: "sign",
          signRef: media!.signRef,
          signRefs: null,
          stillUrl: null,
          sceneStill: null,
          correctBg,
          needsReview,
        });
        continue;
      }

      // sceneStill — prefer the committed 3D render, else the 2D canvas.
      const png = fileExists(path.join(sceneStillDir, `${q.id}.png`));
      if (png) withStill += 1;
      items.push({
        id: q.id,
        group,
        textBg: q.textBg,
        mediaKind: "sceneStill",
        signRef: null,
        signRefs: null,
        stillUrl: png ? `/scene-stills/${q.id}.png` : null,
        sceneStill: media as SceneStillMedia,
        correctBg,
        needsReview,
      });
    }
  }

  return { items, withStill };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** The whole gallery, ready to hand to the client. */
export function loadGalleryIndex(): GalleryIndex {
  sidecarCache = undefined; // re-read the sidecar on every request (dev churn)
  const { items: scenarios, reelCount, mistakeCount } = loadScenarios();
  const { items: questions, withStill } = loadQuestions();

  return {
    scenarios,
    questions,
    stats: {
      scenarioCount: scenarios.length,
      scenariosWithStill: scenarios.filter((s) => s.stillUrl !== null).length,
      mistakeCount,
      reelCount,
      questionCount: questions.length,
      questionsWithStill: withStill + questions.filter((q) => q.mediaKind === "sign").length,
    },
  };
}

// ---------------------------------------------------------------------------
// The render job list (build script only — reads every shadow trace)
// ---------------------------------------------------------------------------

export interface GalleryStillJob {
  key: string;
  templateId: string;
  districtId: string;
  /** base64 of the SceneStillMedia — exactly what /dev/scene-still?spec= wants. */
  specB64: string;
  source: ScenarioStillResult["source"];
}

export interface GalleryStillJobList {
  jobs: GalleryStillJob[];
  /** Templates no pose could be resolved for — rendered as nothing, listed honestly. */
  gaps: { templateId: string; reason: string }[];
}

interface DistrictRead {
  spawnPoints: StillSpawnPoint[];
  bays: StillParkingBay[];
}

const districtCache = new Map<string, DistrictRead>();

/** Spawn points + `meta.scenario` bays from one committed district file. */
function districtFacts(districtId: string): DistrictRead {
  const hit = districtCache.get(districtId);
  if (hit) return hit;

  const raw = readJson(path.join(publicDir(), "world", `${districtId}.json`)) as {
    spawnPoints?: unknown;
    meta?: { scenario?: { bays?: unknown; targetBayId?: unknown } };
  } | null;

  const sp = raw?.spawnPoints;
  const spawnPoints: StillSpawnPoint[] = Array.isArray(sp)
    ? (sp as Record<string, unknown>[])
        .filter(
          (p) =>
            typeof p.id === "string" && typeof p.x === "number" && typeof p.y === "number",
        )
        .map((p) => ({
          id: p.id as string,
          x: p.x as number,
          y: p.y as number,
          heading: typeof p.heading === "number" ? p.heading : 0,
        }))
    : [];

  const rawBays = raw?.meta?.scenario?.bays;
  const targetId = raw?.meta?.scenario?.targetBayId;
  const bays: StillParkingBay[] = Array.isArray(rawBays)
    ? (rawBays as Record<string, unknown>[])
        .filter((b) => typeof b.x === "number" && typeof b.y === "number")
        .map((b) => ({
          x: b.x as number,
          y: b.y as number,
          headingDeg: typeof b.headingDeg === "number" ? b.headingDeg : 0,
          occupied: b.occupied === true,
          isTarget: typeof targetId === "string" && b.id === targetId,
        }))
    : [];

  const facts = { spawnPoints, bays };
  districtCache.set(districtId, facts);
  return facts;
}

interface ShadowRead {
  samples: StillTraceSample[] | null;
  annotationsSec: number[];
}

function readShadow(tracePath: string, pending: boolean): ShadowRead {
  if (pending) return { samples: null, annotationsSec: [] };
  const raw = readJson(path.join(repoRoot(), tracePath));
  const rawSamples = (raw as { samples?: unknown } | null)?.samples;
  if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
    return { samples: null, annotationsSec: [] };
  }
  const samples = (rawSamples as Record<string, unknown>[])
    .filter(
      (s) =>
        typeof s.x === "number" && typeof s.y === "number" && typeof s.headingDeg === "number",
    )
    .map((s) => ({
      tSec: typeof s.tSec === "number" ? s.tSec : 0,
      x: s.x as number,
      y: s.y as number,
      headingDeg: s.headingDeg as number,
    }));

  const rawEvents = (raw as { events?: unknown } | null)?.events;
  const annotationsSec = Array.isArray(rawEvents)
    ? (rawEvents as Record<string, unknown>[])
        .filter((e) => e?.kind === "annotation" && typeof e.tSec === "number")
        .map((e) => e.tSec as number)
    : [];

  return { samples: samples.length > 0 ? samples : null, annotationsSec };
}

/**
 * Every still the build script has to render, with its spec already encoded.
 * Heavy (opens ~150 trace files), so it is deliberately NOT on the page path —
 * only /dev/gallery-index calls it.
 */
export function loadGalleryStillJobs(): GalleryStillJobList {
  const jobs: GalleryStillJob[] = [];
  const gaps: { templateId: string; reason: string }[] = [];

  for (const spec of SCENARIO_TEMPLATES) {
    const shadow = readShadow(spec.shadow.path, spec.shadow.pending === true);
    const district = districtFacts(spec.map.districtId);
    const result = scenarioStillSpec({
      templateId: spec.id,
      districtId: spec.map.districtId,
      archetype: spec.map.archetype,
      start: {
        spawnPointId: spec.start.spawnPointId,
        position: spec.start.position,
        headingDeg: spec.start.headingDeg,
      },
      spawnPoints: district.spawnPoints,
      parkingBays: district.bays,
      shadowSamples: shadow.samples,
      shadowAnnotationsSec: shadow.annotationsSec,
    });

    if (!result.spec) {
      gaps.push({ templateId: spec.id, reason: result.gap ?? "unknown" });
      continue;
    }
    jobs.push({
      key: stillKeyForScenario(spec.id),
      templateId: spec.id,
      districtId: spec.map.districtId,
      specB64: Buffer.from(JSON.stringify(result.spec), "utf-8").toString("base64"),
      source: result.source,
    });
  }

  return { jobs, gaps };
}
