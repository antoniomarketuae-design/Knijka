/**
 * The landing page's proof material: real captured mistakes, chosen at BUILD
 * TIME from the committed clip manifest.
 *
 * SERVER-ONLY — it touches `node:fs`. The landing route is prerendered (`○ /`
 * in the build output), so everything here runs once at build and costs the
 * visitor no JavaScript at all; what ships is the resulting <div>s.
 *
 * WHY THE DISK CHECK EXISTS. `public/clips/manifest.json` is committed, but
 * every `.webm` and `.k*.webp` it names is GITIGNORED (platform/.gitignore,
 * and public/clips/README.md says so explicitly) — the binaries reach staging
 * by scp, not by git. So the manifest is a promise the filesystem may not be
 * keeping: a fresh clone, CI, and the VPS before its first media sync all have
 * a full manifest and zero files. Trusting it blind is how a landing page ends
 * up showing five broken images to the first visitor who ever sees it.
 *
 * `existsSync` at build turns that from a runtime accident into a build-time
 * fact, and the page simply renders one section fewer when the media is not
 * there. That is the same tolerance every other clip reader in the product
 * already implements ("every reader tolerates a missing clip file quietly").
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { FAULT_KEYFRAME_INDEX, parseClipManifest, type MistakeClip } from "@/modules/clips/view";
import manifestJson from "../../../../public/clips/manifest.json";

/** Everything the reel and the filmstrip need, already proven to be on disk. */
export interface FeaturedMistake {
  id: string;
  /** STORED mistake title (ADR-002 — copied from the manifest, never written
   *  here). This is the product's own words on a marketing page. */
  titleBg: string;
  /** The five rig stills, k0..k4, in capture order. */
  frames: readonly string[];
  /** frames[FAULT_KEYFRAME_INDEX] — the frame that carries the ❌. */
  faultFrame: string;
}

/**
 * The one mistake the proof section opens with.
 *
 * Chosen, not sampled. A zebra crossing at dusk with a pedestrian already on
 * the markings is the one situation every audience on this page reads without
 * a caption — the teenager, the parent, and the school. It is also graded
 * `опасна` (10 points, instant fail), so the stakes the copy claims beside it
 * are the stakes the engine actually assigns.
 */
const HERO_MISTAKE_ID = "sc-zebra-approach__m0";

/**
 * The filmstrip beside it. Deliberately spread across situation types —
 * a STOP line, night speed in rain, a child hidden by parked cars, a
 * roundabout and a following distance — so the strip reads as "this covers
 * driving", not "this covers junctions".
 */
const STRIP_MISTAKE_IDS: readonly string[] = [
  "sc-junction-stop__m0",
  "sc-speed-rain__m0",
  "sc-pe-parked-row-scan__m0",
  "sc-roundabout-entry__m0",
  "sc-follow-distance__m0",
  "sc-turn-left-oncoming__m0",
];

const PUBLIC_DIR = join(process.cwd(), "public");

/** Is this `/clips/…` URL actually a file in `public/`? Build-time only. */
function assetOnDisk(publicUrl: string): boolean {
  // Manifest URLs are always root-relative and always ours; anything else is
  // a malformed entry and is treated as missing rather than probed.
  if (!publicUrl.startsWith("/")) return false;
  return existsSync(join(PUBLIC_DIR, publicUrl.slice(1)));
}

/**
 * A clip is usable here only with the COMPLETE five-frame strip present. A
 * partial set would animate with holes, and the reel's whole claim is that it
 * is the captured sequence rather than a montage.
 */
function toFeatured(clip: MistakeClip): FeaturedMistake | null {
  const frames = clip.keyframes;
  if (frames === undefined || frames.length <= FAULT_KEYFRAME_INDEX) return null;
  if (!frames.every(assetOnDisk)) return null;
  return {
    id: clip.id,
    titleBg: clip.titleBg,
    frames,
    faultFrame: frames[FAULT_KEYFRAME_INDEX],
  };
}

/** The manifest, validated through the sanctioned reader (a malformed or
 *  version-bumped file reads as "no clips" and the page degrades). */
const CLIPS: readonly MistakeClip[] = parseClipManifest(manifestJson) ?? [];

function featuredById(id: string): FeaturedMistake | null {
  const clip = CLIPS.find((candidate) => candidate.id === id);
  return clip === undefined ? null : toFeatured(clip);
}

/** The reel's clip, or `null` when its stills are not on this machine. */
export function heroMistake(): FeaturedMistake | null {
  return featuredById(HERO_MISTAKE_ID);
}

/** The filmstrip, minus any entry whose stills are missing. May be empty. */
export function stripMistakes(): readonly FeaturedMistake[] {
  return STRIP_MISTAKE_IDS.map(featuredById).filter(
    (entry): entry is FeaturedMistake => entry !== null,
  );
}

/** How many captured mistake clips the manifest carries, for the copy. Counted
 *  from the manifest rather than the disk: it is a claim about what the
 *  product has produced, not about what this checkout happens to hold. */
export const CAPTURED_MISTAKE_COUNT = CLIPS.length;

/**
 * The debrief the product actually prints for the featured mistake, quoted
 * VERBATIM beside the reel.
 *
 * ADR-002 is the reason this is a quote and not a paragraph someone wrote for
 * the landing page: the explanation is stored content, never generated, and a
 * marketing surface that paraphrases it is advertising a product that does not
 * exist. The source of truth is `SC_ZEBRA_APPROACH.mistakes[0]` in
 * `@/modules/sim/lessons/scenario/templates-flow`.
 *
 * It is COPIED rather than imported on purpose. Importing the scenario module
 * to render three lines would pull the scenario catalogue into this route's
 * graph — the same ~737 KB regression audit M-26 measured on /theory/practice,
 * and the reason `clips/view` keeps a barrel-weight test at all. The copy is
 * pinned instead by `__tests__/featuredMistakes.test.ts`, which imports the
 * template and fails if these strings ever drift from it.
 */
export const FEATURED_DEBRIEF = {
  /** SC_ZEBRA_APPROACH.mistakes[0].titleBg */
  titleBg: "Твърде бързо приближаване",
  /** SC_ZEBRA_APPROACH.mistakes[0].whatWentWrongBg */
  whatWentWrongBg:
    "Колата навлезе в зоната на пътеката с непроменена висока скорост, докато пешеходката вече беше на платното. Дори спирането след това да успее, самото приближаване без готовност е опасната грешка — чл. 119 изисква скорост, позволяваща спиране.",
  /** SC_ZEBRA_APPROACH.teach.lawRef */
  lawRef: "ЗДвП чл. 119",
  /** SC_ZEBRA_APPROACH.teach.examinerBg — what the examiner is watching for.
   *  It is on this page because it is the single most reassuring thing the
   *  content bank contains for a parent: the product knows the rubric. */
  examinerBg:
    "Изпитващият гледа три неща: отчетливо намаляване при приближаване към пътеката, пълно спиране при пешеходец на нея и потегляне едва когато пътеката е освободена. Преминаване, докато пешеходецът е на платното, е опасна грешка и прекратява изпита.",
} as const;
