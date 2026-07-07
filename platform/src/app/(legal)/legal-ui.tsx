import type { ReactNode } from "react";

/**
 * Shared building blocks for the (legal) route group: /terms, /privacy,
 * /cookies, /contact.
 *
 * These pages are DRAFTS pending review by a lawyer (see <DraftBanner/>,
 * rendered on every page by the group layout). Founder-specific facts are
 * ALL-CAPS-BRACKET placeholders, exported from here so every page shows the
 * exact same string until it is replaced.
 *
 * Content decisions and open legal items are documented in
 * docs/legal/50_DATA_PRIVACY_AND_AI_ETHICS.md.
 */

// ---------------------------------------------------------------------------
// Founder placeholders — replace before launch (single source for all pages)
// ---------------------------------------------------------------------------

export const ENTITY_NAME = "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]";
export const ENTITY_EIK = "[ЕИК]";
export const ENTITY_ADDRESS = "[АДРЕС]";
export const CONTACT_EMAIL = "[ИМЕЙЛ ЗА КОНТАКТ]";
export const LAST_UPDATED = "[ДАТА]";

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** Mandatory pre-launch banner — visible on every legal page. */
export function DraftBanner() {
  return (
    <div role="status" className="border-b border-warning/40 bg-warning/10">
      <p className="mx-auto w-full max-w-6xl px-4 py-3 text-sm font-semibold leading-relaxed text-warning sm:px-6">
        Работна версия — подлежи на преглед от юрист преди официалния старт.
        Този текст не е правен съвет.
      </p>
    </div>
  );
}

/** Page heading + „последна промяна“ line. */
export function PageIntro({
  title,
  lead,
}: {
  title: string;
  lead: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Последна промяна: {LAST_UPDATED}
      </p>
      <p className="mt-4 text-base leading-relaxed text-muted">{lead}</p>
    </header>
  );
}

/** Table of contents for the long pages — anchors to <LegalSection/> ids. */
export function Toc({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Съдържание" className="card mb-10 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">
        Съдържание
      </p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {items.map(({ href, label }, i) => (
          <li key={href}>
            <a
              href={href}
              className="font-semibold text-accent hover:text-accent-soft"
            >
              {i + 1}. {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Numbered anchor section; `id` must match the TOC href. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-24">
      <h2 id={`${id}-title`} className="text-xl font-extrabold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Horizontal-scroll-safe table in the card language. */
export function LegalTable({
  caption,
  head,
  rows,
  minWidthClass = "min-w-[560px]",
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
  minWidthClass?: string;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className={`w-full ${minWidthClass} border-collapse text-left text-sm`}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-border-strong px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className={r > 0 ? "border-t border-border" : undefined}>
              {cells.map((cell, c) => (
                <td key={c} className="px-4 py-3 align-top leading-relaxed">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Contact card of the Bulgarian data-protection authority (КЗЛД). */
export function KzldCard() {
  return (
    <div className="card p-5 text-sm leading-relaxed">
      <p className="font-bold">
        Комисия за защита на личните данни (КЗЛД) — надзорният орган в България
      </p>
      <ul className="mt-2 space-y-1 text-muted">
        <li>Адрес: гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2</li>
        <li>
          Интернет страница:{" "}
          <a
            href="https://www.cpdp.bg"
            className="font-semibold text-accent hover:text-accent-soft"
          >
            www.cpdp.bg
          </a>
        </li>
        <li>
          Имейл:{" "}
          <a
            href="mailto:kzld@cpdp.bg"
            className="font-semibold text-accent hover:text-accent-soft"
          >
            kzld@cpdp.bg
          </a>
        </li>
      </ul>
      <p className="mt-3 text-muted">
        Жалба до КЗЛД можеш да подадеш безплатно, включително онлайн. Преди
        това ще се радваме да ни пишеш — почти винаги можем да решим въпроса
        по-бързо.
      </p>
    </div>
  );
}

/** „Кой стои зад платформата“ block — reused on /terms, /privacy, /contact. */
export function OperatorCard() {
  return (
    <div className="card p-5 text-sm leading-relaxed">
      <p className="font-bold">Книжка.AI се управлява от:</p>
      <ul className="mt-2 space-y-1 text-muted">
        <li>{ENTITY_NAME}</li>
        <li>ЕИК: {ENTITY_EIK}</li>
        <li>Адрес: {ENTITY_ADDRESS}</li>
        <li>
          Имейл: <span className="font-semibold text-foreground">{CONTACT_EMAIL}</span>
        </li>
      </ul>
    </div>
  );
}
