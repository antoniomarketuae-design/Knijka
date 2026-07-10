import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  computeProgression,
  LESSONS,
  type LessonAttemptRow,
} from "@/modules/sim/lessons";
import {
  getSimSessionStore,
  type SimSessionDetailRow,
} from "@/modules/sim/lessons/store";
import { VIOLATIONS, type ViolationCode } from "@/modules/sim/rules";
import type { LessonEntryView } from "@/components/sim/lesson-ui/types";
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

/**
 * /simulator v2 — lesson select + play shell. Server component: loads the
 * student's SimSessions, computes the unlock progression and hands plain
 * data to the client orchestrator. The 3D scene itself mounts later inside
 * the play shell's <SceneSlot/> (integrator's seam).
 *
 * A15 adds the session history: the same store provides detailed recent rows
 * (stored debrief + canonical event log) which are folded into serializable
 * history entries here, server-side.
 */
export default async function SimulatorPage() {
  const user = await requireUser();

  let attempts: LessonAttemptRow[] = [];
  let history: SessionHistoryEntry[] = [];
  try {
    const store = getSimSessionStore();
    const rows = await store.listSessions(user.id);
    attempts = rows
      .filter((r) => r.score !== null)
      .map((r) => ({ lessonId: r.lessonId, passed: r.passed, score: r.score as number }));
    history = buildHistoryEntries(await store.listRecentSessions(user.id, HISTORY_LIMIT));
  } catch (err) {
    // No DB (fresh checkout / offline dev): the select screen still renders
    // with default progression — only L0 open, nothing persisted, no history.
    console.warn("simulator: listSessions failed, using empty progression", err);
  }

  const entries: LessonEntryView[] = computeProgression(LESSONS, attempts).map((e) => ({
    lesson: e.lesson,
    unlocked: e.unlocked,
    passed: e.passed,
    attempts: e.attempts,
    bestScore: e.bestScore,
  }));

  return <SimulatorClient entries={entries} history={history} />;
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
  const titleByLessonId = new Map(LESSONS.map((l) => [l.id, l.titleBg]));

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
      lessonTitleBg: titleByLessonId.get(r.lessonId) ?? r.lessonId,
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
