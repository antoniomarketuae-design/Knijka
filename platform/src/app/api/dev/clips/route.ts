/**
 * DEV-ONLY clip sink for the /dev/clip-capture rig (doc 66, CaptureScene v2):
 *
 *   GET  /api/dev/clips → the current public/clips/manifest.json
 *   POST /api/dev/clips → multipart form { id, templateId, mistakeIndex,
 *        tracePath, titleBg, durationSec, view, actors, quality, file,
 *        k0..k4 } — writes public/clips/<id>.webm + the five R0 keyframe
 *        stills public/clips/<id>.k0..k4.png and UPSERTS the manifest entry
 *        (keyframes + actor checklist + view + quality are ADDITIVE manifest
 *        fields; version stays 1, readers that predate them keep parsing).
 *
 * MACHINE GATES (doc 66 R0/R1, post pilot-v2): the sink rejects what R0
 * could never certify — a clip without its plan card (no_plan), a clip whose
 * required actors did not all stage (r1_actor_missing, 422) and a clip
 * without ALL FIVE keyframes (bad_keyframe; the v1-era "or none" leniency is
 * gone — a keyframe-less artifact is R0-blind by construction).
 *
 * The keyframes are the R0 evidence: Claude inspects them WITH VISION against
 * R1–R6 before the founder sees anything ("tests green" is not evidence for
 * visual work — only looking is). The actors field is the R1 cross-check:
 * what the capture actually staged vs the plan card.
 *
 * 404 in production (the /api/review convention) — the capture rig is a
 * founder/dev tool; nothing here ships to students. Idempotent by design:
 * re-recording a clip overwrites the binaries and replaces the entry, so the
 * main session re-runs stragglers freely.
 *
 * Contract: src/modules/clips/capture/manifest.ts (writer side) ↔
 * src/modules/clips/view/clipManifest.ts (reader side).
 */

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { clipPlanForId } from "@/modules/clips";
import {
  CLIP_ID_RE,
  CLIP_KEYFRAME_COUNT,
  CLIPS_MANIFEST_VERSION,
  clipKeyframeSrc,
  clipSrcFor,
  type ClipActorCheck,
  type ClipManifest,
  type ClipManifestEntry,
} from "@/modules/clips/capture/manifest";

// Reads/writes the filesystem — never cache, always run at request time.
export const dynamic = "force-dynamic";

/** Per-still ceiling — a 1280×720 PNG is ~0.5–2 MB; 8 MB flags a bad blob. */
const MAX_KEYFRAME_BYTES = 8 * 1024 * 1024;

const CLIP_VIEWS = ["exterior", "cockpit", "exterior+dashboard"] as const;
type ClipView = (typeof CLIP_VIEWS)[number];

/** 404 in production so the rig is unreachable in the shipped app. */
function productionBlocked(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

function clipsDir(): string {
  // Dev server runs from platform/ — public/ sits beside src/.
  return path.join(process.cwd(), "public", "clips");
}

function manifestPath(): string {
  return path.join(clipsDir(), "manifest.json");
}

/** Read the committed manifest; malformed/missing degrades to empty. */
function readManifest(): ClipManifest {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(manifestPath(), "utf8"));
    if (
      typeof raw === "object" &&
      raw !== null &&
      (raw as { version?: unknown }).version === CLIPS_MANIFEST_VERSION &&
      Array.isArray((raw as { clips?: unknown }).clips)
    ) {
      return raw as ClipManifest;
    }
  } catch {
    // fresh folder / malformed file — start clean below
  }
  return { version: CLIPS_MANIFEST_VERSION, clips: [] };
}

