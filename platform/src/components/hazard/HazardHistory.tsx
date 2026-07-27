"use client";

/**
 * Recent runs — the reason the standalone section exists at all.
 *
 * A single hazard run is a nice exercise. A COLUMN of runs is a claim: „твоята
 * преднина расте". That progression is the thing a student is actually buying
 * here, and it is also the raw material the ДАИ outcome capture
 * (@/modules/outcomes) will eventually correlate against — so this strip is not
 * decoration, it is the visible half of the safety measurement.
 *
 * MEDIAN LEAD IS THE COLUMN THAT MATTERS, and it is the one printed brightest.
 * Points are along for the ride: points scale with run length, so a row of them
 * says more about how long each sitting was than about whether the student is
 * getting better.
 *
 * Client component only because dates are formatted in the VIEWER's locale and
 * timezone. Rendering them on the server would print Europe/Sofia for a student
 * abroad and then disagree with itself on hydration.
 */

import { useIsHydrated } from "@/lib/hooks/clientEnv";
import { formatLeadSecBg, formatPointsBg } from "./copy";
import type { HazardRunSummary } from "./types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
};

export function HazardHistory({ runs }: { runs: HazardRunSummary[] }) {
  const hydrated = useIsHydrated();

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted">
        Още нямаш завършена тренировка. След първата тук ще виждаш дали
        преднината ти расте.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {runs.map((run) => (
        <li
          key={run.runId}
          className="panel-inset flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
        >
          <span className="text-sm text-muted">
            {/* Before hydration there is no locale to format in; a dash is
                better than a server-timezone date that changes under the
                student a frame later. */}
            {hydrated && run.finishedAtIso !== null
              ? new Date(run.finishedAtIso).toLocaleDateString("bg-BG", DATE_FORMAT)
              : "—"}
          </span>
          <span className="flex items-center gap-4">
            <span className="font-mono text-sm font-bold tabular-nums text-accent-2">
              {formatLeadSecBg(run.medianLeadSec)}
            </span>
            <span className="hud-label tabular-nums">
              {formatPointsBg(run.points, run.maxPoints)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
