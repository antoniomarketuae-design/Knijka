/**
 * coverageData — SERVER-ONLY: the "does every visualizable question have a 3D
 * reel?" audit that powers the board's Coverage tab. For each why-panel event
 * (the 45 mistake-types the 585 behavior questions map to) it runs the REAL
 * resolver (resolveWhyPanel) on a representative question and checks whether
 * the resolved template has a rendered clip in the manifest — i.e. the learner
 * sees a 3D reel, not the 2D canvas fallback. This is the metric that was
 * silently 40% before the 2026-07-22 wiring pass; the tab keeps it honest.
 *
 * Touches fs + the learning barrel → server page only; the client imports the
 * CoverageRow TYPE (erased) and receives the computed rows as a prop.
 */

import fs from "node:fs";
import path from "node:path";
import "@/lib/content/loader";
import { QUESTION_EVENT_TYPE } from "@/modules/learning/whyPanelMap.generated";
import { resolveWhyPanel } from "@/modules/learning/whyPanel";

export interface CoverageRow {
  /** ev-* event id (the mistake-type). */
  event: string;
  /** How many behavior questions map to this event. */
  questionCount: number;
  /** The scenario the resolver picks for it, or null (text-only). */
  templateId: string | null;
  /** The resolved mistake's title (bg), for context. */
  mistakeTitleBg: string | null;
  /** True = a rendered clip exists → 3D reel; false = 2D canvas fallback. */
  has3dReel: boolean;
}

export interface CoverageSummary {
  rows: CoverageRow[];
  totalEvents: number;
  totalQuestions: number;
  reelQuestions: number;
  fallbackQuestions: number;
}

function clipTemplateSet(): Set<string> {
  const p = path.join(process.cwd(), "public", "clips", "manifest.json");
  try {
    const m = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      clips?: Array<{ templateId?: string }>;
    };
    return new Set((m.clips ?? []).map((c) => c.templateId ?? "").filter(Boolean));
  } catch {
    return new Set();
  }
}

export function loadCoverage(): CoverageSummary {
  const count: Record<string, number> = {};
  const rep: Record<string, string> = {};
  for (const [qid, ev] of Object.entries(QUESTION_EVENT_TYPE)) {
    count[ev] = (count[ev] ?? 0) + 1;
    if (!(ev in rep)) rep[ev] = qid;
  }
  const clips = clipTemplateSet();

  const rows: CoverageRow[] = [];
  let reelQuestions = 0;
  let fallbackQuestions = 0;
  for (const ev of Object.keys(count).sort((a, b) => count[b] - count[a])) {
    let templateId: string | null = null;
    let mistakeTitleBg: string | null = null;
    try {
      const payload = resolveWhyPanel(rep[ev]);
      templateId = payload?.sim?.templateId ?? null;
      mistakeTitleBg = payload?.sim?.mistake.titleBg ?? null;
    } catch {
      // resolver failure degrades to "no reel" — visible as a fallback row.
    }
    const has3dReel = templateId !== null && clips.has(templateId);
    if (has3dReel) reelQuestions += count[ev];
    else fallbackQuestions += count[ev];
    rows.push({ event: ev, questionCount: count[ev], templateId, mistakeTitleBg, has3dReel });
  }

  return {
    rows,
    totalEvents: rows.length,
    totalQuestions: reelQuestions + fallbackQuestions,
    reelQuestions,
    fallbackQuestions,
  };
}
