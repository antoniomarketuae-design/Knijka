"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type SVGProps } from "react";
import { IconX } from "@/components/icons";
import {
  getDeferredPrompt,
  promptInstall,
  subscribeDeferredPrompt,
} from "@/lib/pwa/deferredPrompt";
import {
  installHintAllowed,
  installSurface,
  isStandalone,
  readDismissed,
  writeDismissed,
  clearDismissed,
  type InstallEnvironment,
  type InstallSurface,
} from "@/lib/pwa/install";

/* -------------------------------------------------------------------------
   Two glyphs that only mean anything here.

   They are NOT in components/icons.tsx on purpose: the share box-and-arrow is
   Apple's own UI symbol and the only place it is honest to draw it is next to
   an instruction to press Apple's own Share button. A generic "share" icon in
   the shared set would eventually get used for sharing something, and this is
   not that.
   ------------------------------------------------------------------------- */

function IconIosShare(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function IconAddToHomeScreen(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Reads the install environment on the client and keeps it current.
 *
 * `null` until the first effect runs. That is not laziness — it is the fix for
 * the one bug this component genuinely risks: every input here (user agent,
 * display mode, localStorage, a captured event) exists only in the browser, so
 * rendering anything during SSR would either produce a hydration mismatch or
 * flash a bar at a student who already installed the app.
 *
 * Three things can change it while the page is open, and all three are
 * subscribed: the deferred prompt arriving or being spent, the app being
 * installed (`appinstalled`, which flips display-mode without a navigation),
 * and the display-mode media query itself.
 */
function useInstallEnvironment(): [InstallEnvironment | null, () => void] {
  const [env, setEnv] = useState<InstallEnvironment | null>(null);

  const measure = useCallback((): InstallEnvironment => {
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints ?? 0,
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      iosStandalone: nav.standalone === true,
      hasDeferredPrompt: getDeferredPrompt() !== null,
      dismissed: readDismissed(window.localStorage),
    };
  }, []);

  // The refresh the ACTIONS call. It has to re-read the environment rather
  // than merely re-render: `dismissed` lives in localStorage, and a component
  // that re-renders against the environment it measured at mount shows the bar
  // again immediately after the student closed it. (It did. This is that fix.)
  const refresh = useCallback(() => setEnv(measure()), [measure]);

  useEffect(() => {
    setEnv(measure());
    const update = () => setEnv(measure());

    const unsubscribe = subscribeDeferredPrompt(update);
    window.addEventListener("appinstalled", update);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", update);

    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", update);
      media.removeEventListener("change", update);
    };
  }, [measure]);

  return [env, refresh];
}

/** „Отвори менюто за споделяне ⇧ и избери Добави към Начален екран." */
function IosSteps({ compact = false }: { compact?: boolean }) {
  return (
    <ol className="mt-2 flex flex-col gap-1.5 text-xs text-muted">
      <li className="flex items-center gap-2">
        <IconIosShare className="h-4 w-4 shrink-0 text-accent" />
        <span>
          Натисни бутона <strong className="text-foreground">Сподели</strong> в
          Safari.
        </span>
      </li>
      <li className="flex items-center gap-2">
        <IconAddToHomeScreen className="h-4 w-4 shrink-0 text-accent" />
        <span>
          Избери{" "}
          <strong className="text-foreground">Добави към Начален екран</strong>.
        </span>
      </li>
      {compact ? null : (
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-4 w-4 shrink-0 text-center text-accent">
            ✓
          </span>
          <span>Отвори Книжка.AI от иконата, а не от браузъра.</span>
        </li>
      )}
    </ol>
  );
}

/**
 * The one sentence that justifies the whole feature — and the one claim it is
 * NOT allowed to make.
 *
 * Measured on the founder's own iPhone 16 in landscape: Safari's chrome is
 * ~19% of the screen height before the road gets a pixel, and on iOS there is
 * no API that can remove it (the Fullscreen API does not exist for non-video
 * elements there). Installed, in `display: standalone`, that strip is gone.
 *
 * It is the SAME engine running the SAME code, so it is not faster and it is
 * not smaller. Saying so plainly is cheaper than the credibility of a claim a
 * student can disprove in ten seconds.
 */
const PITCH =
  "Отваря се като приложение — без лентата с адреса, която изяжда около 1/5 от екрана. Същата програма, само повече място за пътя.";

function useInstallActions(onChange: () => void) {
  const install = useCallback(async () => {
    const outcome = await promptInstall();
    // „dismissed" here is the OS sheet being cancelled, not our own bar being
    // closed — do not persist a refusal for it. The student may well press the
    // button again a second later, and a permanent flag would make that
    // impossible.
    if (outcome === "accepted") writeDismissed(window.localStorage);
    onChange();
  }, [onChange]);

  const dismiss = useCallback(() => {
    writeDismissed(window.localStorage);
    onChange();
  }, [onChange]);

  return { install, dismiss };
}

