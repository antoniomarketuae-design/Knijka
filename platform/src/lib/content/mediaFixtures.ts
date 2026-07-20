/**
 * THEO-1 media-question fixtures — one per data-driven media kind. TEST
 * WIRING ONLY, never shipped content: agent AUTHOR writes the real bank items
 * (original wording, retrieved lawRefs, status "draft" until founder review).
 */
import type { Question } from "./types";

/** Sign-identification question: sign-face media on the stem AND the options. */
export function makeSignMediaQuestion(
  id = "q-media-sign",
  conceptId = "c-root",
): Question {
  return {
    id,
    conceptIds: [conceptId],
    type: "single",
    points: 1,
    textBg: "Кой от показаните знаци те задължава да спреш напълно?",
    options: [
      { id: "a", textBg: "Знак 1", correct: true, media: { kind: "sign", signRef: "Б2" } },
      { id: "b", textBg: "Знак 2", correct: false },
      { id: "c", textBg: "Знак 3", correct: false },
    ],
    explanationBg: "Осмоъгълният знак Б2 изисква пълно спиране на стоп-линията.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
    media: { kind: "sign", signRef: "Б2" },
    status: "draft",
  };
}

/** Scene-still question over a committed district map. */
export function makeSceneStillQuestion(
  id = "q-media-scene",
  conceptId = "c-root",
  districtId = "tj-stop-v1",
): Question {
  return {
    id,
    conceptIds: [conceptId],
    type: "single",
    points: 2,
    textBg: "Кой преминава първи в показаната ситуация?",
    options: [
      { id: "a", textBg: "Твоят автомобил", correct: false },
      { id: "b", textBg: "Автомобилът отдясно", correct: true },
      { id: "c", textBg: "Пешеходецът", correct: false },
    ],
    explanationBg: "При равнозначно кръстовище предимство има идващият отдясно.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
    media: {
      kind: "sceneStill",
      districtId,
      focus: { x: 0, y: 0, zoomM: 60 },
      poses: [
        { kind: "car", x: -4, y: -12, headingDeg: 0, variant: "ego" },
        { kind: "car", x: 14, y: 4, headingDeg: 270 },
        { kind: "ped", x: 6, y: 8, headingDeg: 180 },
      ],
      marks: [{ kind: "danger", x: 2, y: 2 }],
    },
    status: "draft",
  };
}
