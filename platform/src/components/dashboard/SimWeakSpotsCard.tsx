import Link from "next/link";
import type { SimWeakSpotsSnapshot, SimWeakSpotView } from "@/components/dashboard/data";
import { IconCheck, IconWheel } from "@/components/icons";

/**
 * „Слаби места от кормуване" (A14) — the up-to-3 concepts with the worst
 * recent sim evidence, each linking to targeted theory practice. This is the
 * visible half of the driving→theory loop: mistakes behind the wheel point
 * straight at the law to revise. Renders nothing until the user has driven
 * recently; clean recent driving gets the positive state instead.
 */
export function SimWeakSpotsCard({ snapshot }: { snapshot: SimWeakSpotsSnapshot }) {
  if (!snapshot.hasRecentEvidence) return null;

  return (
    <section
      aria-labelledby="sim-weak-spots-title"
      className="hud-panel flex flex-col p-5 sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <IconWheel className="h-5 w-5" />
          </span>
          <h2
            id="sim-weak-spots-title"
            className="font-display text-base font-extrabold"
          >
            Слаби места от кормуване
          </h2>
        </div>
        <span className="hud-label">Симулатор</span>
      </div>

      {snapshot.spots.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-bold text-success">
          <IconCheck className="h-4 w-4" />
          Чисто каране — няма нарушения в последните сесии.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted">
            Правилата, които най-често нарушаваш в симулатора. Затвърди ги с
            въпроси от теорията.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {snapshot.spots.map((spot) => (
              <WeakSpotRow key={spot.conceptId} spot={spot} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Severity → dot colour: опасна reads danger, основна warning, else accent. */
function severityColor(severity: SimWeakSpotView["worstSeverity"]): string {
  if (severity === "opasna") return "var(--danger)";
  if (severity === "osnovna") return "var(--warning)";
  return "var(--accent)";
}

const SEVERITY_LABEL: Record<SimWeakSpotView["worstSeverity"], string> = {
  opasna: "опасна грешка",
  osnovna: "основна грешка",
  vtorostepenna: "второстепенна грешка",
};

function WeakSpotRow({ spot }: { spot: SimWeakSpotView }) {
  const color = severityColor(spot.worstSeverity);
  return (
    <li>
      <Link
        href={spot.href}
        className="group flex items-center gap-3 rounded-xl border border-hair bg-surface-2 px-3 py-2.5 transition duration-200 hover:border-border-strong motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold group-hover:text-accent">
            {spot.titleBg}
          </span>
          <span className="block text-xs text-muted">
            {SEVERITY_LABEL[spot.worstSeverity]} ·{" "}
            {spot.violationCount === 1
              ? "1 нарушение"
              : `${spot.violationCount} нарушения`}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-accent">
          Упражни →
        </span>
      </Link>
    </li>
  );
}
