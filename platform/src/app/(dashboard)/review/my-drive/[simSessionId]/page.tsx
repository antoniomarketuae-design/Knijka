import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import { lessonById, parseScenarioLessonId, scenarioById } from "@/modules/sim/lessons";
import { getSimSessionStore } from "@/modules/sim/lessons/store";
// Deep imports (the finishLessonAction pattern): both files are server-only
// and deliberately off the sim/traces barrel, which rides the theory bundle
// (audit M-26). attemptReel additionally reaches the rule catalog.
import { getAttemptTraceStore } from "@/modules/sim/traces/attemptStore";
import { buildAttemptReel, reelStartSec } from "@/modules/sim/traces/attemptReel";
import { DualGhostReplay } from "./DualGhostReplay";

export const metadata: Metadata = {
  title: "Твоят дубъл · Книжка.AI",
  robots: { index: false, follow: false },
};

// Reads the student's own trace live; nothing here is shareable or cacheable.
export const dynamic = "force-dynamic";

/**
 * „Твоят дубъл" for ONE drive (doc 82 §5.3 I2 + I3).
 *
 * Server side: read the stored trace back (ownership-scoped — `userId` is in
 * the WHERE, and a session id is a cuid another account could guess at), join
 * it with the session's already-graded event log, and hand the client a model
 * it only has to draw.
 *
 * I3 — the dual ghost: when the scenario template has a RECORDED shadow trace,
 * its public URL goes along too, and the client mounts both drives on one
 * clock. „Ти караше по-бързо" becomes „ето къде правилната кола вече спираше".
 * A template whose shadow is still `pending` degrades to the single ghost and
 * the screen says so — comparing a student against nothing, silently, would be
 * worse than not comparing at all.
 *
 * Rendering is IN-BROWSER on purpose (doc 82 §7.4 item 26): the headless clip
 * pipeline needs a real GPU (~58 s/clip; the GPU-less VPS falls back to
 * SwiftShader at ~1 fps), so per-student server rendering is not a product.
 * This replay costs one 15 KB blob and a canvas.
 */
export default async function MyDrivePage({
  params,
}: {
  params: Promise<{ simSessionId: string }>;
}) {
  const { simSessionId } = await params;
  const user = await requireUser();

  const trace = await getAttemptTraceStore()
    .load(user.id, simSessionId)
    .catch(() => null);
  // notFound(), not a 403: a replay screen should not confirm that someone
  // else's session id exists to whoever guessed it.
  if (trace === null) notFound();

  // The graded verdict lives on the session row. listRecentSessions rather
  // than a by-id read because the sim store exposes no by-id method and the
  // trace retention window (5) is far inside this one — a trace that outlived
  // its own session row would be a foreign-key violation, not a miss.
  const sessions = await getSimSessionStore()
    .listRecentSessions(user.id, 50)
    .catch(() => []);
  const session = sessions.find((s) => s.id === simSessionId) ?? null;

  const reel = buildAttemptReel(
    trace,
    session?.events?.ruleEvents ?? [],
    session?.events?.eventPositions ?? [],
  );

  const scenarioRef = parseScenarioLessonId(trace.meta.scenarioId);
  const spec =
    scenarioRef !== null
      ? scenarioById(scenarioRef.templateId)
      : scenarioById(trace.meta.scenarioId);

  // The authored „едно правилно решение" — only when it has actually been
  // recorded (`pending` marks a spec that ships before its trace exists).
  const shadowUrl =
    spec !== undefined && spec.shadow.pending !== true
      ? traceUrlForRepoPath(spec.shadow.path)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <span className="hud-label">
          <Link href="/review/my-drive" className="hover:text-accent">
            ← Всички записи
          </Link>
        </span>
        <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">
          {lessonTitleFor(session?.lessonId ?? trace.meta.scenarioId)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Това си ти, отвън.{" "}
          {shadowUrl !== null
            ? "Синята кола е едно правилно изпълнение на същата задача, пуснато по същия часовник — не единственото вярно, а едно, което изпитната логика приема."
            : "За този сценарий още няма записано образцово изпълнение, така че се вижда само твоята линия."}
        </p>
      </header>

      <DualGhostReplay
        trace={reel.trace}
        faults={reel.faults}
        districtId={spec?.map.districtId ?? null}
        shadowTraceUrl={shadowUrl}
        startAtSec={reelStartSec(reel.openAtSec)}
      />

      {session === null ? (
        <p className="rounded-lg border border-hair bg-surface-2/40 p-4 text-xs leading-relaxed text-muted">
          Оценката на тази сесия не е достъпна, така че записът се възпроизвежда
          без отбелязани грешки. Самото каране е точно това, което си направил.
        </p>
      ) : null}
    </div>
  );
}

function lessonTitleFor(lessonId: string): string {
  const scenarioRef = parseScenarioLessonId(lessonId);
  if (scenarioRef !== null) {
    const spec = scenarioById(scenarioRef.templateId);
    if (spec !== undefined) return `${spec.titleBg} · ниво ${scenarioRef.level}`;
  }
  return lessonById(lessonId)?.titleBg ?? lessonId;
}
