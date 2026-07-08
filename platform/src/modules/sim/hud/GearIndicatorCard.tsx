"use client";

/**
 * Gear + signals card — sits next to the speed card: current gear,
 * blinking turn indicators and the headlight state.
 */

import type { HeadlightState, IndicatorState } from "../rules";

function gearLabel(gear: number): string {
  if (gear < 0) return "R";
  if (gear === 0) return "N";
  return String(gear);
}

function Arrow({ active, direction }: { active: boolean; direction: "left" | "right" }) {
  return (
    <span
      aria-label={direction === "left" ? "ляв мигач" : "десен мигач"}
      className={`text-lg font-black leading-none ${active ? "hud-blink" : ""}`}
      style={{ color: active ? "var(--success)" : "var(--border-strong)" }}
    >
      {direction === "left" ? "◀" : "▶"}
    </span>
  );
}

export function GearIndicatorCard({
  gear,
  indicator,
  headlights,
  seatbeltOn,
}: {
  gear: number;
  indicator: IndicatorState;
  headlights: HeadlightState;
  seatbeltOn: boolean;
}) {
  return (
    <div className="pointer-events-none flex items-center gap-4 rounded-2xl border border-border bg-surface/75 px-4 py-2.5 backdrop-blur-md select-none">
      <div className="flex flex-col items-center">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Предавка
        </span>
        <span className="text-2xl font-black leading-none text-accent">{gearLabel(gear)}</span>
      </div>

      <div className="flex items-center gap-2" aria-label="Мигачи">
        <Arrow active={indicator === "left"} direction="left" />
        <Arrow active={indicator === "right"} direction="right" />
      </div>

      <div
        className="flex flex-col items-center"
        aria-label={seatbeltOn ? "Коланът е поставен" : "Колан не е поставен"}
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Колан
        </span>
        <span
          className={`text-sm font-black leading-none ${seatbeltOn ? "" : "hud-blink"}`}
          style={{ color: seatbeltOn ? "var(--success)" : "var(--danger)" }}
        >
          {seatbeltOn ? "✓" : "⚠ B"}
        </span>
      </div>

      <div className="flex flex-col items-center" aria-label={`Светлини: ${headlights}`}>
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Светлини
        </span>
        <span
          className="text-sm font-black leading-none"
          style={{
            color:
              headlights === "off"
                ? "var(--border-strong)"
                : headlights === "high"
                  ? "var(--accent-soft)"
                  : "var(--success)",
          }}
        >
          {headlights === "off" ? "—" : headlights === "high" ? "Дълги" : "Къси"}
        </span>
      </div>
    </div>
  );
}
