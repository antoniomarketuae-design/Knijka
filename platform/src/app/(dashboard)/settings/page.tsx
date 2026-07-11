import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
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
 * who am I, sign out, how to change my password, how to delete my data (GDPR —
 * users are minors, self-service deletion request must be one click away),
 * and the legal documents. Theme toggle + exam-date/goal editing come with
 * the server-side onboarding columns (post-launch path in storage.ts).
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <span className="hud-label">Акаунт · управление</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Настройки
        </h1>
      </header>

      {/* Account identity */}
      <section aria-labelledby="settings-account-title" className="card p-5 sm:p-6">
        <h2 id="settings-account-title" className="font-display text-base font-extrabold">
          Акаунт
        </h2>
        <dl className="mt-4 flex flex-col gap-3">
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
        <div className="mt-5 border-t border-hair pt-4">
          <SignOutButton />
        </div>
      </section>

      {/* Password */}
      <section aria-labelledby="settings-password-title" className="card p-5 sm:p-6">
        <h2 id="settings-password-title" className="font-display text-base font-extrabold">
          Парола
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Автоматичната смяна на парола още не е готова. Ако си забравил
          паролата си или искаш да я смениш, пиши ни през{" "}
          <Link
            href="/contact"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            страницата за контакт
          </Link>{" "}
          от имейла на акаунта — възстановяваме достъпа ръчно.
        </p>
      </section>

      {/* GDPR: data + deletion */}
      <section aria-labelledby="settings-privacy-title" className="card p-5 sm:p-6">
        <h2 id="settings-privacy-title" className="font-display text-base font-extrabold">
          Лични данни
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Пазим само минимума: имейл, име, година на раждане и учебния ти
          напредък. Имаш право по всяко време да поискаш копие от данните си
          или пълно изтриване на акаунта — достатъчно е да ни пишеш със свои
          думи, отговаряме до един месец. Родител или настойник също може да
          пише от твое име.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/contact" className="btn-ghost text-sm">
            Изтрий акаунта ми — заявка
          </Link>
          <Link
            href="/privacy#rights"
            className="btn-ghost text-sm"
          >
            Правата ти върху данните
          </Link>
        </div>
      </section>

      {/* Legal */}
      <section aria-labelledby="settings-legal-title" className="card p-5 sm:p-6">
        <h2 id="settings-legal-title" className="font-display text-base font-extrabold">
          Правна информация
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
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
