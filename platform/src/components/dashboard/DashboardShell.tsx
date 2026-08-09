"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  IconBook,
  IconBot,
  IconChalkboard,
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
import { TOPBAR_SLIDE_MS, useAutoHideTopbar } from "./autoHideTopbar";

interface NavItem {
  href: string;
  labelBg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelBg: "Начало", icon: IconHome },
  { href: "/theory", labelBg: "Теория", icon: IconBook },
  // Directly under „Теория", because it IS the theory — delivered by a teacher
  // instead of read off a card. It sat unlinked from 28 July to 3 August while
  // the founder was told the product had a chat window instead of a classroom.
  // Above „Изпити" on purpose: you sit the lesson before you sit the exam.
  { href: "/classroom", labelBg: "Класна стая", icon: IconChalkboard },
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
      // `min-h-11` — 44px, the same guarantee the option rows carry. Measured
      // before this (WebKit, tools/mobile/cli.mjs): 147.1 x 40 on every
      // dashboard surface, in both orientations, on both phone sizes. It is the
      // control a student uses to get back to Начало from anywhere, and 40px is
      // under every published thumb minimum. The WIDTH was never the problem.
      className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-lg font-extrabold tracking-tight"
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
  const pathname = usePathname();
  const topbar = useAutoHideTopbar(pathname);

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
    // A FLEX COLUMN BELOW `lg`, WHICH IS WHAT LETS A PAGE OWN THE SCREEN.
    //
    // It was a plain block, so <main> was exactly as tall as whatever the page
    // put in it and nothing could ask for the rest. Measured on the practice
    // runner (WebKit, iPhone 16 portrait): the question card ended at 55% of
    // the screen and the remaining 37.7% was bare backdrop — the founder's
    // „approximately half of the screen" with the halves swapped. A card cannot
    // reach the bottom of a screen its own container never reached.
    //
    // Nothing else moves: on every hub in this app the content is already
    // taller than the viewport (measured: /exams overflows 336px, /simulator
    // 58,719px), so `flex-1` on <main> is a no-op there. It only ever gives
    // room to a page that is SHORTER than the screen, which is the one case
    // that was broken.
    //
    // At `lg` the display becomes grid and the flex direction is inert.
    // THE ROOT IS 100dvh MINUS THE HOME INDICATOR, AND THE SUBTRACTION IS THE
    // WHOLE POINT. It was a bare `min-h-dvh`, and on the founder's phone that
    // one token made every page of this app taller than the screen it is on.
    //
    // The chain: app/layout ships `viewportFit: "cover"`, so the page owns the
    // whole display and env(safe-area-inset-*) is non-zero; globals.css pays the
    // inset back on <body> (`padding-bottom: env(safe-area-inset-bottom, 0px)`), so
    // <body>'s CONTENT box is 100dvh − 34px in portrait and 100dvh − 21px in
    // landscape. Asking for a full 100dvh inside that box overflows it by
    // exactly the inset — the document scrolls by 34/21px on every screen in the
    // product, forever, and the 34px it scrolls into is bare padding.
    //
    // That is not cosmetic. `useQuestionBudget` reads `scrollHeight − vh` as
    // „the question must give this back", and against a min-height FLOOR that
    // number never reaches zero — so the stem was cut by 34px on every
    // ResizeObserver tick until it hit its 62px floor. Measured on this tree,
    // WebKit, iPhone 16 with the real insets emulated, 20 heaviest questions per
    // surface: the stem was clamped to 62px on 20 of 20 portrait cases, hiding
    // up to 173px of the question, on BOTH runners — 0 of 20 clean in both
    // orientations. With this one calc: 40 of 40 portrait, and the stem is not
    // clamped on a single case there.
    //
    // Inert everywhere else: env() falls back to 0px on any display without a
    // cutout, and `calc(100dvh - 0px)` is `100dvh`.
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-bottom,0px))] flex-col lg:grid lg:grid-cols-[16rem_1fr]">
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
          was and the identity comes from the lit bottom lip instead.

          THE HEIGHT IS NOW STATED, AND IT SHRINKS WHEN THE SCREEN IS SHORT.
          It used to be whatever its contents came to (64px), which is 7.5% of a
          portrait phone and 16.3% of the same phone turned sideways — and on
          the landscape screens this bar was the ENTIRE gap between /exams and
          /simulator and the founder's 85% (measured 83.7%). `short:h-12`
          spends 48px there instead of 64, which is still 4px of clearance
          around a 44px control, and hands 4.1% of the screen back to the
          product on every landscape route at once.

          AND ON A QUESTION IT STANDS DOWN ENTIRELY — the second half of row C5.
          48px was not enough: portrait passes 18 of 18, landscape 14, and all
          four misses are UNDER 48px, i.e. this bar is the whole remaining gap.
          The founder ruled on the fix rather than on the number: hide it while
          a question is up, bring it back on a scroll up or a tap near the top
          edge. autoHideTopbar.ts holds the conditions, the machine and the
          reasons; what is here is the two things the DOM has to say.

          FIRST: `fixed` INSTEAD OF `sticky`, WHICH IS WHERE THE 48px COMES
          FROM. A sticky bar is still an in-flow flex item — translating it
          would slide a picture of the bar away and hand the page nothing. Out
          of flow, the content column below starts at y=0 and the question gets
          the 48px for real. The swap happens in the SAME commit that hides it,
          once, at arm time; only `transform` is ever animated, so no frame of
          this has the page reflowing under a moving element.

          SECOND: A FIXED BAR PAYS ITS OWN SAFE-AREA INSETS. `position: fixed`
          resolves against the viewport, not against <body>'s padded box
          (globals.css says so in as many words) — the same trap that put the
          nav drawer's rows 43px inside a landscape notch. So while it is fixed,
          and only then, the horizontal padding carries the inset itself. */}
      <header
        data-app-topbar
        data-topbar-armed={topbar.armed ? "on" : undefined}
        data-topbar-hidden={topbar.hidden ? "on" : undefined}
        // Focus entering the bar brings it back, so a keyboard or switch user
        // tabbing out of the skip link never lands on a control that is
        // painted off the top of the screen. Capture, so it fires for the
        // logo and the hamburger alike without either knowing about it.
        onFocusCapture={topbar.reveal}
        style={
          topbar.armed
            ? {
                paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
                paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
                transitionDuration: `${TOPBAR_SLIDE_MS}ms`,
              }
            : undefined
        }
        className={`console console-bottom z-40 flex h-16 items-center justify-between px-4 backdrop-blur short:h-12 lg:hidden ${
          topbar.armed
            ? `fixed inset-x-0 top-0 transition-transform ease-out motion-reduce:transition-none ${
                topbar.hidden ? "-translate-y-full" : "translate-y-0"
              }`
            : "sticky top-0"
        }`}
      >
        <Logo />
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          // 38 x 38 BEFORE THIS (20px icon + 8px padding a side + 1px border),
          // on every dashboard route, in both orientations, on both phone
          // sizes — the smallest violation the harness found anywhere in the
          // app and the one control every screen carries. `min-h-11 min-w-11`
          // states the 44px directly instead of hoping padding adds up to it.
          //
          // IT DID NOT SHRINK TO BUY THE 48px EITHER. That was the other option
          // on the table for row C5 and the founder rejected it by name: this
          // is the control row C6 was closed on („0 controls under 44px on any
          // dashboard route"), so the space came from moving the bar, not from
          // making the one thing on it smaller.
          className="btn-ghost min-h-11 min-w-11 rounded-xl p-2"
        >
          <IconMenu className="h-5 w-5" />
          <span className="visually-hidden">Отвори менюто</span>
        </button>
      </header>

      {/* THE WAY BACK, MADE VISIBLE — „a student who does not know it exists
          must not feel trapped".

          A lit 3px hairline with a short bright grabber at the top edge, drawn
          only while the bar is away. It is what a landscape phone shows instead
          of the bar's own lit bottom lip, and it says „there is chrome up here"
          without a shrunken control saying it.

          IT IS NOT A BUTTON, AND THAT IS THE POINT. A 3px <button> would be a
          control under 44px on a dashboard route — the exact row C6 finding the
          founder refused to pay for space — and a 44px one would be an
          invisible slab sitting on top of the question. So the affordance is
          decorative (`aria-hidden`, `pointer-events-none`) and the GESTURE is a
          passive pointer test over the top 44px, in autoHideTopbar.ts, that
          neither swallows the tap nor preventDefaults it. Keyboard users do not
          need it at all: focus entering the bar reveals it.

          AND IT COSTS THE QUESTION NOTHING. <main> carries `short:py-1` — 4px
          of top padding — so these 3px are drawn inside a gutter that already
          existed. Zero of the reclaimed 48px goes back, and no element on the
          page is overlapped by it. */}
      {topbar.armed && topbar.hidden ? (
        <div
          aria-hidden
          data-topbar-handle
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[3px] bg-gradient-to-b from-hair to-transparent lg:hidden"
        >
          {/* 64px of lit telemetry cyan, centred. Measured on the render: at
              `w-10` it read as a stray pixel on an 852px-wide screen. */}
          <span className="mx-auto block h-full w-16 rounded-b-full bg-accent-2 shadow-glow-2" />
        </div>
      ) : null}

      {/* Mobile slide-over.

          IT PAYS ITS OWN SAFE-AREA INSETS, and it is the one surface in the app
          shell that has to. globals.css gives <body> exactly the left/right/
          bottom padding that `viewport-fit=cover` took away — but this panel is
          `absolute` inside a `fixed` parent, so its containing block is the
          VIEWPORT, not that padded box, and none of it reaches here.

          Measured before this, WebKit, tools/mobile/stability-probe.mjs, on all
          five dashboard surfaces (the drawer is shell chrome, so every one of
          them had it):

            iPhone 16 landscape  every nav row 43px inside the 59px notch band;
                                 the panel's own bottom edge 21px into the home
                                 indicator
            iPhone 16 portrait   „Изход" 18px inside the 34px home-indicator band

          In landscape the notch is on the LEFT in one of the two rotations —
          which is the side this drawer opens from — so „Начало", „Теория" and
          „Изпити" were being drawn under the camera housing.

          The WIDTH grows by the inset rather than the content shrinking: the
          panel extends under the notch (where it is only background) and the
          18rem reading column stays 18rem. `max-w-[85vw]` still caps it.

          The top inset is included for completeness even though layout.tsx's
          `statusBarStyle: "black"` makes it 0 on this app today — if that ever
          becomes "black-translucent", this surface is already correct.

          AND IT SCROLLS, which is a separate defect the same capture exposed.
          The panel is `inset-y-0`, so it is exactly as tall as the viewport —
          393px on a landscape iPhone — and nine nav rows, a logo and „Изход"
          do not fit in it. They were not clipped, which would at least have
          looked wrong; they were simply rendered below the screen with no way
          to reach them. Measured (tools/mobile/notch-shot.mjs, iPhone 16
          landscape): „Настройки" 100px past the bottom edge and „Изход" 173px
          past it — the sign-out control, on the shared and school phones ADR-004
          is written about. `overscroll-contain` keeps the page underneath from
          taking over the gesture once the list hits its end. */}
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
            className="console console-right absolute inset-y-0 left-0 flex max-w-[85vw] flex-col gap-6 overflow-y-auto overscroll-contain pr-4 outline-none"
            style={{
              width: "calc(18rem + env(safe-area-inset-left, 0px))",
              paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
              paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openButtonRef.current?.focus();
                }}
                // Same 38x38 as the opener it mirrors, same 44px fix. It is the
                // only way out of a modal drawer on a touch screen.
                className="btn-ghost min-h-11 min-w-11 rounded-xl p-2"
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

      {/* `flex-1` + `flex flex-col` so <main> inside can stretch to the bottom
          of the screen.

          DELIBERATELY NO `min-h-0`. A flex item's `min-height: auto` resolves
          to its CONTENT size, which is the property that keeps a page taller
          than the phone (every hub in this app) from being squeezed into the
          viewport and overflowing its own box. With `min-h-0` the column would
          size to the screen and a 58,719px catalogue would hang out of it. So:
          this box is `max(content, the rest of the screen)`, which is both
          cases at once. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
