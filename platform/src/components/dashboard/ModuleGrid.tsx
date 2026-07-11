import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  IconArrowRight,
  IconBook,
  IconBot,
  IconClipboardCheck,
  IconLock,
  IconWheel,
} from "@/components/icons";
import { isSoon, statusBadge } from "@/components/dashboard/availability";

interface ModuleCard {
  href: string;
  titleBg: string;
  descriptionBg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const MODULES: ModuleCard[] = [
  {
    href: "/theory",
    titleBg: "Теория",
    descriptionBg: "16 теми, адаптивна практика и преговор на грешките.",
    icon: IconBook,
  },
  {
    href: "/exams",
    titleBg: "Пробен изпит",
    descriptionBg: "45 въпроса · 97 точки · 40 минути — 1:1 с официалния формат.",
    icon: IconClipboardCheck,
  },
  {
    href: "/simulator",
    titleBg: "Симулатор",
    descriptionBg:
      "Кокпит шофиране по улиците на Студентски град — с инструктор в реално време.",
    icon: IconWheel,
  },
  {
    href: "/tutor",
    titleBg: "AI Учител",
    descriptionBg: "Питай защо — отговаря с цитат от закона, не по памет.",
    icon: IconBot,
  },
];

/** The four core module cards of the hub. */
export function ModuleGrid() {
  return (
    <section aria-labelledby="modules-title">
      <h2 id="modules-title" className="visually-hidden">
        Модули
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES.map(({ href, titleBg, descriptionBg, icon: Icon }) => {
          const soon = isSoon(href);
          const badge = statusBadge(href);
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition group-hover:shadow-glow-sm motion-reduce:transition-none">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="flex items-center gap-2">
                  {badge ? (
                    <span className="hud-label flex items-center gap-1 rounded-full border border-hair px-2.5 py-1 text-[10px]">
                      {soon ? <IconLock className="h-3 w-3" /> : null}
                      {badge}
                    </span>
                  ) : null}
                  {!soon ? (
                    <IconArrowRight
                      aria-hidden
                      className="h-5 w-5 text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent motion-reduce:transition-none"
                    />
                  ) : null}
                </span>
              </div>
              <h3 className="font-display text-base font-extrabold">{titleBg}</h3>
              <p className="text-sm leading-relaxed text-muted">{descriptionBg}</p>
            </>
          );

          // Not shipped for launch → an inert card, not a link that navigates
          // (aria-disabled alone never actually blocked the click).
          return (
            <li key={href}>
              {soon ? (
                <div
                  aria-disabled="true"
                  tabIndex={-1}
                  className="card group pointer-events-none flex h-full flex-col gap-3 p-5 opacity-70"
                >
                  {inner}
                </div>
              ) : (
                <Link
                  href={href}
                  className="card group flex h-full flex-col gap-3 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-glow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
