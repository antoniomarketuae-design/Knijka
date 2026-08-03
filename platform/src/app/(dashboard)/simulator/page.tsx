import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  computeProgression,
  EXAM_LESSON,
  isExamUnlocked,
  isExamVariantId,
  LESSONS,
  POLIGON_LESSONS,
  SCENARIO_LEVEL_NAMES_BG,
  SCENARIO_TEMPLATES,
  scenarioLevelProgress,
  type LessonAttemptRow,
  type LessonSpec,
} from "@/modules/sim/lessons";
import {
  getSimSessionStore,
  type SimSessionDetailRow,
  type SimSessionListRow,
} from "@/modules/sim/lessons/store";
import { VIOLATIONS, type ViolationCode } from "@/modules/sim/rules";
import type {
  LessonEntryView,
  ScenarioCatalogEntry,
} from "@/components/sim/lesson-ui/types";
import { FeatureOffline } from "@/components/ui/FeatureOffline";
import { isFeatureDisabled } from "@/lib/features";
import { canDriveSimulator } from "./access";
import { SimulatorPaywall } from "./paywall";
import { resolveScenarioDeepLink } from "./scenarioDeepLink";
import { SimulatorClient } from "./simulator-client";
import type {
  SessionHistoryEntry,
  SessionHistoryMistake,
} from "./session-history";

export const metadata: Metadata = {
  title: "Симулатор · Книжка.AI",
  description:
    "Учебни маршрути по истинската улична мрежа на Студентски град с оценяване в реално време.",
};

/** How many recent sessions the „История на сесиите" list shows. */
const HISTORY_LIMIT = 12;

interface SimulatorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * /simulator v2 — lesson select + play shell. Server component: loads the
 * student's SimSessions, computes the unlock progression and hands plain
 * data to the client orchestrator. The 3D scene itself mounts later inside
 * the play shell's <SceneSlot/> (integrator's seam).
 *
 * A15 adds the session history: the same store provides detailed recent rows
 * (stored debrief + canonical event log) which are folded into serializable
 * history entries here, server-side.
 *
 * THEO-2: `?scenario=<templateId>&level=<n>` deep-links a scenario drill (the
 * theory why-panel's „Опитай в симулатора" seam) — resolved against the same
 * server-computed progression, so the link can never bypass the soft gate.
 *
 * C-3: the simulator is what the „Изпит + Симулатор" pack sells, so the very
 * first thing after authentication is the entitlement gate — before the store
 * is touched and before a single lesson spec is serialized to the client.
 */
export default async function SimulatorPage({ searchParams }: SimulatorPageProps) {
  const user = await requireUser();

  // The kill switch is asked BEFORE the entitlement gate, and that order is the
  // whole point: canDriveSimulator() also returns false when the switch is on,
  // so without this line a student who PAID €21.99 would be shown the „купи
  // пакет" paywall for something we switched off ourselves. Same guard, two
  // different sentences (src/lib/features.ts).
  if (isFeatureDisabled("simulator")) return <FeatureOffline feature="simulator" />;

  if (!(await canDriveSimulator(user))) {
    // Sizes only, never content — see paywall.tsx.
    return (
      <SimulatorPaywall
        lessonCount={[...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON].length}
        scenarioCount={SCENARIO_TEMPLATES.length}
      />
    );
  }

  let attempts: LessonAttemptRow[] = [];
  let history: SessionHistoryEntry[] = [];
  let sessionRows: SimSessionListRow[] = [];
  try {
    const store = getSimSessionStore();
    sessionRows = await store.listSessions(user.id);
    attempts = sessionRows
      .filter((r) => r.score !== null)
      .map((r) => ({ lessonId: r.lessonId, passed: r.passed, score: r.score as number }));
    history = buildHistoryEntries(await store.listRecentSessions(user.id, HISTORY_LIMIT));
  } catch (err) {
    // No DB (fresh checkout / offline dev): the select screen still renders
    // with default progression — only L0 open, nothing persisted, no history.
    console.warn("simulator: listSessions failed, using empty progression", err);
  }

  // Admin (server-resolved role, never client input): every gate below takes
  // the flag explicitly, so the founder/test account sees the whole catalog
  // unlocked and the save action agrees (no LEVEL_LOCKED refusal).
  const gate = { unlockAll: user.isAdmin };

  // S1 „Сценарии" catalog (doc 76 §8): per-template level progression from
  // the SAME persisted rows — the pure fold the save action's soft gate runs,
  // so the picker and the server always agree on what is open.
  const scenarioRows = sessionRows.map((r) => ({
    lessonId: r.lessonId,
    rubricStars: r.rubricStars,
  }));
  const scenarios: ScenarioCatalogEntry[] = SCENARIO_TEMPLATES.map((spec) => ({
    templateId: spec.id,
    titleBg: spec.titleBg,
    objectiveBg: spec.objectiveBg,
    family: spec.family,
    tagsBg: [...spec.tagsBg],
    levels: scenarioLevelProgress(spec, scenarioRows, gate).map((l) => ({
      level: l.level,
      unlocked: l.unlocked,
      attempts: l.attempts,
      bestStars: l.bestStars,
    })),
  }));

  // Out-of-curriculum entries (exam + полигон) share one fold: gated by the
  // spec's own unlockAfterLessonId (isExamUnlocked — absent field = always
  // open), stats from the same persisted attempts as the lesson cards.
  const entryFor = (spec: LessonSpec): LessonEntryView => {
    const specAttempts = attempts.filter((a) => a.lessonId === spec.id);
    return {
      lesson: spec,
      unlocked: isExamUnlocked(spec, attempts, gate),
      passed: specAttempts.some((a) => a.passed),
      attempts: specAttempts.length,
      bestScore: specAttempts.reduce<number | null>(
        (best, a) => (best === null ? a.score : Math.min(best, a.score)),
        null,
      ),
    };
  };

  // Curriculum progression + the полигон cards, merged into ONE grid sorted
  // by order (полигон orders 0.5 / 1.5 slot the cards after L0 / L1 — the
  // площадка comes before city traffic, as in a real driving school).
  const entries: LessonEntryView[] = [
    ...computeProgression(LESSONS, attempts, gate).map((e) => ({
      lesson: e.lesson,
      unlocked: e.unlocked,
      passed: e.passed,
      attempts: e.attempts,
      bestScore: e.bestScore,
    })),
    ...POLIGON_LESSONS.map(entryFor),
  ].sort((a, b) => a.lesson.order - b.lesson.order);

  // A13: the exam entry — its own gated card below the grid. B1b: exam-bank
  // variant sessions persist under their variant ids (EX-…), so the card's
  // attempt/pass/best stats aggregate the fixed route AND every variant.
  const examAttempts = attempts.filter(
    (a) => a.lessonId === EXAM_LESSON.id || isExamVariantId(a.lessonId),
  );
  const examEntry: LessonEntryView = {
    lesson: EXAM_LESSON,
    unlocked: isExamUnlocked(EXAM_LESSON, attempts, gate),
    passed: examAttempts.some((a) => a.passed),
    attempts: examAttempts.length,
    bestScore: examAttempts.reduce<number | null>(
      (best, a) => (best === null ? a.score : Math.min(best, a.score)),
      null,
    ),
  };

  // THEO-2 drill deep link — resolved against the JUST-computed progression.
  const params = await searchParams;
  const deepLink = resolveScenarioDeepLink(
    params.scenario,
    params.level,
    scenarios,
    params.mistake,
  );

  return (
    <SimulatorClient
      entries={entries}
      examEntry={examEntry}
      history={history}
      scenarios={scenarios}
      deepLink={deepLink}
    />
  );
}

// ---------------------------------------------------------------------------
// A15 history fold (server-side)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<SessionHistoryMistake["severityClass"], number> = {
  opasna: 2,
  osnovna: 1,
  vtorostepenna: 0,
};