/** The rig's R1 checklist JSON → typed rows; null = malformed (fail loud). */
function parseActors(raw: string): ClipActorCheck[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: ClipActorCheck[] = [];
    for (const row of parsed) {
      if (typeof row !== "object" || row === null) return null;
      const { kind, label, present } = row as Record<string, unknown>;
      if (typeof kind !== "string" || kind.length === 0) return null;
      if (typeof label !== "string") return null;
      if (typeof present !== "boolean") return null;
      out.push({ kind, label, present });
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const blocked = productionBlocked();
  if (blocked) return blocked;
  return NextResponse.json(readManifest());
}

export async function POST(request: Request): Promise<NextResponse> {
  const blocked = productionBlocked();
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }

  const id = String(form.get("id") ?? "");
  const templateId = String(form.get("templateId") ?? "");
  const mistakeIndex = Number(form.get("mistakeIndex"));
  const tracePath = String(form.get("tracePath") ?? "");
  const titleBg = String(form.get("titleBg") ?? "");
  const durationSec = Number(form.get("durationSec"));
  const file = form.get("file");
  const viewRaw = form.get("view");
  const actorsRaw = form.get("actors");

  // The id names files on disk — the regex is the traversal guard.
  if (!CLIP_ID_RE.test(id) || id !== `${templateId}__m${mistakeIndex}`) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  if (
    !Number.isInteger(mistakeIndex) ||
    mistakeIndex < 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    !tracePath.startsWith("content/traces/") ||
    titleBg.length === 0
  ) {
    return NextResponse.json({ error: "bad_fields" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "bad_file" }, { status: 400 });
  }

  // View (doc 66 R4) — optional (v1 rigs never sent it), strict when sent.
  let view: ClipView | undefined;
  if (viewRaw !== null) {
    const v = String(viewRaw);
    if (!(CLIP_VIEWS as readonly string[]).includes(v)) {
      return NextResponse.json({ error: "bad_view" }, { status: 400 });
    }
    view = v as ClipView;
  }

  // Actor checklist (doc 66 R1) — optional, strict when sent (the rig is the
  // only writer; a malformed checklist is a rig bug that must surface).
  let actors: ClipActorCheck[] | undefined;
  if (actorsRaw !== null) {
    const parsed = parseActors(String(actorsRaw));
    if (parsed === null) {
      return NextResponse.json({ error: "bad_actors" }, { status: 400 });
    }
    actors = parsed;
  }

  // Recorded quality level (doc 66 R5 audit) — optional, strict when sent.
  let quality: ClipManifestEntry["quality"];
  const qualityRaw = form.get("quality");
  if (qualityRaw !== null) {
    const q = String(qualityRaw);
    if (q !== "low" && q !== "med" && q !== "high") {
      return NextResponse.json({ error: "bad_quality" }, { status: 400 });
    }
    quality = q;
  }

  // R1 MACHINE PRE-CHECK (doc 66 R0 — "Claude watches everything BEFORE the
  // founder"): the sink itself verifies the card. No plan card = no clip; a
  // card with required actors demands a checklist row proving each one
  // actually staged. A clip whose actors never appeared is FALSE by R1 —
  // rejecting it here makes silent success impossible even if a rig
  // regression stops checking client-side (the pilot-v2 zebra lesson: a
  // failed re-record left a stale, R0-blind entry looking "recorded").
  const plan = clipPlanForId(id);
  if (!plan) {
    return NextResponse.json({ error: "no_plan" }, { status: 400 });
  }
  for (const required of plan.requiredActors) {
    const row = actors?.find((a) => a.kind === required.kind);
    if (!row || !row.present) {
      return NextResponse.json(
        { error: "r1_actor_missing", kind: required.kind },
        { status: 422 },
      );
    }
  }

  // R0 keyframes k0..k4 — ALL FIVE, always. The v1-era "or none" leniency is
  // gone: a keyframe-less artifact cannot be vision-inspected, and doc 66 R0
  // forbids anything reaching the founder uninspected.
  const stills: Blob[] = [];
  for (let i = 0; i < CLIP_KEYFRAME_COUNT; i++) {
    const still = form.get(`k${i}`);
    if (still === null || !(still instanceof Blob) || still.size === 0 || still.size > MAX_KEYFRAME_BYTES) {
      return NextResponse.json({ error: "bad_keyframe", index: i }, { status: 400 });
    }
    stills.push(still);
  }

  const dir = clipsDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.promises.writeFile(path.join(dir, `${id}.webm`), bytes);
  const keyframes: string[] = [];
  for (let i = 0; i < stills.length; i++) {
    const stillBytes = Buffer.from(await stills[i].arrayBuffer());
    await fs.promises.writeFile(path.join(dir, `${id}.k${i}.png`), stillBytes);
    keyframes.push(clipKeyframeSrc(id, i));
  }

  const entry: ClipManifestEntry = {
    id,
    templateId,
    mistakeIndex,
    tracePath,
    src: clipSrcFor(id),
    durationSec: Math.round(durationSec * 100) / 100,
    recordedAt: new Date().toISOString(),
    titleBg,
    ...(keyframes.length > 0 ? { keyframes } : {}),
    ...(actors !== undefined ? { actors } : {}),
    ...(view !== undefined ? { view } : {}),
    ...(quality !== undefined ? { quality } : {}),
  };

  const manifest = readManifest();
  const clips = manifest.clips.filter((c) => c.id !== id);
  clips.push(entry);
  clips.sort((a, b) => (a.id < b.id ? -1 : 1));
  const next: ClipManifest = { version: CLIPS_MANIFEST_VERSION, clips };
  // Atomic-ish: write a sibling temp file, then rename over the manifest.
  const tmp = manifestPath() + ".tmp";
  await fs.promises.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.promises.rename(tmp, manifestPath());

  return NextResponse.json({
    ok: true,
    entry,
    sizeBytes: bytes.length,
    keyframeCount: keyframes.length,
  });
}
