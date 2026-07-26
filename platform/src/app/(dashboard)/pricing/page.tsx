import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  fulfillCheckout,
  getEntitlements,
  isStripeConfigured,
  PACK_ACCESS_MONTHS,
  PACKS,
} from "@/modules/payments";
import { Readout } from "@/components/ui/Readout";
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

/** Position in the shared entrance choreography (globals.css §1). */
const step = (i: number) => ({ ["--enter-i" as string]: i }) as CSSProperties;

/**
 * /pricing — свободно срещу пакети, цени, статус след Stripe Checkout, FAQ.
 * Server component: реални entitlement-и на потребителя определят бутоните.
 *
 * WHY THE TOP OF THIS PAGE IS `data-surface="cluster-band"` AND THE BOTTOM IS
 * NOT. /pricing lives behind the login, inside the dashboard chrome, and
 * robots.ts lists it as a non-public route — so it cannot simply become a
 * marketing page: on a light-mode OS a fully cluster-scoped page would be a
 * black slab bolted to a light sidebar, which is the same seam this redesign
 * exists to remove, just moved. The band is the resolution: the OFFER (the
 * decision the visitor came to make) gets the instrument identity as a
 * deliberate, bounded showroom, and the REFERENCE below it — the honest
 * comparison and the FAQ, which are reading surfaces — stays in the app theme
 * the rest of the authenticated product uses. The split is also the
 * information hierarchy: the band is the pitch, everything under it is the
 * fine print you are invited to check it against.
 *
 * "cluster-band" rather than "cluster" so the scope does not claim the root's
 * colour-scheme — a bounded band must not repaint the scrollbars of a page it
 * does not own (globals.css §CLUSTER).
 *
 * NO PRICE IS WRITTEN ON THIS PAGE. Pricing strategy is undecided and the
 * numbers in packs.ts are placeholders, so every figure and every claim is
 * read from the packs module or from the free-tier constants the gates
 * actually enforce. That includes what was here before: the lead used to say
 * the packs cost less than one driving lesson — a comparative price claim
 * nothing in the codebase backs, made about a price that has not been chosen.
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
    <div className="flex flex-col gap-8">
      <section
        data-surface="cluster-band"
        aria-labelledby="pricing-title"
        className="grain relative overflow-hidden rounded-2xl border border-border bg-background px-5 py-7 text-foreground sm:px-8 sm:py-9"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-fade" />
        <div aria-hidden className="pointer-events-none absolute inset-0 haze" />

        <div className="relative">
          <header style={step(0)} className="enter">
            <p className="hud-label">Достъп</p>
            <h1
              id="pricing-title"
              className="mt-1.5 font-display text-2xl font-black tracking-tight sm:text-3xl"
            >
              Планове
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Плащаш веднъж и толкова. Няма абонамент, няма автоматично
              подновяване и няма запазена карта — а безплатното остава
              безплатно, не е промоция.
            </p>
          </header>

          {/* The three facts that decide whether a parent reads further, in the
              instrument voice. All three are contract, not copy: two come from
              packs.ts, and "няма подновяване" is the one-time-pack rule the
              whole payments module is built on (no Stripe subscription exists). */}
          <div
            style={step(1)}
            className="enter mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <Readout label="Плащане" value="Еднократно" size="sm" />
            <Readout
              label="Достъп"
              value={`${PACK_ACCESS_MONTHS} месеца`}
              size="sm"
              tone="cyan"
            />
            <Readout label="Подновяване" value="Няма" size="sm" />
          </div>

          {status ? (
            <div
              style={step(2)}
              className="enter mt-6"
            >
              <StatusBanner status={status} accessActive={access.hasCore} />
            </div>
          ) : null}

          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
            <PackCard
              pack={PACKS.core}
              owned={access.hasCore}
              ownedUntil={access.activeUntil}
              purchasable={purchasable}
              buyAction={buyPackAction}
              enterIndex={3}
              // C-3, said out loud where the buy button is: the simulator gate
              // (requireEntitlementForSimulator) rejects this pack, and the
              // comparison table is too far down to be the first place a buyer
              // learns it. Mirrors a real gate — never a marketing contrast.
              notIncludedBg={[
                `Шофьорски симулатор — той е само в „${PACKS.premium_sim.nameBg}“`,
              ]}
            />
            <PackCard
              pack={PACKS.premium_sim}
              highlighted
              owned={access.hasPremium}
              ownedUntil={access.activeUntil}
              purchasable={purchasable}
              buyAction={buyPackAction}
              enterIndex={4}
            />
          </div>
        </div>
      </section>

      {/* Honest free-vs-paid comparison */}
      <section aria-labelledby="pricing-compare-title" className="flex flex-col gap-3">
        <h2 id="pricing-compare-title" className="text-base font-extrabold">
          Безплатно срещу пакетите — честно
        </h2>
        <ComparisonTable />
        {/* Последното изречение е разликата между двата пакета, казана с думи:
            без нея по-скъпият изглежда като същото плюс отметка. */}
        <p className="text-xs leading-relaxed text-muted">
          Безплатният достъп е истински, не е промоция: дневна порция въпроси с
          обяснения, един пробен изпит и няколко въпроса към AI Учителя —
          завинаги. Пакетите махат лимитите, когато решиш да се готвиш сериозно.
          Шофьорският симулатор влиза само в „{PACKS.premium_sim.nameBg}“ — в
          по-малкия пакет го няма.
        </p>
      </section>

      <FaqSection />
    </div>
  );
}
