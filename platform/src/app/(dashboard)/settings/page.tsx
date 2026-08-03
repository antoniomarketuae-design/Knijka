import type { Metadata } from "next";
import Link from "next/link";
import { InstallPanel } from "@/components/pwa/InstallHint";
import { requireUser } from "@/modules/auth";
import { PasswordControls } from "./password-controls";
import { PrivacyControls } from "./privacy-controls";
import { PurchasesPanel } from "./purchases-panel";
import { SignOutButton } from "./signout-button";

export const metadata: Metadata = {
  title: "Настройки · Книжка.AI",
  description: "Акаунт, изход, лични данни и правна информация.",
};

const LEGAL_LINKS = [
  { href: "/terms", labelBg: "Условия за ползване" },
  { href: "/privacy", labelBg: "Политика за поверителност" },
  { href: "/cookies", labelBg: "Бисквитки" },
  { href: "/contact", labelBg: "Контакт" },
];

/**
 * /settings v1 — deliberately minimal (audit B1 documents the bigger version):
 * who am I, sign out, how to change my password, my GDPR rights (audit C-2:
 * export + erasure are real self-service actions here, not a mailto — the
 * users are minors and Art. 15/17 cannot depend on a mailbox someone reads),
 * and the legal documents. Theme toggle + exam-date/goal editing come with
 * the server-side onboarding columns (post-launch path in storage.ts).
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* Page header, in the cluster's voice: dim tracked-out mono channel name,
          bright title, then a graticule instead of a bare gap — the tick strip
          is what tells the eye this is a panel face and not a document. */}
      <header>
        <span className="hud-label">Акаунт · управление</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Настройки
        </h1>
        <div aria-hidden className="graticule mt-3 max-w-56" />
      </header>

      {/* Account identity */}
      <section
        aria-labelledby="settings-account-title"
        className="card framed p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div className="panel-head panel-head-bleed">
          <h2 id="settings-account-title" className="font-display text-base font-extrabold">
            Акаунт
          </h2>
          <span className="hud-label">Идентичност</span>
        </div>
        <dl className="flex flex-col gap-3">
          {user.name ? (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="hud-label w-28 shrink-0">Име</dt>
              <dd className="text-sm font-semibold">{user.name}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
            <dt className="hud-label w-28 shrink-0">Имейл</dt>
            <dd className="font-mono text-sm font-semibold">{user.email}</dd>
          </div>
        </dl>
        <div className="mt-5 border-t border-border pt-4">
          <SignOutButton />
        </div>
      </section>

      {/* Money. Second only to „who am I", because a student who is here about
          a purchase is here about the one thing that cost her real money — and
          until this block existed she had no amount, no date and no reference
          to quote at us. */}
      <PurchasesPanel userId={user.id} />

      {/* Password */}
      <section
        aria-labelledby="settings-password-title"
        className="card p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div className="panel-head panel-head-bleed">
          <h2 id="settings-password-title" className="font-display text-base font-extrabold">
            Парола
          </h2>
          <span className="hud-label">Достъп</span>
        </div>
        {/* THE PARAGRAPH THAT USED TO BE HERE SAID AUTOMATIC PASSWORD CHANGE
            "IS NOT READY YET" and sent students to a mailbox. It predated the
            /forgot flow by weeks and outlived it — so the product's own
            settings screen was advertising a gap that no longer existed, at the
            one place a worried student looks. */}
        <p className="text-sm leading-relaxed text-muted">
          Смени паролата си тук — искаме текущата за потвърждение. Ако си я
          забравил, поискай линк от{" "}
          <Link
            href="/forgot"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            „Забравена парола?“
          </Link>{" "}
          и ще ти пишем на имейла на акаунта.
        </p>
        <PasswordControls />
      </section>

      {/* Install to the home screen.

          THIS IS THE WAY BACK. The install bar (components/pwa/InstallHint.tsx)
          is dismissed PERMANENTLY — that is what „не, благодаря" has to mean if
          it is not going to be a nag — so the offer needs a place a student can
          walk to on purpose. Unlike the bar, this panel renders in every state,
          including „вече е инсталирано" and „ти отказа". */}
      <section
        aria-labelledby="settings-install-title"
        className="card p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div className="panel-head panel-head-bleed">
          <h2 id="settings-install-title" className="font-display text-base font-extrabold">
            Приложение
          </h2>
          <span className="hud-label">Начален екран</span>
        </div>
        <InstallPanel />
      </section>

      {/* GDPR: data + deletion */}
      <section
        aria-labelledby="settings-privacy-title"
        className="card framed p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div className="panel-head panel-head-bleed">
          <h2 id="settings-privacy-title" className="font-display text-base font-extrabold">
            Лични данни
          </h2>
          <span className="hud-label">GDPR</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Пазим само минимума: имейл, име, година на раждане и учебния ти
          напредък. Копие от всичко можеш да свалиш веднага като JSON файл, а
          изтриването на акаунта става тук и сега — без заявки и без чакане.
          Ако предпочиташ да ни пишеш (или го прави родител от твое име),{" "}
          <Link
            href="/contact"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            страницата за контакт
          </Link>{" "}
          също работи — отговаряме до един месец.
        </p>
        <PrivacyControls />
      </section>

      {/* Legal */}
      <section
        aria-labelledby="settings-legal-title"
        className="card p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div className="panel-head panel-head-bleed">
          <h2 id="settings-legal-title" className="font-display text-base font-extrabold">
            Правна информация
          </h2>
          <span className="hud-label">Документи</span>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map(({ href, labelBg }) => (
            <li key={href}>
              <Link
                href={href}
                className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                {labelBg}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
