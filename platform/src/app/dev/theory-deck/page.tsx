import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TheoryFocus } from "@/components/theory/TheoryFocus";
import { TopicDeck } from "@/components/theory/TopicDeck";
import type { SectionOverview, TopicOverview } from "@/modules/learning";

export const metadata: Metadata = {
  title: "Theory deck · вътрешно",
  robots: { index: false, follow: false },
};

/**
 * The theory instrument deck on FIXTURES — DEV route (404s in production).
 *
 * Doc 66 R0, look before you ship: /theory itself needs a signed-in student
 * with months of answer history behind them before it shows anything but
 * sixteen empty dials, so the states that actually matter — a mastered topic
 * that is also due, a topic started at 0%, the „всичко е усвоено" head — are
 * the ones a reviewer can never reach by hand. This route pins them side by
 * side so a change to the tile, the ring or the sheet can be EYEBALLED at
 * 390 x 844 and 1440 x 900 without a database.
 *
 * The fixtures below are the real content's topic titles and concept counts;
 * only the progress is invented.
 */
export default function TheoryDeckPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div
      data-surface="cluster"
      className="relative min-h-dvh bg-background text-foreground"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 haze" />
      <main className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 sm:gap-6">
          <TheoryFocus topics={TOPICS} sectionCount={54} questionsLabel="над 1000" />
          <TopicDeck
            topics={TOPICS}
            sectionsByTopic={SECTIONS}
            descriptions={DESCRIPTIONS}
          />
        </div>
      </main>
    </div>
  );
}

/** [order, id, slug, titleBg, conceptCount, seenConceptCount, avgMastery, dueCount] */
const RAW: [number, string, string, string, number, number, number, number][] = [
  [1, "t-basics", "osnovni-ponyatia", "Основни понятия и задължения", 10, 10, 0.92, 0],
  [2, "t-vehicle", "avtomobilat", "Автомобилът и подготовката за път", 11, 11, 0.81, 2],
  [3, "t-signs", "patni-znaci", "Пътни знаци", 14, 12, 0.63, 5],
  [4, "t-signals-markings", "svetofari", "Светофари, маркировка и регулировчик", 9, 6, 0.55, 3],
  [5, "t-priority", "predimstvo", "Предимство", 8, 5, 0.41, 4],
  [6, "t-junctions", "krastovishta", "Кръстовища, кръгови движения и жп прелези", 12, 5, 0.3, 2],
  [7, "t-speed", "skorost", "Скорост и дистанция", 8, 7, 0.78, 0],
  [8, "t-maneuvers", "manevri", "Маневри, ленти и изпреварване", 11, 4, 0.22, 3],
  [9, "t-vulnerable", "peshehodci", "Пешеходци и уязвими участници", 10, 2, 0.11, 1],
  [10, "t-roads", "magistrali", "Магистрали и извънградски пътища", 8, 0, 0, 0],
  [11, "t-parking", "parkirane", "Спиране, престой и паркиране", 9, 5, 0.48, 0],
  [12, "t-conditions", "noshtno", "Нощно шофиране и усложнени условия", 8, 0, 0, 0],
  [13, "t-fitness", "godnost", "Алкохол, умора и годност за шофиране", 7, 7, 0.88, 1],
  [14, "t-admin", "dokumenti", "Документи, нарушения и санкции", 10, 1, 0.05, 1],
  [15, "t-accidents", "ptp", "ПТП и първа помощ", 9, 0, 0, 0],
  [16, "t-eco-defensive", "eko", "Икономично и защитно шофиране", 6, 3, 0, 0],
];

const TOPICS: TopicOverview[] = RAW.map(
  ([order, topicId, slug, titleBg, conceptCount, seen, avgMastery, dueCount]) => ({
    topicId,
    slug,
    titleBg,
    order,
    conceptCount,
    seenConceptCount: seen,
    coverage: seen / conceptCount,
    avgMastery,
    dueCount,
  }),
);

const DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  TOPICS.map((t) => [
    t.topicId,
    `Какво покрива „${t.titleBg}": ключовите правила от закона, типичните грешки на изпита и защо всяко от тях е правило, а не навик.`,
  ]),
);

const SECTIONS: Record<string, SectionOverview[]> = Object.fromEntries(
  TOPICS.map((t) => [
    t.topicId,
    Array.from({ length: 3 }, (_, i) => ({
      sectionId: `${t.topicId}-s${i + 1}`,
      topicId: t.topicId,
      titleBg: `Раздел ${i + 1} — ${t.titleBg}`,
      conceptCount: 4,
      seenConceptCount: Math.min(4, Math.round(t.coverage * 4)),
      coverage: t.coverage,
      avgMastery: Math.max(0, t.avgMastery - i * 0.1),
      dueCount: i === 0 ? t.dueCount : 0,
      questionCount: 12 + i * 5,
    })),
  ]),
);
