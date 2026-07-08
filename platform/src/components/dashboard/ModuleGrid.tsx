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

interface ModuleCard {
  href: string;
  titleBg: string;
  descriptionBg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  soon?: boolean;
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
    descriptionBg: "Кокпит шофиране в браузъра — в разработка.",
    icon: IconWheel,
    soon: true,
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
        {MODULES.map(({ href, titleBg, descriptionBg, icon: Icon, soon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-disabled={soon || undefined}
              className={`card group flex h-full flex-col gap-3 p-5 transition duration-200 motion-reduce:transition-none ${
                soon
                  ? "opacity-70"
                  : "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-glow-sm motion-reduce:hover:translate-y-0"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition group-hover:shadow-glow-sm motion-reduce:transition-none">
                  <Icon className="h-6 w-6" />
                </span>
                {soon ? (
                  <span className="hud-label flex items-center gap-1 rounded-full border border-hair px-2.5 py-1 text-[10px]">
                    <IconLock className="h-3 w-3" />
                    Скоро
                  </span>
                ) : (
                  <IconArrowRight
                    aria-hidden
                    className="h-5 w-5 text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent motion-reduce:transition-none"
                  />
                )}
              </div>
              <h3 className="font-display text-base font-extrabold">{titleBg}</h3>
              <p className="text-sm leading-relaxed text-muted">
                {descriptionBg}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
