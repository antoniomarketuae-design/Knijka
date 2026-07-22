/**
 * halfAData — SERVER-ONLY loader for the verdict board's Half A tab: every
 * theory question that carries a picture (sign face / scene still). These are
 * the ~29 „картинков" questions whose why-panel shows the media + the correct
 * answer (0 new artwork — the 64-sign SVG catalog + procedural scene stills
 * already cover them). The board lets the founder verdict each rendered card.
 *
 * Reads the committed content bank directly (resolveContentDir) — this module
 * touches `fs`, so it must only be imported by the server page. The client
 * imports the `HalfAItem` TYPE only (erased at compile).
 */

import fs from "node:fs";
import path from "node:path";
import { resolveContentDir } from "@/lib/content/loader";
import type { QuestionMedia } from "@/lib/content/types";

export interface HalfAOption {
  id: string;
  textBg: string;
  correct: boolean;
}

export interface HalfAItem {
  id: string;
  /** Source file slug (e.g. "patni-znatsi") — a coarse grouping chip. */
  group: string;
  type: string;
  textBg: string;
  media: QuestionMedia;
  options: HalfAOption[];
  /** Whether the media assignment is still awaiting founder review. */
  needsReview: boolean;
}

interface RawOption {
  id?: unknown;
  textBg?: unknown;
  correct?: unknown;
}
interface RawQuestion {
  id?: unknown;
  type?: unknown;
  textBg?: unknown;
  media?: unknown;
  status?: unknown;
  reviewNote?: unknown;
  options?: unknown;
}

function asOptions(raw: unknown): HalfAOption[] {
  if (!Array.isArray(raw)) return [];
  const out: HalfAOption[] = [];
  for (const o of raw as RawOption[]) {
    if (typeof o?.id !== "string" || typeof o?.textBg !== "string") continue;
    out.push({ id: o.id, textBg: o.textBg, correct: o.correct === true });
  }
  return out;
}

/** Every picture-bearing question across the bank, in file order. */
export function loadHalfAItems(): HalfAItem[] {
  const dir = path.join(resolveContentDir(), "questions");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const out: HalfAItem[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : ((parsed as { questions?: unknown; items?: unknown })?.questions ??
        (parsed as { items?: unknown })?.items ??
        []);
    if (!Array.isArray(arr)) continue;

    const group = file.slice(0, -".json".length);
    for (const q of arr as RawQuestion[]) {
      const media = q?.media;
      if (!media || typeof media !== "object" || !("kind" in media)) continue;
      if (typeof q.id !== "string" || typeof q.textBg !== "string") continue;
      const note = typeof q.reviewNote === "string" ? q.reviewNote : "";
      out.push({
        id: q.id,
        group,
        type: typeof q.type === "string" ? q.type : "single",
        textBg: q.textBg,
        media: media as QuestionMedia,
        options: asOptions(q.options),
        needsReview:
          q.status === "draft" || /NEEDS-FOUNDER-REVIEW/i.test(note),
      });
    }
  }
  return out;
}
