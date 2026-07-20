"use client";

/**
 * WhyPanel — THEO-2 Stage 1 (doc 64): the founder-ratified why-panel of
 * theory practice. Renders the pure model from whyPanelModel.ts: the STORED
 * explanation + STORED citations (ADR-002 — verbatim, never generated law),
 * and, when the resolver chain found one, the recorded mistake replay with
 * its stored caption + the „Опитай в симулатора" drill deep link.
 *
 * Placement is the parent's job (side panel on desktop, in-card section on
 * mobile — PracticeSession). This component is one panel body, never a modal.
 *
 * Perf: MistakeMedia (the real-engine clip when the manifest has one, the 2D
 * canvas replay as the founder-chosen fallback) code-splits via next/dynamic
 * (ssr:false) and mounts ONLY when its section is shown — auto for a wrong
 * answer (the panel itself appears on submit), behind the „Виж грешката,
 * която избегна" disclosure for a correct one. Its fetches are lazy already.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { IconArrowRight } from "@/components/icons";
import type { WhyPanelModel } from "./whyPanelModel";

const MistakeMedia = dynamic(() => import("./MistakeMedia"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
    />
  ),
});

export function WhyPanel({
  model,
  className,
}: {
  model: WhyPanelModel;
  className?: string;
}) {
  // Collapsed-replay disclosure (correct answers). The parent keys this
  // component by question id, so the state resets with every new answer.
  const [expanded, setExpanded] = useState(false);

  const replay = model.replay;
  const replayShown = replay !== null && (!replay.collapsed || expanded);
  const correct = model.tone === "correct";

  return (
    <section
      aria-label={model.headerBg}
      className={`rounded-2xl border p-4 ${
        correct ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"
      } ${className ?? ""}`}
    >
      <h3
        className={`font-display text-sm font-extrabold ${
          correct ? "text-success" : "text-danger"
        }`}
      >
        {model.headerBg}
      </h3>

      {model.leadInBg !== null ? (
        <p className="mt-2 text-xs font-bold text-success">{model.leadInBg}</p>
      ) : null}

      {model.explanationBg !== null ? (
        // STORED text verbatim (ADR-002).
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {model.explanationBg}
        </p>
      ) : (
        // Citation-only fallback: never invent missing explanation text.
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Обяснението за този въпрос още се преглежда. Виж посочените членове —
          или{" "}
          <Link href="/tutor" className="font-bold text-accent hover:underline">
            попитай AI тутора
          </Link>
          .
        </p>
      )}

      {model.lawRefs.length > 0 ? (
        <ul aria-label="Правни основания" className="mt-3 flex flex-wrap gap-1.5">
          {model.lawRefs.map((law) => (
            <li
              key={`${law.act}-${law.ref}`}
              className="rounded-full border border-hair bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-muted"
            >
              {law.act} {law.ref}
            </li>
          ))}
        </ul>
      ) : null}

      {replay !== null ? (
        <div className="mt-4 border-t border-hair pt-3">
          {replay.collapsed && !expanded ? (
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setExpanded(true)}
              className="btn-ghost w-full px-3 py-2 text-xs"
            >
              {replay.toggleBg}
            </button>
          ) : (
            <>
              <p className="hud-label">Виж го на пътя</p>
              <p className="mt-1.5 text-xs font-bold text-danger">
                {replay.mistakeTitleBg}
              </p>
              {/* STORED what-went-wrong caption (ADR-002). */}
              <p className="mt-1 text-xs leading-snug text-foreground/90">
                {replay.whatWentWrongBg}
              </p>
              {replayShown ? (
                <MistakeMedia
                  tracePath={replay.tracePath}
                  districtId={replay.districtId}
                  className="mt-2"
                />
              ) : null}
              {/* THEO-3: the wired mistake-experience — do the wrong thing
                  on purpose in the sandbox, live the consequence, retry. */}
              {replay.experienceHref !== null ? (
                <Link
                  href={replay.experienceHref}
                  title={replay.experienceTitleBg ?? undefined}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger/15 motion-reduce:transition-none"
                >
                  Преживей грешката
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              <Link
                href={replay.drillHref}
                className={`btn-ghost w-full px-3 py-2 text-xs ${
                  replay.experienceHref !== null ? "mt-2" : "mt-3"
                }`}
              >
                Опитай в симулатора
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                {replay.titleBg}
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Quiet desktop placeholder before the first answer — keeps the side column
 *  stable so the question card never jumps when the panel fills in. */
export function WhyPanelIdle() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-4">
      <p className="hud-label">Защо-панел</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        След всеки отговор тук виждаш защо е верен или грешен, кой член от
        закона важи и как изглежда грешката на пътя.
      </p>
    </div>
  );
}
