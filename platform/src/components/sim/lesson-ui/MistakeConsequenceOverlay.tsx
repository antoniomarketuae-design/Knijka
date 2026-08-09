"use client";

/**
 * Mistake-consequence overlay (THEO-3, doc 64) — the MOMENT of the
 * mistake-experience mode: the targeted wrong action fired (or the student
 * asked for the demonstration), the shell froze physics (the proven
 * teach-pause `paused` mechanism), and this card presents the consequence:
 *
 *   „Какво направи" — the STORED whatWentWrongBg of the template mistake +
 *   the lawRef citation, SIDE BY SIDE with the recorded replay of that same
 *   mistake (MistakeMedia — the real-engine clip when the manifest has one,
 *   the THEO Stage 1 2D canvas as fallback; the WhyPanel component, shared,
 *   no forks), framed by the mistake's OFFICIAL severity class
 *   (опасна/основна/второстепенна — stored in the rules catalog, never
 *   invented). „Сега опитай правилно →" restarts the SAME rung in normal
 *   graded mode (the shell's onStartScenario seam).
 *
 * ADR-002: every teaching string here is either STORED content
 * (whatWentWrongBg, catalog titles/lawRefs) or a FIXED per-class framing
 * constant (UI chrome, like the why-panel headers) — never generated law.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { IconArrowRight, IconShield } from "@/components/icons";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import type { MistakeDemo, TeachMoment } from "@/modules/sim/lessons";
import {
  EXAM_POINTS_SHORT_NOTE_BG,
  VIOLATIONS,
  examMarkCitationBg,
  minusPointsBg,
  type SeverityClass,
  type ViolationSpec,
} from "@/modules/sim/rules";

const MistakeMedia = dynamic(() => import("@/components/theory/MistakeMedia"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
    />
  ),
});

/** Fixed severity framing („това щеше да е катастрофа/глоба") — UI chrome
 *  keyed by the STORED official class, exported for tests. */
export const CONSEQUENCE_FRAMING_BG: Record<SeverityClass, string> = {
  opasna:
    "На пътя това щеше да е катастрофа. Опасна грешка — на изпита прекратява изпита на място.",
  osnovna:
    "На пътя това е глоба и реален риск от сблъсък. Основна грешка — на изпита тежи с основни наказателни точки.",
  vtorostepenna:
    "На изпита това е второстепенна грешка — но на пътя точно от такива навици се раждат инцидентите.",
};

const SEVERITY_LABEL_BG: Record<SeverityClass, string> = {
  opasna: "опасна грешка",
  osnovna: "основна грешка",
  vtorostepenna: "второстепенна грешка",
};

/** Catalog spec of a code (string-keyed lookup over the closed record). */
function catalogSpec(code: string | undefined): ViolationSpec | undefined {
  if (code === undefined) return undefined;
  return (VIOLATIONS as Record<string, ViolationSpec | undefined>)[code];
}

export function MistakeConsequenceOverlay({
  demo,
  districtId,
  moment,
  onRetryCorrect,
  onDismiss,
}: {
  /** The targeted template mistake (stored copy + recorded trace). */
  demo: MistakeDemo;
  /** The drill's district (the replay's home map). */
  districtId: string;
  /** The live consequence moment; null = the „Виж демонстрацията" path
   *  (the student never managed the mistake — never a dead end). */
  moment: TeachMoment | null;
  /** „Сега опитай правилно →" — restart the SAME rung, normal graded mode.
   *  Null hides the CTA (no launcher seam — should not happen in practice). */
  onRetryCorrect: (() => void) | null;
  /** Close the overlay and keep driving in the sandbox. */
  onDismiss: () => void;
}) {
  // Enter = the primary CTA (the teach-pause overlay convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Enter") return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "BUTTON" || tag === "A") return;
      e.preventDefault();
      if (onRetryCorrect !== null) onRetryCorrect();
      else onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRetryCorrect, onDismiss]);

  // Live moment first; the demo path falls back to the catalog spec of the
  // mistake's first cited code (stored data either way).
  const fallback = catalogSpec(demo.codeRefs[0]);
  const severity: SeverityClass = moment?.severity ?? fallback?.severityClass ?? "osnovna";
  const lawRef = moment?.lawRef ?? fallback?.lawRef;
  const points = moment?.points ?? fallback?.points;

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mistake-consequence-title"
    >
      <section className="card my-auto flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-6">
        {/* Header — the mistake happened (or is being demonstrated) */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"
          >
            <IconShield className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="mistake-consequence-title" className="text-sm font-black leading-tight">
              {moment !== null ? "Какво направи" : "Демонстрация на грешката"}
            </h2>
            <p className="text-xs text-muted">
              Преживей грешката — пауза. Нищо от това не се брои в резултат.
            </p>
          </div>
          {/* THE STAKE, WITH ITS SCALE. This card is a rehearsal — nothing here
              is scored — so the number is what a repeat in a GRADED drive would
              cost on the изпитен лист, and it says which sheet that is. */}
          <span className="ml-auto shrink-0 rounded-full border border-danger/50 bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger">
            {SEVERITY_LABEL_BG[severity]}
            {points !== undefined ? ` · ${minusPointsBg("exam", points)}` : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* The stored teaching copy + the citation + the severity framing */}
          <div className="min-w-0">
            <h3 className="text-base font-extrabold leading-snug">{demo.titleBg}</h3>
            {/* STORED what-went-wrong text (ADR-002). */}
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {demo.whatWentWrongBg}
            </p>
            {/* The rule and the mark are two different citations. The chip used
                to carry only the rule, next to a point figure it does not set. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {lawRef ? (
                <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                  правило: {lawRef}
                </span>
              ) : null}
              {points !== undefined ? (
                <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                  оценка: {examMarkCitationBg(severity)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm leading-relaxed">{CONSEQUENCE_FRAMING_BG[severity]}</p>
              {points !== undefined ? (
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {EXAM_POINTS_SHORT_NOTE_BG}
                </p>
              ) : null}
            </div>
          </div>

          {/* The consequence visual: the recorded replay of this same
              mistake (MistakeMedia — real-engine clip if produced, the
              Stage 1 2D canvas otherwise; lazy either way). */}
          <div className="min-w-0">
            <p className="hud-label">Погледни отстрани</p>
            <MistakeMedia
              tracePath={traceUrlForRepoPath(demo.traceRef.path)}
              districtId={districtId}
              className="mt-1.5"
            />
          </div>
        </div>

        {/* The retry — the whole point: same rung, this time graded. */}
        <div className="flex flex-wrap items-center gap-3">
          {onRetryCorrect !== null ? (
            <button type="button" onClick={onRetryCorrect} className="btn-accent">
              Сега опитай правилно
              <IconArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button type="button" onClick={onDismiss} className="btn-ghost px-4 py-2 text-xs">
            Продължи в пясъчника
          </button>
          {onRetryCorrect !== null ? (
            <span className="text-xs text-muted">или натисни Enter</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
