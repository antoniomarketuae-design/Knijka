/**
 * A SHIPPED CLIP NEVER SITS BESIDE TEXT IT CONTRADICTS (catalogue-demo-curvature:
 * dae908c7, lane curvpark2 round 2, integrator ruling CP2-7, 2026-11-06).
 *
 * A mistake clip is a video recorded from a committed mistake demo. When the
 * demo is re-authored, the video still shows the OLD drive, under the OLD
 * title, beside the lesson's NEW explanation. The clip modules have no
 * retired / stale marker (capture/manifest.ts `ClipManifestEntry`), so such a
 * clip is dropped from public/clips/manifest.json; the mistake then resolves
 * to NO clip — `clipForTracePath` → null — which is the branch on which
 * components/theory/MistakeMedia.tsx renders the 3D replay of the committed
 * trace itself (`<MistakeReplay tracePath=…>`), the drive the text describes.
 * Re-capturing them is owed at integration (O5).
 *
 *   sc-park-perp-rev__m0   «Твърде широк подход» (recorded 2026-07-21): the demo
 *                          was re-cast as the too-CLOSE setup (ruling R2) and is
 *                          now titled «Твърде близо до реда».
 *   sc-park-parallel__m0   the far-from-lead demo re-authored on the car's circle
 *                          (its fault moved 38.88 → 45.4 s in round 1, and again
 *                          with the round-2 approach); the video shows the
 *                          polyline drive.
 *
 * And the class, for every clip still shipped: its title is the title its
 * template's mistake shows today, so a re-titled demo cannot keep a video
 * that announces the old one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scenarioById } from "@/modules/sim/lessons";
import { clipForTracePath, parseClipManifest } from "./view/clipManifest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(HERE, "../../../public/clips/manifest.json");
const clips = parseClipManifest(JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown) ?? [];

const RETIRED: ReadonlyArray<{ id: string; templateId: string; mistakeIndex: number }> = [
  { id: "sc-park-perp-rev__m0", templateId: "sc-park-perp-rev", mistakeIndex: 0 },
  { id: "sc-park-parallel__m0", templateId: "sc-park-parallel", mistakeIndex: 0 },
];

describe("retired clips — a re-recorded demo's old video is not shipped beside its new text (CP2-7)", () => {
  it("the manifest parses and still ships clips", () => {
    expect(clips.length).toBeGreaterThan(40);
  });

  for (const r of RETIRED) {
    it(`${r.id} is retired: not in the manifest, and its mistake resolves to no clip — the 3D replay of the committed trace`, () => {
      expect(clips.map((c) => c.id)).not.toContain(r.id);
      const m = scenarioById(r.templateId)?.mistakes[r.mistakeIndex];
      expect(m, r.id).toBeDefined();
      expect(clipForTracePath(clips, m!.traceRef.path), r.id).toBeNull();
    });
  }

  /**
   * Found by this guard on 1feba3a + curvpark2, OUTSIDE this lane's family and
   * reported, not repaired (each is its own lesson's re-capture or re-title,
   * owed to the integrator): listed by exact pair, so a fix that leaves an
   * entry behind, or a new drift, is a red.
   */
  const KNOWN_TITLE_DRIFT: Record<string, string> = {
    "sc-pe-parked-row-scan__m0": "clip «50 покрай редицата — детето е невидимо до последно» vs lesson «Детето е ударено — 50 покрай редица, която го крие»",
    "sc-speed-creep__m0": "clip «Носене с потока по подхода» vs lesson «Пълзене в зоната 30»",
  };

  it("every clip still shipped carries the title its template's mistake shows", () => {
    const off: string[] = [];
    const known: string[] = [];
    for (const c of clips) {
      const m = scenarioById(c.templateId)?.mistakes[c.mistakeIndex];
      if (!m) {
        off.push(`${c.id}: no mistake ${c.mistakeIndex} on ${c.templateId}`);
        continue;
      }
      if (m.titleBg === c.titleBg) continue;
      const line = `clip «${c.titleBg}» vs lesson «${m.titleBg}»`;
      if (KNOWN_TITLE_DRIFT[c.id] === line) known.push(c.id);
      else off.push(`${c.id}: ${line}`);
    }
    expect(off).toEqual([]);
    expect(known.sort(), "a known drift that is gone must leave the list").toEqual(Object.keys(KNOWN_TITLE_DRIFT).sort());
  });
});
