"use client";

/**
 * Speed card — glassy bottom-left readout with an animated limit ring.
 * The ring fills with the current speed relative to the legal limit
 * (WorldRuntime.speedLimitAt feeds `limitKmh`) and changes tone the moment
 * the driver leaves legality: accent under the limit, amber over it,
 * red beyond +10 km/h (the official "dangerous" band, doc 32).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ THIS COMPONENT IS NOT MOUNTED ANYWHERE, AND THE SWEEP'S ONE FINDING
 *   AGAINST IT IS ABOUT A DIFFERENT FILE. Checked and written down 2026-08-19
 *   rather than left for the next reader to re-derive.
 *
 * `StatusDashboard.tsx`'s own header says it „Replaces the old bottom-left
 * SpeedCard + GearIndicatorCard pair", and the replacement was total: there is
 * no `<SpeedCard` in the tree. It survives only as a named export from
 * `hud/index.ts`, i.e. as a public API with no consumer.
 *
 * THE FINDING ROUTED HERE (`sc-park-bay-exit-rev/pc-wrong/04-t028s.png`, 1440 ×
 * 900): „The HUD shows two conflicting speed limits side by side with no
 * resolution: a red 20 roundel immediately followed by «РЕЖИМ Нормален ≤50 ·
 * знакът важи». The wrong run was then docked −10 for «Превишаване с повече от
 * 10 км/ч»." The reading is real — the frame was opened and the strip cropped —
 * but **neither element is this file's**. The roundel is `StatusDashboard`'s
 * В26 disc (h-6 w-6, a bare ring) and not this card's 40 px disc under an
 * «Ограничение» caption inside a 72 px ring; the mark beside it is that file's
 * `GovernorCapMark`. This is §2.6 O34's class — „a component none of its files
 * renders" — and it is recorded here rather than closed here so the count is
 * not spent on a file that could not have caused it.
 *
 * WHERE IT WAS ACTUALLY ANSWERED: `StatusDashboard.tsx`'s `GovernorCapMark`
 * now resolves the three ceilings through `scene/lessonSpeedContract.ts`'s
 * `readSpeedContract` instead of its own inequality, which is the „no
 * precedence" half of this frame. Same lane, one file over.
 *
 * DO NOT RE-MOUNT IT WITHOUT READING THAT FRAME FIRST. A second surface
 * printing a limit is a second surface that can disagree with the disc the
 * student is billed against, and this card draws its own В26-shaped disc — a
 * red annulus around a numeral — which `governor-cap.test.ts` forbids the
 * governor mark from doing precisely because that shape is reserved for the
 * law. Two of them on one screen is the defect above with a second author.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;
/** Ring is full at 140% of the limit — headroom so red still reads as growth. */
const RING_HEADROOM = 1.4;

export function SpeedCard({ speedKmh, limitKmh }: { speedKmh: number; limitKmh: number }) {
  const speed = Math.max(0, Math.round(speedKmh));
  const limit = Math.max(1, Math.round(limitKmh));

  const tone =
    speed > limit + 10 ? "var(--danger)" : speed > limit ? "var(--warning)" : "var(--accent)";
  const fraction = Math.min(1, speedKmh / (limit * RING_HEADROOM));

  return (
    <div className="pointer-events-none flex items-center gap-3 rounded-2xl border border-border bg-surface/75 py-2.5 pl-3 pr-4 shadow-glow-sm backdrop-blur-md select-none">
      <div className="relative h-[72px] w-[72px]" aria-hidden>
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="5"
          />
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke={tone}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - fraction)}
            style={{
              transition:
                "stroke-dashoffset 0.25s ease-out, stroke 0.25s ease-out",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-black leading-none tabular-nums"
            style={{ color: tone }}
          >
            {speed}
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted">
            км/ч
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Ограничение
        </span>
        {/* Stylized В26-type limit disc, drawn with tokens so both themes work. */}
        <span
          aria-label={`Ограничение ${limit} км/ч`}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] bg-surface text-sm font-black tabular-nums text-foreground"
          style={{ borderColor: "var(--danger)" }}
        >
          {limit}
        </span>
      </div>
    </div>
  );
}
