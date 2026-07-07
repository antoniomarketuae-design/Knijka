import type { Metadata } from "next";
import { SimulatorClient } from "./simulator-client";

export const metadata: Metadata = { title: "Симулатор · Книжка.AI" };

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

const CONTROLS: Array<{ keys: string[]; label: string }> = [
  { keys: ["W", "↑"], label: "газ" },
  { keys: ["S", "↓"], label: "спирачка / назад" },
  { keys: ["A", "D"], label: "волан" },
  { keys: ["Space"], label: "ръчна спирачка" },
  { keys: ["C"], label: "смяна на камера" },
  { keys: ["R"], label: "връщане на старта" },
  { keys: ["Esc"], label: "пауза" },
];

/**
 * „Тестово каране" — early tech demo of the driving simulator physics.
 * The heavy 3D bundle loads client-side only (see simulator-client.tsx).
 */
export default function SimulatorPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Тестово каране</h1>
          <span className="rounded-full border border-warning px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
            Рано демо
          </span>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Първи поглед към физиката на симулатора: учебен автомобил (измислен
          модел, ~1.2 т) на затворено трасе с конуси и бордюри. Карай слалома
          на северната права и пробвай жълтия бордюр — колата трябва да го
          преживее на ~50 км/ч.
        </p>
      </header>

      <SimulatorClient />

      <section aria-label="Управление" className="card px-4 py-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          {CONTROLS.map(({ keys, label }) => (
            <li key={label} className="flex items-center gap-1.5">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1.5">
                  {i > 0 ? <span className="text-muted/60">/</span> : null}
                  <Key>{k}</Key>
                </span>
              ))}
              <span>{label}</span>
            </li>
          ))}
          <li className="text-muted/80">Геймпад: ляв стик + тригери</li>
        </ul>
      </section>
    </div>
  );
}
