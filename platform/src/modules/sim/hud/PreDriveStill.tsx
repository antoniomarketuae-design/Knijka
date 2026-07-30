"use client";

/**
 * Pre-drive tutorial STILL illustrations — one schematic diagram per step of
 * the 13-step procedure (founder 2026-07-30, ledger 86 D9: „a real-world
 * illustration, a short instructional animation, or a 10–15 second realistic
 * video"). The video is the target; the still is what ships today, because
 * every generation account is at zero balance.
 *
 * Inline SVG on purpose:
 *  - no network, no public asset, no CSP surprise — the tutorial renders in
 *    the clip rig, in an offline session and inside a printed debrief;
 *  - theme-correct at zero cost (every colour is a CSS variable, so light and
 *    dark are the same code path);
 *  - deterministic — nothing here animates, so a screenshot test of the
 *    popup is stable.
 *
 * These are instructor DIAGRAMS, not photographs, and they are labelled as
 * such in the caption. When `PRE_DRIVE_TUTORIAL_CLIPS` gains an entry the
 * popup stops calling this component for that step — see
 * `procedures/tutorial.ts` `preDriveTutorialMedia`.
 */

import type { ReactElement, ReactNode } from "react";
import type { PreDriveStepId } from "../procedures";

const W = 320;
const H = 170;

/** Shared paint. `currentColor` is never used — the popup body colour is text. */
const INK = "var(--foreground)";
const DIM = "var(--muted)";
const LINE = "var(--border-strong)";
const HL = "var(--accent)";
const OK = "var(--success)";
const BAD = "var(--danger)";
const PANEL = "var(--surface-2)";

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="0" width={W} height={H} rx="12" fill={PANEL} />
      {children}
    </svg>
  );
}

/** Small Bulgarian annotation, always the same size so the set reads as one.
 *  `x`/`y` mirror the SVG attribute types (number or coordinate string). */
function Note({
  x,
  y,
  text,
  tone = DIM,
}: {
  x: number | string;
  y: number | string;
  text: string;
  tone?: string;
}) {
  return (
    <text x={x} y={y} fill={tone} fontSize="10" fontWeight="700" fontFamily="inherit">
      {text}
    </text>
  );
}

// ---------------------------------------------------------------------------
// The thirteen diagrams
// ---------------------------------------------------------------------------

