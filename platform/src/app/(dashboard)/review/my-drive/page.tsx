import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import { lessonById, parseScenarioLessonId, scenarioById } from "@/modules/sim/lessons";
// Deep import, exactly as the simulator's finish action does: the attempt-trace
// store is server-only (node:zlib + Prisma) and is deliberately off the
// sim/traces barrel, which rides the theory bundle (audit M-26).
import {
  ATTEMPT_TRACE_RETENTION,
  getAttemptTraceStore,
} from "@/modules/sim/traces/attemptStore";

export const metadata: Metadata = {
  title: "Твоят дубъл · Книжка.AI",
  description: "Гледай собственото си каране отвън.",
  robots: { index: false, follow: false },
};

// The list is one index scan of at most five rows and it changes on every
// drive — caching it would show a student a record that no longer exists.
export const dynamic = "force-dynamic";

/**
 * „Твоят дубъл" — the student's own recorded drives (doc 82 §5.3 I2).
 *
 * Every finished drive is already recorded, compacted, gzipped, retention-
 * managed and stored against the session it belongs to. Until this route
 * existed nothing ever read one back: `getAttemptTraceStore()` had two call
 * sites and both were `.save(...)`. This is the missing read path.
 *
 * HONESTY ABOUT RETENTION (the doc's own note on I2): only the newest few
 * drives are kept, so the screen SAYS „последните N записа" rather than
 * letting a student conclude their history silently broke. The alternative —
 * hoarding kinematics for a minor because deleting them looks like a bug —
 * is the wrong trade under ADR-004.
 */
export default async function MyDriveListPage() {
  const user = await requireUser();
  const rows = await getAttemptTraceStore()
    .list(user.id)
    .catch(() => []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <span className="hud-label">Симулатор · записи</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">Твоят дубъл</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Всяко твое каране се записва — не като видео, а като самото движение
          на колата. Тук можеш да го изгледаш отвън, на забавен каданс, и да
          спреш точно в секундата, в която изпитната логика те е отчела.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-hair bg-surface-2/40 p-4 text-sm leading-relaxed text-muted">
          Още нямаш записани карания.{" "}
          <Link href="/simulator" className="font-semibold text-accent">
            Изкарай един сценарий
          </Link>{" "}
          и записът ще се появи тук.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.simSessionId}>
              <Link
                href={`/review/my-drive/${row.simSessionId}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-hair bg-surface-2/40 px-4 py-3 transition hover:border-accent motion-reduce:transition-none"
              >
                <span className="font-semibold">{lessonTitleFor(row.lessonId)}</span>
                <span className="text-xs text-muted">
                  {DAY_FORMAT.format(row.recordedAt)}
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted">
                  {formatDuration(row.durationSec)} · {row.sampleCount} кадъра
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Пазим последните {ATTEMPT_TRACE_RETENTION} записа. По-старите се
        изтриват сами — оценката, грешките и разборът на всяко каране остават
        завинаги в историята на сесиите; тук е само движението.
      </p>
    </div>
  );
}

/** Stored lessonId → a human name; falls back to the raw id so a retired
 *  lesson still lists instead of rendering an empty row. */
function lessonTitleFor(lessonId: string): string {
  const scenarioRef = parseScenarioLessonId(lessonId);
  if (scenarioRef !== null) {
    const spec = scenarioById(scenarioRef.templateId);
    if (spec !== undefined) return `${spec.titleBg} · ниво ${scenarioRef.level}`;
  }
  return lessonById(lessonId)?.titleBg ?? lessonId;
}

function formatDuration(durationSec: number): string {
  const total = Math.max(0, Math.round(durationSec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
