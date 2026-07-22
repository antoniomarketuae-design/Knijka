"use client";

/**
 * THEO-1 media renderers, side by side, over the fixture shapes the tests
 * use (lib/content/mediaFixtures). Pure eyeball harness — no session, no
 * grading, nothing here ships to students.
 */

import { makeSceneStillQuestion, makeSignMediaQuestion } from "@/lib/content/mediaFixtures";
import { QuestionMediaView, SignFace } from "@/components/theory/QuestionMedia";
import { WhyPanel } from "@/components/theory/WhyPanel";
import { buildWhyPanelModel } from "@/components/theory/whyPanelModel";

const signQuestion = makeSignMediaQuestion();
const sceneQuestion = makeSceneStillQuestion();

const GRID_SIGNS = ["Б1", "Б2", "В24", "А12"];

// THEO Half A: the why-panel picture card over the three data-driven shapes.
// sim:null is the Half A gate (no scenario reel), so buildWhyPanelModel emits
// the picture card the founder eyeballs here.
const signMeaningModel = buildWhyPanelModel({
  correct: false,
  explanationBg:
    "Белият кръг с коси черни ленти отменя всички забрани, въведени по-рано с пътни знаци.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 6" }],
  sim: null,
  media: { kind: "sign", signRef: "В34" },
});

const whichSignModel = buildWhyPanelModel({
  correct: false,
  explanationBg: "Осмоъгълникът е единственият знак с тази форма — Б2 „Спри!“.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
  sim: null,
  correctOptionIds: ["b"],
  options: [
    { id: "a", textBg: "Знак Б1", media: { kind: "sign", signRef: "Б1" } },
    { id: "b", textBg: "Спри! Пропусни движещите се по пътя с предимство", media: { kind: "sign", signRef: "Б2" } },
    { id: "c", textBg: "Знак В24", media: { kind: "sign", signRef: "В24" } },
  ],
});

const prioritySceneModel = buildWhyPanelModel({
  correct: true,
  explanationBg:
    "На равнозначно кръстовище пропускаш идващия отдясно — маркиран е конфликтната точка.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
  sim: null,
  media: sceneQuestion.media,
});

export function MediaDemoClient() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header>
        <h1 className="font-display text-2xl font-black">THEO-1 media demo</h1>
        <p className="mt-1 text-sm text-muted">
          Dev-only: sign face · sign-option grid · scene still (tj-stop-v1).
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="hud-label">1 · Question media: sign</h2>
        <QuestionMediaView media={signQuestion.media} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="hud-label">2 · Sign-option picture grid (static)</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {GRID_SIGNS.map((code, i) => (
            <li key={code}>
              <div className="flex h-full flex-col items-center gap-2 rounded-xl border border-border bg-surface-2/50 p-3">
                <span className="flex h-6 w-6 items-center justify-center self-start rounded-md border border-hair bg-surface font-mono text-[11px] font-bold text-muted">
                  {i + 1}
                </span>
                <SignFace signRef={code} altBg={`Знак ${i + 1}`} className="h-20 w-20" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="hud-label">3 · Question media: scene still</h2>
        <QuestionMediaView media={sceneQuestion.media} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="hud-label">
          4 · Why-panel picture card (THEO Half A · sim:null)
        </h2>
        <p className="text-xs text-muted">
          The wrong-answer panel now leads with the sign face / diagram + the
          stored explanation. Left→right: „what sign is this“ (sign face),
          „which sign“ grid (correct sign spotlighted), priority scene.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <WhyPanel model={signMeaningModel} />
          <WhyPanel model={whichSignModel} />
          <WhyPanel model={prioritySceneModel} />
        </div>
      </section>
    </main>
  );
}
