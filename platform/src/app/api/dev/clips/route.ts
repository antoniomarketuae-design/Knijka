/**
 * DEV-ONLY clip sink for the /dev/clip-capture rig (the why-panel video
 * pilot):
 *
 *   GET  /api/dev/clips → the current public/clips/manifest.json
 *   POST /api/dev/clips → multipart form { id, templateId, mistakeIndex,
 *        tracePath, titleBg, durationSec, file } — writes
 *        public/clips/<id>.webm and UPSERTS the manifest entry.
 *
 * 404 in production (the /api/review convention) — the capture rig is a
 * founder/dev tool; nothing here ships to students. Idempotent by design:
 * re-recording a clip overwrites the binary and replaces the entry, so the
 * main session re-runs stragglers freely.
 *
 * Contract: src/lib/clips/manifest.ts (writer side) ↔
 * src/components/theory/clipManifest.ts (reader side).
 */

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  CLIP_ID_RE,
  CLIPS_MANIFEST_VERSION,
  clipSrcFor,
  type ClipManifest,
  type ClipManifestEntry,
} from "@/lib/clips/manifest";

// Reads/writes the filesystem — never cache, always run at request time.
export const dynamic = "force-dynamic";

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

  // The id names a file on disk — the regex is the traversal guard.
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

  const dir = clipsDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.promises.writeFile(path.join(dir, `${id}.webm`), bytes);

  const entry: ClipManifestEntry = {
    id,
    templateId,
    mistakeIndex,
    tracePath,
    src: clipSrcFor(id),
    durationSec: Math.round(durationSec * 100) / 100,
    recordedAt: new Date().toISOString(),
    titleBg,
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

  return NextResponse.json({ ok: true, entry, sizeBytes: bytes.length });
}
