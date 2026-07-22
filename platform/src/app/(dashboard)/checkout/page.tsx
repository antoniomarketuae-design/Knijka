import type { Metadata } from "next";
import Link from "next/link";
import {
  formatPackPrice,
  isPackId,
  isStripeConfigured,
  PACKS,
} from "@/modules/payments";
import { EmbeddedCheckoutForm } from "@/components/payments/EmbeddedCheckoutForm";

export const metadata: Metadata = { title: "Плащане | Книжка.AI" };

type Props = { searchParams: Promise<{ pack?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { pack } = await searchParams;

  if (!isPackId(pack)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-2xl font-black">Изберете пакет</h1>
        <p className="mt-2 text-muted">
          Не открихме избран пакет за плащане. Върнете се към плановете и
          изберете.
        </p>
        <Link href="/pricing" className="btn-accent mt-6 inline-flex">
          Към плановете
        </Link>
      </div>
    );
  }

  const def = PACKS[pack];
  // The embedded page needs BOTH the secret (server) and the publishable key
  // (client). Missing either degrades gracefully, never crashes.
  const canPay =
    isStripeConfigured() &&
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="flex flex-col gap-4">
        <Link
          href="/pricing"
          className="text-sm font-semibold text-muted transition hover:text-foreground"
        >
          ← Към плановете
        </Link>
        <div className="card p-6">
          <span className="text-xs font-black uppercase tracking-wider text-accent">
            {def.taglineBg}
          </span>
          <h1 className="mt-1 text-2xl font-black">{def.nameBg}</h1>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tabular-nums">
              {formatPackPrice(def.priceEurCents)}
            </span>
            <span className="text-sm text-muted">
              еднократно · {def.accessMonths} месеца достъп
            </span>
          </div>
          <ul className="mt-5 flex flex-col gap-2 text-sm">
            {def.featuresBg.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-success">
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
            Сигурно плащане чрез Stripe · карта, Apple Pay и Revolut Pay · без
            абонамент, без автоматично подновяване.
          </p>
        </div>
      </aside>

      <section className="card min-h-[560px] p-4 sm:p-6">
        {canPay ? (
          <EmbeddedCheckoutForm pack={pack} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <h2 className="text-lg font-black">Плащането е временно недостъпно</h2>
            <p className="max-w-sm text-sm text-muted">
              Онлайн плащането ще бъде активно съвсем скоро. Благодарим за
              търпението!
            </p>
            <Link href="/pricing" className="btn-ghost mt-2 inline-flex">
              Назад към плановете
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
