/**
 * „КОЙ ОТ ПОКАЗАНИТЕ ЗНАЦИ…" — THE COMPARISON SHAPE, GATED AT THE BANK.
 *
 * A question that says „показаните знаци" promises the student four pictures.
 * Where those pictures live is the thing everybody keeps getting wrong:
 *
 *   they are on `options[i].media`, ONE PER OPTION, and `question.media`
 *   is null — correctly, because there is no single picture to draw above
 *   the text (content/SCHEMA.md, „the comparison shape").
 *
 * That has now been misread twice, in opposite directions, at real cost:
 *
 *   1. The SIMULATOR dropped the option media at a module boundary and served
 *      the founder four captions reading „Знак 1 / Знак 2 / Знак 3 / Знак 4"
 *      with no signs. Genuinely unanswerable. Gated by
 *      modules/sim/lessons/__tests__/micro-quiz-media.test.ts.
 *   2. The law-vs-bank AUDIT read `question.media`, saw `null`, and filed all
 *      nine of these as „literally unanswerable" in its fails-an-exam tier
 *      (docs/education/90 §4.1) — nine answerable questions in the most severe
 *      tier of the ledger, which is exactly the kind of false positive that
 *      makes a real ledger stop being believed. The nine were rendered and
 *      looked at: four distinct sign faces each, 96 CSS px.
 *
 * So this file asserts the invariant from the CONTENT side, in both
 * directions, so neither misreading can come back silently:
 *
 *   - a question that promises pictures must carry one per option, and
 *   - every sign code it names must resolve to real committed artwork.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContentDir } from "./loader";

interface RawOption {
  id?: unknown;
  textBg?: unknown;
  media?: { kind?: unknown; signRef?: unknown } | null;
}
interface RawQuestion {
  id?: unknown;
  textBg?: unknown;
  media?: unknown;
  options?: RawOption[];
}

const CONTENT = resolveContentDir();

function bank(): { file: string; q: RawQuestion }[] {
  const dir = path.join(CONTENT, "questions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) => {
      const arr = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as RawQuestion[];
      return arr.map((q) => ({ file, q }));
    });
}

/** The exact promise: the question refers the student to shown signs. */
const PROMISES_PICTURES = /показани(те|я)\s+знаци|от\s+показаните/i;

const signRefsOf = (q: RawQuestion): string[] =>
  (q.options ?? [])
    .map((o) => o?.media)
    .filter((m): m is { kind: string; signRef: string } =>
      !!m && typeof m === "object" && m.kind === "sign" && typeof m.signRef === "string")
    .map((m) => m.signRef);

describe("„Кой от показаните знаци…“ — the comparison shape", () => {
  it("every question that promises shown signs carries one sign per option", () => {
    const broken: string[] = [];
    for (const { file, q } of bank()) {
      if (typeof q.textBg !== "string" || !PROMISES_PICTURES.test(q.textBg)) continue;
      const options = q.options ?? [];
      const refs = signRefsOf(q);
      if (refs.length !== options.length) {
        broken.push(
          `${file} ${String(q.id)}: text promises shown signs but ${refs.length}/${options.length} options carry sign media`,
        );
      }
    }
    expect(
      broken,
      "A question saying „показаните знаци“ with bare „Знак 1..4“ options and no " +
        "option media is unanswerable. Put the artwork on options[].media — NOT on " +
        "question.media, which stays null for this shape.",
    ).toEqual([]);
  });

  it("every sign code used by a comparison question resolves to committed artwork", () => {
    const signs = JSON.parse(
      readFileSync(path.join(CONTENT, "signs", "signs.json"), "utf8"),
    ) as { code: string; svgFile: string }[];
    const byCode = new Map(signs.map((s) => [s.code, s]));

    const missing: string[] = [];
    for (const { file, q } of bank()) {
      for (const ref of signRefsOf(q)) {
        const sign = byCode.get(ref);
        if (!sign) {
          missing.push(`${file} ${String(q.id)}: signRef "${ref}" is not a code in signs.json`);
          continue;
        }
        if (!existsSync(path.join(CONTENT, sign.svgFile))) {
          missing.push(`${file} ${String(q.id)}: "${ref}" has no artwork at ${sign.svgFile}`);
        }
      }
    }
    expect(missing, "an option that renders a broken image is an unanswerable option").toEqual([]);
  });

  it("a comparison question shows four DISTINCT signs", () => {
    // Two options drawing the same face cannot both be judged, and the student
    // has no way to tell the examiner which one they meant.
    const dupes: string[] = [];
    for (const { file, q } of bank()) {
      const refs = signRefsOf(q);
      if (refs.length < 2) continue;
      if (new Set(refs).size !== refs.length) {
        dupes.push(`${file} ${String(q.id)}: repeats a sign — ${refs.join(", ")}`);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("the option label never names the sign it is showing", () => {
    // `textBg` is the accessible name and the screen-reader label. On an
    // identification question it must stay neutral („Знак 1"), or the answer
    // leaks to exactly the users who cannot see the picture.
    const leaks: string[] = [];
    for (const { file, q } of bank()) {
      for (const o of q.options ?? []) {
        const ref = o?.media?.signRef;
        if (typeof ref !== "string" || typeof o.textBg !== "string") continue;
        if (o.textBg.includes(ref)) {
          leaks.push(`${file} ${String(q.id)}/${String(o.id)}: label "${o.textBg}" names ${ref}`);
        }
      }
    }
    expect(leaks, "use „Знак 1“…„Знак 4“ — the picture is the question").toEqual([]);
  });
});
