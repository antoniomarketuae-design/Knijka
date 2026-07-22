import type { Metadata } from "next";
import Link from "next/link";
import { fulfillCheckout, isStripeConfigured } from "@/modules/payments";

export const metadata: Metadata = { title: "Плащане · резултат | Книжка.AI" };

type Props = { searchParams: Promise<{ session_id?: string }> };

/**
 * Return page for embedded Checkout (Stripe redirects here with the session
 * id). We fulfill best-effort for INSTANT access; the webhook remains the
 * authoritative path, and fulfillCheckout() is idempotent, so both racing is
 * safe. Delayed methods (money not cleared yet) show a "processing" state —
 * the async webhook grants access when it lands.
 */
export default async function CheckoutReturnPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  let state: "paid" | "pending" | "error" = "error";
  if (isStripeConfigured() && session_id) {
    try {
      const result = await fulfillCheckout(session_id);
      state =
        result.status === "created" || result.status === "already-fulfilled"
          ? "paid"
          : "pending";
    } catch {
      state = "error";
    }
  }

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      {state === "paid" ? (
        <>
          <div
            aria-hidden
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-3xl text-success"
          >
            ✓
          </div>
          <h1 className="mt-5 text-2xl font-black">Плащането е успешно!</h1>
          <p className="mt-2 text-muted">
            Достъпът ти е активиран. Успех на изпита!
          </p>
          <Link href="/dashboard" className="btn-accent mt-6 inline-flex">
            Към таблото
          </Link>
        </>
      ) : state === "pending" ? (
        <>
          <h1 className="text-2xl font-black">Обработваме плащането…</h1>
          <p className="mt-2 text-muted">
            Плащането ти се потвърждава. Достъпът ще се активира автоматично
            веднага щом сумата постъпи — можеш да затвориш този прозорец.
          </p>
          <Link href="/dashboard" className="btn-ghost mt-6 inline-flex">
            Към таблото
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-black">Нещо се обърка</h1>
          <p className="mt-2 text-muted">
            Не успяхме да потвърдим плащането. Ако сумата е удържана, достъпът
            ще се активира автоматично до няколко минути.
          </p>
          <Link href="/pricing" className="btn-ghost mt-6 inline-flex">
            Към плановете
          </Link>
        </>
      )}
    </div>
  );
}
