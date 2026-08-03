/**
 * „Моите покупки" — the /settings block that gives a student something to cite
 * and the founder something to search.
 *
 * A server component, deliberately: the rows come straight out of the payments
 * module on the server and nothing about someone's money needs to travel to the
 * browser as JSON or be re-fetched by a client island.
 *
 * THE THREE STATES ARE NOT DECORATION.
 *  - no rows       → say plainly that nothing was bought, and point at the
 *                    plans. An empty area with no sentence reads as a bug.
 *  - granted rows  → pack, date, amount, reference. The REFERENCE is the point:
 *                    it is the same string in her mail to us and in his Stripe
 *                    dashboard search box.
 *  - a receipt with no grant → money left her account and access never arrived.
 *                    It gets a warning treatment and an explicit "write to us,
 *                    quote this number", because the alternative — omitting the
 *                    row — shows the student who most needs help a page that
 *                    says she never paid.
 */

import Link from "next/link";
import { ContactEmail } from "@/components/legal/ContactEmail";
import { formatPaidAmount, listPurchases, type PurchaseRow } from "@/modules/payments";

/** „14 септември 2026 г." — the date form a Bulgarian reader expects. */
function formatDateBg(date: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Sofia",
  }).format(date);
}

function PurchaseCard({ row }: { row: PurchaseRow }) {
  const title = row.packNameBg ?? row.pack;
  const amount =
    row.amountCents !== null && row.currency !== null
      ? formatPaidAmount(row.amountCents, row.currency)
      : null;

  return (
    <li
      className={`rounded-xl border p-4 ${
        row.granted ? "border-border bg-surface-2/40" : "border-warning/40 bg-warning/10"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-sm font-extrabold">{title}</span>
        <span className="text-sm font-bold tabular-nums">
          {amount ?? "—"}
        </span>
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 text-xs">
        <div className="flex gap-3">
          <dt className="hud-label w-24 shrink-0">Дата</dt>
          <dd className="tabular-nums">{formatDateBg(row.at)}</dd>
        </div>
        {row.expiresAt && (
          <div className="flex gap-3">
            <dt className="hud-label w-24 shrink-0">Достъп до</dt>
            <dd className="tabular-nums">{formatDateBg(row.expiresAt)}</dd>
          </div>
        )}
        <div className="flex gap-3">
          {/* Selectable, monospaced and never truncated: its entire job is to be
              copied into an e-mail and pasted into a Stripe search. */}
          <dt className="hud-label w-24 shrink-0">Номер</dt>
          <dd className="break-all font-mono text-[0.7rem] leading-relaxed">
            {row.reference}
          </dd>
        </div>
        {row.livemode === false && (
          <div className="flex gap-3">
            <dt className="hud-label w-24 shrink-0">Режим</dt>
            <dd className="font-semibold text-warning">тестов (не е истинско плащане)</dd>
          </div>
        )}
      </dl>

      {!row.granted && (
        <p className="mt-3 border-t border-warning/30 pt-3 text-xs leading-relaxed text-warning">
          Плащането е получено, но достъпът не е активиран. Пиши ни на{" "}
          <ContactEmail className="font-semibold underline underline-offset-4" /> и
          посочи номера по-горе — ще го оправим или ще ти върнем сумата.
        </p>
      )}
    </li>
  );
}

/**
 * Split from the async wrapper below ON PURPOSE: an async server component
 * cannot be rendered by `renderToStaticMarkup`, and a payments screen nobody
 * has ever LOOKED at is not done (the R0 rule). This half takes rows and
 * returns markup, so the test can see what the student sees.
 */
export function PurchasesPanelView({ rows }: { rows: PurchaseRow[] }) {
  return (
    <section
      aria-labelledby="settings-purchases-title"
      className="card p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
    >
      <div className="panel-head panel-head-bleed">
        <h2
          id="settings-purchases-title"
          className="font-display text-base font-extrabold"
        >
          Моите покупки
        </h2>
        <span className="hud-label">Плащания</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Още нямаш покупки. Ако си платил и не виждаш плащането си тук, пиши ни
          на <ContactEmail /> — ще проверим веднага. Плановете са в{" "}
          <Link
            href="/pricing"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Цени
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <PurchaseCard key={row.reference} row={row} />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Пазим тези записи и след изтичане на достъпа. При въпрос за плащане
            пиши ни на <ContactEmail /> и посочи номера на покупката.
          </p>
        </>
      )}
    </section>
  );
}

export async function PurchasesPanel({ userId }: { userId: string }) {
  return <PurchasesPanelView rows={await listPurchases(userId)} />;
}
