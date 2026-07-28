"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  IconBook,
  IconBot,
  IconClipboardCheck,
  IconGear,
  IconHome,
  IconLogout,
  IconMenu,
  IconShield,
  IconStar,
  IconTrophy,
  IconWheel,
  IconX,
} from "@/components/icons";
import { isSoon, statusBadge } from "@/lib/routeStatus";

interface NavItem {
  href: string;
  labelBg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelBg: "Начало", icon: IconHome },
  { href: "/theory", labelBg: "Теория", icon: IconBook },
  { href: "/exams", labelBg: "Изпити", icon: IconClipboardCheck },
  { href: "/simulator", labelBg: "Симулатор", icon: IconWheel },
  // The third pillar. It sits directly under the simulator on purpose: hazard
  // perception is the safety half of the same promise, and burying it under
  // „AI Учител" would make the founder's differentiator look like a sub-feature
  // of exam prep — which is exactly what it is not.
  { href: "/hazard", labelBg: "Опасности", icon: IconShield },
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
      {NAV_ITEMS.map(({ href, labelBg, icon: Icon }) => {
        const soon = isSoon(href);
        const badge = statusBadge(href);
        const active = !soon && (pathname === href || pathname.startsWith(`${href}/`));
        const inner = (
          <>
            {/* Active channel indicator — a lit cyan telemetry bar */}
            <span
              aria-hidden
              className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-2 transition-opacity duration-200 motion-reduce:transition-none ${
                active ? "opacity-100 shadow-glow-2" : "opacity-0"
              }`}
            />
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{labelBg}</span>
            {badge ? (
              <span className="hud-label rounded-full border border-hair px-2 py-0.5 text-[10px]">
                {badge}
              </span>
            ) : null}
          </>
        );

        // "Скоро" items are not real destinations yet (no page, or held for
        // launch), so they render as an inert affordance — no <Link>, out of the
        // tab order, no pointer — instead of a link that 404s or looks shipped.
        if (soon) {
          return (
            <li key={href}>
              <span
                aria-disabled="true"
                tabIndex={-1}
                className="group pointer-events-none relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted opacity-60"
              >
                {inner}
              </span>
            </li>
          );
        }

        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-200 motion-reduce:transition-none ${
                active
                  ? "nav-live text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {inner}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * „Изход" — the target users are teenagers on shared/family/school computers,
 * so signing out must be one visible click from every authed screen.
 * signOut() clears the session cookie server-side and lands on the landing
 * page (redirectTo — next-auth v5 name for callbackUrl).
 */
function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: "/" })}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition duration-200 hover:bg-surface-2 hover:text-foreground motion-reduce:transition-none"
    >
      <IconLogout className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-left">Изход</span>
    </button>
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
      {/* Desktop sidebar — a console SLAB, not a column with a border on it:
          it catches the cabin light down the edge that faces the deck and drops
          a short shadow onto it (`.console` + `.console-right`, globals.css §9).
          The nav itself sits in a recessed channel so the lit active row reads
          as something switched ON inside a housing. */}
      <aside className="console console-right sticky top-0 hidden h-dvh flex-col gap-5 p-4 lg:flex">
        <Logo />
        <nav aria-label="Основна навигация" className="flex flex-1 flex-col">
          <div className="panel-head mb-3 pb-2">
            <p className="hud-label">Навигация</p>
            <span aria-hidden className="graticule w-16 self-center" />
          </div>
          <NavLinks />
        </nav>
        <div className="panel-inset px-3 py-2.5">
          <p className="hud-label">Обучение</p>
          <p className="mt-1 text-xs text-muted">
            Категория{" "}
            <strong className="metric text-sm text-foreground">B</strong> ·
            България
          </p>
        </div>
        <div className="border-t border-border pt-2">
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile topbar — the same console, laid flat. This is the ONE glass
          layer on a phone screen (doc 64 §7 budget), so the blur stays where it
          was and the identity comes from the lit bottom lip instead. */}
      <header className="console console-bottom sticky top-0 z-40 flex items-center justify-between px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="btn-ghost rounded-xl p-2"
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
            className="console console-right absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 p-4 outline-none"
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openButtonRef.current?.focus();
                }}
                className="btn-ghost rounded-xl p-2"
              >
                <IconX className="h-5 w-5" />
                <span className="visually-hidden">Затвори менюто</span>
              </button>
            </div>
            <nav aria-label="Основна навигация">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <div className="mt-auto border-t border-border pt-2">
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
