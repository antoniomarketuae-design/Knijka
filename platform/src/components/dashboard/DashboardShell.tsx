"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  IconBook,
  IconBot,
  IconClipboardCheck,
  IconGear,
  IconHome,
  IconMenu,
  IconStar,
  IconTrophy,
  IconWheel,
  IconX,
} from "@/components/icons";

interface NavItem {
  href: string;
  labelBg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelBg: "Начало", icon: IconHome },
  { href: "/theory", labelBg: "Теория", icon: IconBook },
  { href: "/exams", labelBg: "Изпити", icon: IconClipboardCheck },
  { href: "/simulator", labelBg: "Симулатор", icon: IconWheel, soon: true },
  { href: "/tutor", labelBg: "AI Учител", icon: IconBot },
  { href: "/leaderboard", labelBg: "Класация", icon: IconTrophy },
  { href: "/pricing", labelBg: "Планове", icon: IconStar },
  { href: "/settings", labelBg: "Настройки", icon: IconGear },
];

function Logo() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 rounded-lg px-2 py-1 text-lg font-extrabold tracking-tight"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
      >
        К
      </span>
      <span>
        Книжка<span className="text-accent">.AI</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, labelBg, icon: Icon, soon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition motion-reduce:transition-none ${
                active
                  ? "bg-accent/15 text-accent shadow-glow-sm"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{labelBg}</span>
              {soon ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                  Скоро
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Dashboard chrome: fixed sidebar on desktop, topbar + slide-over drawer on
 * mobile. Client component only because of the drawer state and active-link
 * highlighting — all data stays in server components.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the drawer; focus moves into it on open, back on close.
  // (Navigation closes it too — every drawer link calls onNavigate.)
  useEffect(() => {
    if (!open) return;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        openButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
        <Logo />
        <nav aria-label="Основна навигация" className="flex-1">
          <NavLinks />
        </nav>
        <p className="px-2 text-xs text-muted">
          Учиш за категория <strong className="text-foreground">B</strong> ·
          България
        </p>
      </aside>

      {/* Mobile topbar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded-xl border border-border p-2 text-foreground transition hover:bg-surface-2 motion-reduce:transition-none"
        >
          <IconMenu className="h-5 w-5" />
          <span className="visually-hidden">Отвори менюто</span>
        </button>
      </header>

      {/* Mobile slide-over */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button
            type="button"
            aria-label="Затвори менюто"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            id="mobile-nav"
            ref={drawerRef}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-border bg-surface p-4 outline-none"
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openButtonRef.current?.focus();
                }}
                className="rounded-xl border border-border p-2 text-foreground transition hover:bg-surface-2 motion-reduce:transition-none"
              >
                <IconX className="h-5 w-5" />
                <span className="visually-hidden">Затвори менюто</span>
              </button>
            </div>
            <nav aria-label="Основна навигация">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      ) : null}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
