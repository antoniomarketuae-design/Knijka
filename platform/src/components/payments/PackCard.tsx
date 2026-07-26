import type { CSSProperties } from "react";
import { IconCheck } from "@/components/icons";
import { Readout } from "@/components/ui/Readout";
import { formatPackPrice, type PackDefinition } from "@/modules/payments";

const untilFmt = new Intl.DateTimeFormat("bg-BG", { dateStyle: "long" });

/**
 * One purchasable pack. Server component — the buy button is a plain form
 * whose action (a server action) is passed in from the page.
 *
 * EVERY NUMBER AND EVERY BULLET COMES FROM `pack`. Nothing about the offer is
 * written here: prices are placeholders the founder is still deciding, and a
 * card that hardcoded one would quietly become a lie the day packs.ts changes.
 * The price uses <Readout> for the same reason the cluster's gauges do — a
 * tabular mono figure under a dim caption is the instrument voice, and it also
 * stops the two cards' prices from sitting on different baselines.
 *
 * `notIncludedBg` is the honest half of audit C-3. The bullets say what a pack
 * grants; without its mirror, "Пълна подготовка" reads as everything, and the
 * one thing it does NOT unlock is four scroll-lengths away in the comparison
 * table. Stating it next to the buy button is the difference between an honest
 * page and a technically-accurate one.
 */
export function PackCard({
  pack,
  highlighted = false,
  notIncludedBg,
  owned,
  ownedUntil,
  purchasable,
  buyAction,
  enterIndex,
}: {
  pack: PackDefinition;
  /** Visual emphasis for the premium pack. */
  highlighted?: boolean;
  /** What this pack does NOT unlock — must mirror a real gate, never marketing. */
  notIncludedBg?: string[];
  /** The user already has this access level active. */
  owned: boolean;
  /** Expiry to show when owned (null = no expiry / unknown). */
  ownedUntil: Date | null;
  /** False while Stripe is not configured → disabled "скоро" button. */
  purchasable: boolean;
  buyAction: (formData: FormData) => Promise<void>;
  /** Position in the page's shared entrance choreography. */
  enterIndex?: number;
}) {
  return (
    <section
      aria-labelledby={`pack-${pack.id}-title`}
      style={
        enterIndex === undefined
          ? undefined
          : ({ ["--enter-i" as string]: enterIndex } as CSSProperties)
      }
      className={`enter panel relative flex flex-col gap-5 p-5 sm:p-6 ${
        highlighted
          ? "border-accent/70 shadow-depth-2"
          : ""
      }`}
    >
      {highlighted ? (
        <>
          <span className="absolute -top-3 left-5 rounded-full bg-accent px-3 py-0.5 text-[11px] font-black uppercase tracking-wide text-accent-foreground shadow-glow-sm">
            Най-пълна подготовка
          </span>
          {/* A lit rim along the top edge — the cluster's way of saying "this
              instrument is the active one" without a coloured fill. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent"
          />
        </>
      ) : null}

      <div>
        <h3
          id={`pack-${pack.id}-title`}
          className="font-display text-lg font-extrabold tracking-tight"
        >
          {pack.nameBg}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{pack.taglineBg}</p>
      </div>

      <Readout
        label="Цена"
        value={formatPackPrice(pack.priceEurCents)}
        sub={`еднократно · ${pack.accessMonths} месеца достъп`}
        size="lg"
        tone={highlighted ? "accent" : "default"}
      />

      <div aria-hidden role="presentation" className="rule" />

      <ul className="flex flex-col gap-2.5">
        {pack.featuresBg.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm leading-relaxed">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
        {notIncludedBg?.map((missing) => (
          <li
            key={missing}
            className="flex items-start gap-2.5 text-sm leading-relaxed text-muted"
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center font-bold"
            >
              —
            </span>
            <span>
              <span className="visually-hidden">Не е включено: </span>
              {missing}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-1">
        {owned ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
              Активен
            </span>
            {ownedUntil ? (
              <span className="text-muted">до {untilFmt.format(ownedUntil)}</span>
            ) : null}
          </p>
        ) : purchasable ? (
          <form action={buyAction}>
            <input type="hidden" name="pack" value={pack.id} />
            <button type="submit" className="btn-accent w-full">
              Купи — {formatPackPrice(pack.priceEurCents)}
            </button>
          </form>
        ) : (
          // Fail-closed: no Stripe key ⇒ no way to start a payment, and the
          // button says so rather than pretending. The server action refuses
          // hand-crafted posts on the same condition (pricing/actions.ts).
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled
              className="btn-ghost w-full cursor-not-allowed opacity-60"
            >
              Скоро
            </button>
            <p className="text-center text-xs text-muted">
              Онлайн плащанията се активират съвсем скоро.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
