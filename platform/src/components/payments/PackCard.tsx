import { IconCheck } from "@/components/icons";
import { formatPackPrice, type PackDefinition } from "@/modules/payments";

const untilFmt = new Intl.DateTimeFormat("bg-BG", { dateStyle: "long" });

/**
 * One purchasable pack. Server component — the buy button is a plain form
 * whose action (a server action) is passed in from the page.
 */
export function PackCard({
  pack,
  highlighted = false,
  owned,
  ownedUntil,
  purchasable,
  buyAction,
}: {
  pack: PackDefinition;
  /** Visual emphasis for the premium pack. */
  highlighted?: boolean;
  /** The user already has this access level active. */
  owned: boolean;
  /** Expiry to show when owned (null = no expiry / unknown). */
  ownedUntil: Date | null;
  /** False while Stripe is not configured → disabled "скоро" button. */
  purchasable: boolean;
  buyAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section
      aria-labelledby={`pack-${pack.id}-title`}
      className={`card relative flex flex-col gap-4 p-5 sm:p-6 ${
        highlighted ? "border-accent shadow-glow-sm" : ""
      }`}
    >
      {highlighted ? (
        <span className="absolute -top-3 left-5 rounded-full bg-accent px-3 py-0.5 text-[11px] font-black uppercase tracking-wide text-accent-foreground">
          Най-пълна подготовка
        </span>
      ) : null}

      <div>
        <h3 id={`pack-${pack.id}-title`} className="text-lg font-extrabold">
          {pack.nameBg}
        </h3>
        <p className="mt-1 text-sm text-muted">{pack.taglineBg}</p>
      </div>

      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-black tabular-nums text-accent">
          {formatPackPrice(pack.priceEurCents)}
        </span>
        <span className="text-sm font-semibold text-muted">
          еднократно · {pack.accessMonths} месеца достъп
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        {pack.featuresBg.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        {owned ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
              Активен
            </span>
            {ownedUntil ? (
              <span className="text-muted">
                до {untilFmt.format(ownedUntil)}
              </span>
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
          <div className="flex flex-col gap-2">
            <button type="button" disabled className="btn-ghost w-full cursor-not-allowed opacity-60">
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
