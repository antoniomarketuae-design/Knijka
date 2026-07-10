"use client";

/**
 * Gear + signals card — sits next to the speed card: current gear/selector,
 * blinking turn indicators, headlight state, and (A1) the driveline telltale
 * cluster: engine on/off + stall warning, parking-brake red (P), hazards and
 * fog lights. When no driveline snapshot is available yet (scene still
 * booting) the card renders exactly as before A1.
 */

import type { DrivelineSnapshot } from "../vehicle";
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

/** Small labeled telltale column (matches the Колан/Светлини styling). */
function Telltale({
  label,
  value,
  color,
  blink = false,
  ariaLabel,
}: {
  label: string;
  value: string;
  color: string;
  blink?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-col items-center" aria-label={ariaLabel}>
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      <span
        className={`text-sm font-black leading-none ${blink ? "hud-blink" : ""}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

export function GearIndicatorCard({
  gear,
  indicator,
  headlights,
  seatbeltOn,
  driveline = null,
}: {
  gear: number;
  indicator: IndicatorState;
  headlights: HeadlightState;
  seatbeltOn: boolean;
  /** A1 driveline telltales; null → legacy card (no driveline in the scene). */
  driveline?: DrivelineSnapshot | null;
}) {
  const d = driveline;
  // Selector letter is the truth when the driveline exists (P R N D / M2);
  // the tick-derived number remains the fallback.
  const gearText = d ? d.gearLabel : gearLabel(gear);
  const hazardsOn = d?.hazardsOn ?? false;

  return (
    <div className="pointer-events-none flex items-center gap-4 rounded-2xl border border-border bg-surface/75 px-4 py-2.5 backdrop-blur-md select-none">
      <div className="flex flex-col items-center" aria-label={`Предавка ${gearText}`}>
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Предавка
        </span>
        <span
          className="text-2xl font-black leading-none"
          style={{ color: d && !d.engineOn ? "var(--border-strong)" : "var(--accent)" }}
        >
          {gearText}
        </span>
      </div>

      <div className="flex items-center gap-2" aria-label="Мигачи">
        <Arrow active={indicator === "left" || hazardsOn} direction="left" />
        <Arrow active={indicator === "right" || hazardsOn} direction="right" />
      </div>

      {d ? (
        d.stalled ? (
          <Telltale
            label="Двигател"
            value="Угасна"
            color="var(--danger)"
            blink
            ariaLabel="Двигателят угасна — рестартирай (Z + I)"
          />
        ) : (
          <Telltale
            label="Двигател"
            value={d.engineOn ? "Вкл." : "Изкл. I"}
            color={d.engineOn ? "var(--success)" : "var(--danger)"}
            blink={!d.engineOn}
            ariaLabel={d.engineOn ? "Двигателят работи" : "Двигателят е изключен"}
          />
        )
      ) : null}

      {d ? (
        <div
          className="flex flex-col items-center"
          aria-label={d.parkingBrakeOn ? "Ръчната спирачка е вдигната" : "Ръчната спирачка е освободена"}
        >
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
            Ръчна
          </span>
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full border-2 text-[10px] font-black leading-none"
            style={{
              color: d.parkingBrakeOn ? "var(--danger)" : "var(--border-strong)",
              borderColor: d.parkingBrakeOn ? "var(--danger)" : "var(--border-strong)",
            }}
          >
            P
          </span>
        </div>
      ) : null}

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

      {d ? (
        <div className="flex items-center gap-2.5">
          <Telltale
            label="Авар."
            value="▲"
            color={hazardsOn ? "var(--warning)" : "var(--border-strong)"}
            blink={hazardsOn}
            ariaLabel={hazardsOn ? "Аварийните светлини са включени" : "Аварийни светлини"}
          />
          <Telltale
            label="Мъгла"
            value={d.fogLightsOn ? "Вкл." : "—"}
            color={d.fogLightsOn ? "var(--success)" : "var(--border-strong)"}
            ariaLabel={d.fogLightsOn ? "Фаровете за мъгла светят" : "Фарове за мъгла"}
          />
        </div>
      ) : null}
    </div>
  );
}
