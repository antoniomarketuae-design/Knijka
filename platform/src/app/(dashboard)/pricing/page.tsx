import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  fulfillCheckout,
  getEntitlements,
  isStripeConfigured,
  PACKS,
} from "@/modules/payments";
import { ComparisonTable } from "@/components/payments/ComparisonTable";
import { FaqSection } from "@/components/payments/FaqSection";
import { PackCard } from "@/components/payments/PackCard";
import {
  parsePricingStatus,
  StatusBanner,
} from "@/components/payments/StatusBanner";
import { buyPackAction } from "./actions";

export const metadata: Metadata = {
  title: "Планове · Книжка.AI",
  description:
    "Еднократни пакети, без абонамент: пълна подготовка за теоретичния изпит с AI Учител, пробни изпити и симулатор.",
};

/** Stripe Checkout Session ids look like cs_test_... / cs_live_... */
const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{1,250}$/;

/**
 * /pricing — свободно срещу пакети, цени, статус след Stripe Checkout, FAQ.
 * Server component: реални entitlement-и на потребителя определят бутоните.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const status = parsePricingStatus(params.status);
  const sessionId = params.session_id;

  // Back from Stripe: fulfill best-effort for INSTANT access. The webhook is
  // the authoritative fulfiller; this call is idempotent (providerRef check),
  // so whichever lands first wins and the other becomes a no-op.
  if (
    status === "success" &&
    typeof sessionId === "string" &&
    SESSION_ID_RE.test(sessionId) &&
    isStripeConfigured()
  ) {
    try {
      await fulfillCheckout(sessionId);
    } catch (err) {
      console.warn("pricing: inline fulfillment failed (webhook will catch up)", err);
    }
  }

  const access = await getEntitlements(user.id);
  const purchasable = isStripeConfigured();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black sm:text-3xl">Планове</h1>
        <p className="mt-1 text-sm text-muted">
          Еднократно плащане, без абонамент. По-евтино от един учебен час зад
          волана.
        </p>
      </header>

      {status ? (
        <StatusBanner status={status} accessActive={access.hasCore} />
      ) : null}

      {/* Pack cards */}
      <div className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2">
        <PackCard
          pack={PACKS.core}
          owned={access.hasCore}
          ownedUntil={access.activeUntil}
          purchasable={purchasable}
          buyAction={buyPackAction}
        />
        <PackCard
          pack={PACKS.premium_sim}
          highlighted
          owned={access.hasPremium}
          ownedUntil={access.activeUntil}
          purchasable={purchasable}
          buyAction={buyPackAction}
        />
      </div>

      {/* Honest free-vs-paid comparison */}
      <section aria-labelledby="pricing-compare-title" className="flex flex-col gap-3">
        <h2 id="pricing-compare-title" className="text-base font-extrabold">
          Безплатно срещу пакетите — честно
        </h2>
        <ComparisonTable />
        <p className="text-xs leading-relaxed text-muted">
          Безплатният достъп е истински, не е промоция: дневна порция въпроси с
          обяснения и един пробен изпит, завинаги. Пакетите махат лимитите,
          когато решиш да се готвиш сериозно.
        </p>
      </section>

      <FaqSection />
    </div>
  );
}
