// R0 certification aid: tile each clip's five keyframes (start · f−2 · FAULT ·
// f+2 · end) into one horizontal strip so Claude vision-inspects a whole clip
// in ONE Read instead of five. Also emits a master grid of every clip's FAULT
// frame for a fast first-pass triage.
//
//   node contact-sheet.mjs [clipId]     one clip → scratch/<id>.strip.png
//   node contact-sheet.mjs --all        every manifest clip + faults-grid.png
//
// Output dir: tools/clips/headless/sheets/

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const CLIPS_DIR = join(REPO, "platform/public/clips");
const MANIFEST = join(CLIPS_DIR, "manifest.json");
const OUT = join(__dirname, "sheets");
mkdirSync(OUT, { recursive: true });

function ffmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  const w = "C:/Users/Ljh/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe";
  if (existsSync(w)) return w;
  throw new Error("ffmpeg not found");
}
const FF = ffmpeg();

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// One clip → a labelled 5-up strip (each frame scaled to 380px wide).
function strip(clip) {
  const frames = (clip.keyframes ?? []).map((u) => join(CLIPS_DIR, u.replace("/clips/", "")));
  if (frames.length < 5 || frames.some((f) => !existsSync(f))) {
    console.error(`  ! ${clip.id}: missing keyframes, skipped`);
    return false;
  }
  const out = join(OUT, `${clip.id}.strip.png`);
  const labels = ["approach", "pre-fault", "FAULT", "consequence", "end"];
  const inputs = frames.flatMap((f) => ["-i", f]);
  // Scale each to 380w, draw its label, then hstack the five.
  const per = frames
    .map(
      (_, i) =>
        `[${i}:v]scale=380:-1,drawtext=text='${labels[i]}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`,
    )
    .join(";");
  const stack = `${frames.map((_, i) => `[v${i}]`).join("")}hstack=inputs=5[out]`;
  const r = spawnSync(
    FF,
    ["-y", ...inputs, "-filter_complex", `${per};${stack}`, "-map", "[out]", "-frames:v", "1", "-update", "1", out],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (r.status !== 0) { console.error(`  ! ${clip.id}: ffmpeg failed`); return false; }
  console.log(`  ✓ ${out}`);
  return true;
}

// Every clip's FAULT frame in a grid → fast triage.
function faultGrid(clips) {
  const faults = clips
    .map((c) => (c.keyframes && c.keyframes[2] ? join(CLIPS_DIR, c.keyframes[2].replace("/clips/", "")) : null))
    .filter((f) => f && existsSync(f));
  if (faults.length === 0) return;
  const cols = 4;
  const inputs = faults.flatMap((f) => ["-i", f]);
  const scaled = faults.map((_, i) => `[${i}:v]scale=320:-1[v${i}]`).join(";");
  const grid = `${faults.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${faults.length}:layout=${gridLayout(faults.length, cols)}[out]`;
  const out = join(OUT, "faults-grid.png");
  const r = spawnSync(FF, ["-y", ...inputs, "-filter_complex", `${scaled};${grid}`, "-map", "[out]", out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (r.status === 0) console.log(`  ✓ ${out}`);
  else console.error("  ! faults-grid failed");
}

// xstack layout string for N tiles in `cols` columns (assumes 320×180 tiles).
function gridLayout(n, cols) {
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    cells.push(`${c === 0 ? "0" : `w0*${c}`}_${r === 0 ? "0" : `h0*${r}`}`);
  }
  return cells.join("|");
}

const arg = process.argv[2];
if (arg === "--all" || !arg) {
  console.log(`contact sheets for ${manifest.clips.length} clips…`);
  for (const c of manifest.clips) strip(c);
  faultGrid(manifest.clips);
} else {
  const c = manifest.clips.find((x) => x.id === arg);
  if (!c) { console.error(`clip ${arg} not in manifest`); process.exit(1); }
  strip(c);
}