/**
 * Stored SimSession rows → plain history entries. The stored `ruleEvents` are
 * kept opaque by the store's defensive parse, so the ONLY thing read from a
 * stored event is its (kind, code) — severity, points, titles, law refs and
 * the A15 corrective always come rebuilt from the violation catalog, exactly
 * like the wire path: a tampered/stale payload can list events, never
 * re-price or re-title them. Unknown codes are skipped, not trusted.
 */
function buildHistoryEntries(rows: SimSessionDetailRow[]): SessionHistoryEntry[] {
  const titleByLessonId = new Map(
    [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON].map((l) => [l.id, l.titleBg]),
  );
  // S1: scenario sessions persist under <templateId>@L<n> — title them like
  // the compiled lesson does (compile.ts), per authored level.
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      titleByLessonId.set(
        `${spec.id}@L${rung.level}`,
        `${spec.titleBg} · Ниво ${rung.level} — ${SCENARIO_LEVEL_NAMES_BG[rung.level]}`,
      );
    }
  }

  return rows.map((r) => {
    const ev = r.events;

    const groups = new Map<string, SessionHistoryMistake>();
    if (ev !== null) {
      for (const raw of ev.ruleEvents) {
        if (typeof raw !== "object" || raw === null) continue;
        const e = raw as { kind?: unknown; code?: unknown };
        if (e.kind !== "violation" || typeof e.code !== "string") continue;
        if (!(e.code in VIOLATIONS)) continue;
        const spec = VIOLATIONS[e.code as ViolationCode];
        const g = groups.get(e.code);
        if (g) {
          g.count += 1;
        } else {
          groups.set(e.code, {
            titleBg: spec.titleBg,
            lawRef: spec.lawRef,
            severityClass: spec.severityClass,
            points: spec.points,
            count: 1,
            correctiveBg: spec.correctiveBg,
          });
        }
      }
    }
    const mistakes = [...groups.values()].sort((a, b) => {
      const rank = SEVERITY_RANK[b.severityClass] - SEVERITY_RANK[a.severityClass];
      return rank !== 0 ? rank : b.points * b.count - a.points * a.count;
    });

    return {
      id: r.id,
      // B1b: exam-bank sessions carry their variant code as the lessonId —
      // title them like the play shell does (the code IS the replay handle).
      lessonTitleBg:
        titleByLessonId.get(r.lessonId) ??
        (isExamVariantId(r.lessonId) ? `Изпитен вариант ${r.lessonId}` : r.lessonId),
      finishedAtIso: r.finishedAt !== null ? r.finishedAt.toISOString() : null,
      passed: ev?.passed ?? false,
      aborted: ev?.aborted ?? false,
      terminated: ev?.terminated ?? false,
      score: r.score,
      effectiveScore: ev?.effectiveScore ?? null,
      mistakeCount: mistakes.reduce((n, m) => n + m.count, 0),
      // Pre-A15 rows never recorded the stat — null (unknown), not zero.
      nearMissCount: ev?.nearMisses !== undefined ? ev.nearMisses.length : null,
      topMistakeTitleBg: mistakes.length > 0 ? mistakes[0].titleBg : null,
      mistakes,
      debrief: r.debrief,
      payloadUnreadable: ev === null,
    };
  });
}