const STILLS: Record<PreDriveStepId, () => ReactElement> = {
  // Side view: seat, driver, bent knee on the pedal, wrist over the wheel rim.
  "adjust-seat": () => (
    <Frame label="Странична схема: свит крак на педала и китка върху волана при изпъната ръка">
      {/* floor + pedal */}
      <path d={`M20 140 H300`} stroke={LINE} strokeWidth="2" />
      <path d="M62 140 L54 118 L64 114 L72 136 Z" fill={LINE} />
      {/* seat */}
      <path d="M196 140 L196 96 Q196 84 208 82 L226 78" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M150 140 H206" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      {/* driver */}
      <circle cx="198" cy="62" r="12" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M196 76 L182 116" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      {/* thigh + shin: the KNEE angle is the whole point */}
      <path d="M182 116 L118 124 L66 132" stroke={HL} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="118" cy="124" r="5" fill={HL} />
      {/* arm to the wheel */}
      <path d="M190 88 L120 76" stroke={HL} strokeWidth="4" strokeLinecap="round" />
      <circle cx="112" cy="74" r="6" fill="none" stroke={HL} strokeWidth="3" />
      {/* wheel */}
      <ellipse cx="104" cy="82" rx="10" ry="26" fill="none" stroke={INK} strokeWidth="3" />
      <Note x="88" y="150" text="педал" />
      <Note x="100" y="112" text="свит крак" tone={HL} />
      <Note x="86" y="56" text="китка върху волана" tone={HL} />
    </Frame>
  ),

  // Three mirrors, each showing only a thin sliver of the student's own car.
  "adjust-mirrors": () => (
    <Frame label="Схема на трите огледала: минимум собствена кола, максимум път">
      {[
        { x: 22, label: "ляво" },
        { x: 122, label: "вътрешно" },
        { x: 222, label: "дясно" },
      ].map((m, i) => (
        <g key={m.label}>
          <rect x={m.x} y="34" width="76" height="52" rx="8" fill="var(--surface)" stroke={INK} strokeWidth="3" />
          {/* road */}
          <path d={`M${m.x + 8} 80 L${m.x + 34} 44 L${m.x + 52} 44 L${m.x + 68} 80 Z`} fill={LINE} opacity="0.5" />
          {/* own-car sliver — the narrow edge that means "correctly turned out" */}
          <rect
            x={i === 1 ? m.x + 33 : i === 0 ? m.x + 6 : m.x + 62}
            y="40"
            width={i === 1 ? 10 : 8}
            height="42"
            rx="3"
            fill={HL}
          />
          <Note x={m.x + 4} y="102" text={m.label} />
        </g>
      ))}
      <Note x="22" y="126" text="Тесен ръб собствена кола = огледалото гледа пътя," tone={HL} />
      <Note x="22" y="142" text="а не теб. Задръж огледалото, за да погледнеш." />
    </Frame>
  ),

  // Top view: walk-around loop, and the child nobody sees from the seat.
  "check-surroundings": () => (
    <Frame label="Схема отгоре: обиколка около колата и невидимото дете зад задната броня">
      <rect x="118" y="40" width="84" height="98" rx="14" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <rect x="128" y="52" width="64" height="24" rx="6" fill={LINE} opacity="0.6" />
      <path
        d="M96 34 H224 A12 12 0 0 1 236 46 V132 A12 12 0 0 1 224 144 H96 A12 12 0 0 1 84 132 V46 A12 12 0 0 1 96 34 Z"
        fill="none"
        stroke={HL}
        strokeWidth="2.5"
        strokeDasharray="7 6"
      />
      {/* child behind the rear bumper */}
      <circle cx="158" cy="148" r="6" fill={BAD} />
      <path d="M158 154 V162" stroke={BAD} strokeWidth="4" strokeLinecap="round" />
      <Note x="172" y="156" text="невидимо отвътре" tone={BAD} />
      <Note x="20" y="26" text="Обиколи колата, преди да седнеш" tone={HL} />
    </Frame>
  ),

  // Torso + diagonal belt over the middle of the shoulder + buckle.
  "fasten-seatbelt": () => (
    <Frame label="Схема: диагоналът минава през средата на рамото, лентата не е усукана">
      <circle cx="132" cy="46" r="17" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M100 142 Q100 74 132 70 Q164 74 164 142 Z" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      {/* the belt */}
      <path d="M112 66 L160 128" stroke={HL} strokeWidth="9" strokeLinecap="round" />
      <path d="M108 128 H162" stroke={HL} strokeWidth="9" strokeLinecap="round" />
      <rect x="156" y="120" width="16" height="18" rx="4" fill={OK} />
      {/* shoulder marker */}
      <circle cx="112" cy="66" r="5" fill={OK} />
      <Note x="24" y="60" text="средата на" tone={OK} />
      <Note x="24" y="74" text="рамото" tone={OK} />
      <path d="M70 68 H104" stroke={OK} strokeWidth="2" markerEnd="" />
      <Note x="182" y="134" text="щрак" tone={OK} />
      <Note x="182" y="60" text="не през врата" tone={BAD} />
      <Note x="182" y="74" text="не под мишница" tone={BAD} />
    </Frame>
  ),

  // Cluster with four telltales — one stays red.
  "check-dashboard": () => (
    <Frame label="Схема на таблото: всички лампи изгасват освен предупредителната">
      <rect x="30" y="34" width="260" height="80" rx="14" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <circle cx="96" cy="74" r="26" fill="none" stroke={LINE} strokeWidth="3" />
      <path d="M96 74 L112 58" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="224" cy="74" r="26" fill="none" stroke={LINE} strokeWidth="3" />
      <path d="M224 74 L210 60" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {[
        { x: 142, on: false },
        { x: 160, on: true },
        { x: 178, on: false },
      ].map((l) => (
        <circle
          key={l.x}
          cx={l.x}
          cy="66"
          r="7"
          fill={l.on ? BAD : "transparent"}
          stroke={l.on ? BAD : LINE}
          strokeWidth="2.5"
        />
      ))}
      <rect x="140" y="84" width="40" height="8" rx="4" fill={LINE} opacity="0.6" />
      <Note x="30" y="134" text="Червена лампа, която не изгасва = не тръгвай." tone={BAD} />
      <Note x="30" y="150" text="Жълта = тръгни внимателно и провери скоро." />
    </Frame>
  ),

  // Car front with two dipped beams.
  "headlights-on": () => (
    <Frame label="Схема: включени къси светлини преди потегляне">
      <path d="M96 116 H224 L212 66 H108 Z" fill="var(--surface)" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="112" y="76" width="96" height="22" rx="5" fill={LINE} opacity="0.5" />
      {[
        { x: 104, dir: -1 },
        { x: 216, dir: 1 },
      ].map((l) => (
        <g key={l.x}>
          <circle cx={l.x} cy="108" r="9" fill={HL} />
          <path
            d={`M${l.x + l.dir * 10} 104 L${l.x + l.dir * 84} 84 L${l.x + l.dir * 84} 132 L${l.x + l.dir * 10} 114 Z`}
            fill={HL}
            opacity="0.22"
          />
        </g>
      ))}
      <Note x="24" y="34" text="Светлините не са, за да виждаш ти —" tone={HL} />
      <Note x="24" y="48" text="а за да те видят другите." />
      <Note x="112" y="150" text="къси светлини" tone={HL} />
    </Frame>
  ),

  // Start button + the foot that must be on the brake first.
  "start-engine": () => (
    <Frame label="Схема: крак на спирачката, лост на P, после стартерът">
      <rect x="26" y="46" width="120" height="80" rx="12" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <path d="M56 118 L48 84 L62 80 L74 114 Z" fill={HL} />
      <path d="M74 74 Q94 62 108 74" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <Note x="34" y="140" text="1 · крак на спирачката" tone={HL} />
      <circle cx="232" cy="80" r="34" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <circle cx="232" cy="80" r="22" fill={OK} opacity="0.18" stroke={OK} strokeWidth="3" />
      <text x="232" y="85" fill={OK} fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="inherit">
        СТАРТ
      </text>
      <Note x="188" y="140" text="2 · щракни стартера" tone={OK} />
      <Note x="188" y="34" text="лостът е на P" />
    </Frame>
  ),

  // Two pedals, right foot on the brake, held.
  "press-brake": () => (
    <Frame label="Схема: десният крак натиска и задържа работната спирачка">
      <path d="M20 148 H300" stroke={LINE} strokeWidth="2" />
      {/* brake, pressed */}
      <path d="M92 146 L86 96 L114 90 L122 142 Z" fill={HL} />
      {/* throttle, untouched */}
      <path d="M190 148 L184 106 L206 102 L214 144 Z" fill="none" stroke={LINE} strokeWidth="3" />
      <Note x="80" y="164" text="спирачка" tone={HL} />
      <Note x="186" y="164" text="газ" />
      {/* right leg: shin down to a shoe resting ON the brake face */}
      <path d="M134 28 L120 82" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M120 82 Q106 90 94 104 L110 120 Q126 106 136 92 Z" fill={INK} opacity="0.9" />
      <Note x="152" y="52" text="десният крак" tone={HL} />
      <Note x="152" y="66" text="натиска и ЗАДЪРЖА" tone={HL} />
      <Note x="152" y="88" text="докато включиш" />
      <Note x="152" y="102" text="предавка и пуснеш" />
      <Note x="152" y="116" text="ръчната спирачка" />
    </Frame>
  ),

  // The P R N D gate with the knob at D.
  "select-gear": () => (
    <Frame label="Схема на скоростния лост: P → R → N → D при задържана спирачка">
      <rect x="118" y="24" width="86" height="124" rx="18" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      {["P", "R", "N", "D"].map((g, i) => (
        <g key={g}>
          <text
            x="140"
            y={54 + i * 28}
            fill={g === "D" ? OK : DIM}
            fontSize="16"
            fontWeight="900"
            textAnchor="middle"
            fontFamily="inherit"
          >
            {g}
          </text>
        </g>
      ))}
      <path d="M170 44 V132" stroke={LINE} strokeWidth="6" strokeLinecap="round" />
      <circle cx="170" cy="128" r="12" fill={OK} />
      <path d="M170 46 V116" stroke={HL} strokeWidth="3" strokeDasharray="5 5" />
      <Note x="216" y="60" text="ляв бутон:" tone={HL} />
      <Note x="216" y="74" text="стъпка към D" tone={HL} />
      <Note x="216" y="100" text="десен бутон:" />
      <Note x="216" y="114" text="назад към P" />
      <Note x="18" y="140" text="Само при" />
      <Note x="18" y="154" text="натисната спирачка" tone={BAD} />
    </Frame>
  ),

  // Handbrake switch releasing, lamp going out.
  "release-handbrake": () => (
    <Frame label="Схема: ръчната се освобождава последна и лампата ѝ изгасва">
      <rect x="36" y="56" width="110" height="62" rx="12" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <rect x="70" y="72" width="42" height="30" rx="7" fill={LINE} />
      <path d="M91 68 V50" stroke={HL} strokeWidth="5" strokeLinecap="round" />
      <path d="M84 56 L91 46 L98 56" fill="none" stroke={HL} strokeWidth="3" strokeLinecap="round" />
      <Note x="40" y="136" text="освободи ключа" tone={HL} />
      <circle cx="228" cy="80" r="28" fill="none" stroke={LINE} strokeWidth="3" />
      <text x="228" y="88" fill={DIM} fontSize="22" fontWeight="900" textAnchor="middle" fontFamily="inherit">
        (P)
      </text>
      <path d="M206 100 L250 58" stroke={OK} strokeWidth="4" strokeLinecap="round" />
      <Note x="188" y="136" text="лампата изгасва" tone={OK} />
      <Note x="36" y="34" text="Последна е — до този момент тя държи колата." />
    </Frame>
  ),

  // Head with three gaze arrows: mirror, mirror, over the shoulder.
  "final-mirror-check": () => (
    <Frame label="Схема: огледало, огледало, поглед през рамо — в тази последователност">
      <circle cx="160" cy="96" r="20" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M160 116 Q136 122 132 148 H188 Q184 122 160 116 Z" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      {[
        { d: "M142 86 L66 56", label: "1 · ляво огледало", lx: 20, ly: 48 },
        { d: "M160 76 L160 36", label: "2 · вътрешно", lx: 124, ly: 26 },
        { d: "M180 104 L246 130", label: "3 · през рамо", lx: 216, ly: 150 },
      ].map((a) => (
        <g key={a.label}>
          <path d={a.d} stroke={HL} strokeWidth="3" strokeLinecap="round" />
          <Note x={a.lx} y={a.ly} text={a.label} tone={HL} />
        </g>
      ))}
      <Note x="20" y="164" text="Мъртвата зона не се вижда в никое огледало." tone={BAD} />
    </Frame>
  ),

  // Stalk down + the flashing left arrow.
  signal: () => (
    <Frame label="Схема: ляв мигач, подаден преди първия сантиметър движение">
      <ellipse cx="196" cy="88" rx="18" ry="52" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M180 78 L110 96" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <path d="M110 96 L96 100" stroke={HL} strokeWidth="10" strokeLinecap="round" />
      <path d="M74 76 L44 96 L74 116 V104 H100 V88 H74 Z" fill={HL} />
      <Note x="40" y="140" text="ляв мигач" tone={HL} />
      <Note x="24" y="34" text="Подай мигача, изчакай едно премигване" />
      <Note x="24" y="48" text="и чак тогава тръгвай." tone={HL} />
    </Frame>
  ),

  // Pulling out from the kerb with a car approaching from behind.
  "move-off": () => (
    <Frame label="Схема: потегляне от място след като си пропуснал движещите се по платното">
      <path d="M14 118 H306" stroke={LINE} strokeWidth="2" />
      <path d="M14 62 H306" stroke={LINE} strokeWidth="2" strokeDasharray="12 10" />
      {/* the student's car pulling out */}
      <rect x="96" y="94" width="60" height="24" rx="7" fill={HL} opacity="0.9" />
      <path d="M158 100 Q196 92 224 76" stroke={HL} strokeWidth="3" strokeDasharray="6 5" fill="none" />
      <path d="M218 82 L232 74 L224 88 Z" fill={HL} />
      {/* the car with priority */}
      <rect x="20" y="70" width="56" height="22" rx="7" fill="var(--surface)" stroke={INK} strokeWidth="3" />
      <path d="M82 81 H108" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M104 76 L114 81 L104 86 Z" fill={INK} />
      <Note x="20" y="60" text="има предимство — изчакай го" tone={BAD} />
      <Note x="96" y="140" text="ти" tone={HL} />
      <Note x="20" y="34" text="Потеглянето е маневра: мигач, поглед, после газ." />
    </Frame>
  ),
};

/**
 * The still for one pre-drive step. Pure, deterministic, no props beyond the
 * step id — swap-safe with the future clip (see `preDriveTutorialMedia`).
 */
export function PreDriveStill({ stepId }: { stepId: PreDriveStepId }) {
  const Draw = STILLS[stepId];
  return <Draw />;
}