/**
 * THE HINT — a dismissible bar, route-gated, shown only when the browser can
 * actually do something with it.
 *
 * WHERE IT IS ALLOWED: `installHintAllowed()` in lib/pwa/install.ts, which is
 * an allow-list of two routes and explains why each of the excluded ones would
 * be a regression (the sim's screen budget, and the pinned „Провери"/„Следващ"
 * controls the mobile-fold work put at the bottom of the runners).
 *
 * WHEN IT IS ALLOWED: `installSurface()` — never in standalone, never after a
 * refusal, never inside an Instagram/Viber webview that has no Add to Home
 * Screen at all, and on iOS only as an instruction because Safari exposes no
 * install API.
 */
export function InstallHint() {
  const pathname = usePathname();
  const [env, refresh] = useInstallEnvironment();
  const { install, dismiss } = useInstallActions(refresh);
  const [showSteps, setShowSteps] = useState(false);

  if (!env) return null;
  if (!installHintAllowed(pathname)) return null;

  const surface: InstallSurface = installSurface(env);
  if (surface === "none") return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-3 pt-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        role="region"
        aria-label="Инсталиране на приложението"
        className="mx-auto flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.9)] backdrop-blur [@media(max-height:460px)]:gap-2 [@media(max-height:460px)]:p-2"
      >
        {/* The mark goes first when the viewport is short. Measured at
            844x390: with the badge and the full padding the bar was 64px —
            16.4% of a landscape phone. Dropping the badge and tightening the
            padding is most of the way back, and a bar that identifies itself
            in words does not need a logo to do it twice. */}
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-black text-accent-foreground [@media(max-height:460px)]:hidden"
        >
          К
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">
            Добави Книжка.AI на екрана си
          </p>
          {/* Dropped when the viewport is SHORT, which on a phone means
              landscape — the exact orientation this whole run is about. The
              variant is a height query, not a width one: a 844x390 phone is
              wide and has no room, and a narrow desktop window is the opposite.
              This bar must never become the problem it exists to solve. */}
          <p
            className={`mt-0.5 text-xs text-muted [@media(max-height:460px)]:hidden ${
              showSteps ? "" : "line-clamp-2"
            }`}
          >
            {PITCH}
          </p>
          {surface === "ios-share" && showSteps ? <IosSteps /> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {surface === "android-prompt" ? (
            <button
              type="button"
              onClick={install}
              className="btn-accent px-3.5 py-2 text-xs"
            >
              Инсталирай
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSteps((v) => !v)}
              aria-expanded={showSteps}
              className="btn-ghost px-3.5 py-2 text-xs"
            >
              {showSteps ? "Скрий" : "Как?"}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="btn-ghost rounded-xl border-transparent p-2 text-muted"
          >
            <IconX className="h-4 w-4" />
            <span className="visually-hidden">Не, благодаря</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * THE WAY BACK. The bar above is dismissed permanently — that is what „не,
 * благодаря" has to mean if it is not going to be a nag — so the offer has to
 * live somewhere a student can find it on purpose. This panel is that place
 * (/settings), and unlike the bar it renders in every state, including the two
 * the bar is silent in: already installed, and previously declined.
 */
export function InstallPanel() {
  const [env, refresh] = useInstallEnvironment();
  const { install } = useInstallActions(refresh);

  if (!env) {
    return (
      <p className="text-sm text-muted">Проверяваме дали устройството поддържа инсталиране…</p>
    );
  }

  if (isStandalone(env)) {
    return (
      <p className="text-sm text-muted">
        Вече използваш Книжка.AI като приложение — лентата на браузъра е скрита
        и екранът е изцяло за приложението.
      </p>
    );
  }

  // The refusal must not silence THIS surface: the student navigated here to
  // find it. Clear the flag so the offer is live again from now on.
  const live: InstallEnvironment = { ...env, dismissed: false };
  const surface = installSurface(live);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{PITCH}</p>
      <p className="text-xs text-muted">
        Не става по-бързо и не тежи по-малко — това е същият браузър и същият
        код. Печелиш екран и икона.
      </p>

      {surface === "android-prompt" ? (
        <button
          type="button"
          onClick={() => {
            clearDismissed(window.localStorage);
            void install();
          }}
          className="btn-accent self-start text-xs"
        >
          Инсталирай приложението
        </button>
      ) : surface === "ios-share" ? (
        <IosSteps />
      ) : (
        <p className="text-xs text-muted">
          Този браузър не предлага инсталиране. Отвори Книжка.AI в Safari (на
          iPhone) или в Chrome (на Android) и опитай оттам.
        </p>
      )}
    </div>
  );
}
