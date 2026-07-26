/**
 * Status banner for /pricing (?status=...).
 * Covers both post-checkout returns (success/cancelled/error/unavailable) and
 * free-tier cap landings (quota/exam-limit/sim-locked/tutor-limit) — every way
 * a user can be *sent* here must explain itself. There is one cap landing per
 * gate in modules/payments/quota.ts; adding a gate means adding a status.
 * Server component; same visual language as the /exams message card.
 */

import {
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_TUTOR_LIFETIME_MESSAGES,
  PACKS,
} from "@/modules/payments";

export type PricingStatus =
  | "success"
  | "cancelled"
  | "unavailable"
  | "error"
  | "quota"
  | "exam-limit"
  | "sim-locked"
  | "tutor-limit";

export function parsePricingStatus(value: unknown): PricingStatus | null {
  return value === "success" ||
    value === "cancelled" ||
    value === "unavailable" ||
    value === "error" ||
    value === "quota" ||
    value === "exam-limit" ||
    value === "sim-locked" ||
    value === "tutor-limit"
    ? value
    : null;
}

/** Border + ink + a faint wash of the same hue, so the banner reads as a lit
 *  panel rather than an outlined box on the near-black band. */
const STYLES: Record<PricingStatus, string> = {
  success: "border-success/50 bg-success/10 text-success",
  cancelled: "border-warning/50 bg-warning/10 text-warning",
  unavailable: "border-warning/50 bg-warning/10 text-warning",
  error: "border-danger/50 bg-danger/10 text-danger",
  // Cap landings are an invitation, not an error — accent, never red.
  quota: "border-accent/50 bg-accent/10 text-accent",
  "exam-limit": "border-accent/50 bg-accent/10 text-accent",
  "sim-locked": "border-accent/50 bg-accent/10 text-accent",
  "tutor-limit": "border-accent/50 bg-accent/10 text-accent",
};

/** Every landing except "success", whose copy depends on `accessActive`. */
const MESSAGES: Record<Exclude<PricingStatus, "success">, string> = {
  cancelled:
    "Плащането беше прекъснато. Нищо не е таксувано — можеш да опиташ отново, когато решиш.",
  unavailable:
    "Онлайн плащанията още не са активни. Пакетите ще бъдат достъпни съвсем скоро.",
  error:
    "Нещо се обърка при започването на плащането. Опитай отново — нищо не е таксувано.",
  quota: `Дневната безплатна порция от ${FREE_DAILY_PRACTICE_LIMIT} въпроса свърши. Утре има нова — или продължи без лимит с пакет.`,
  "exam-limit":
    "Безплатният пробен изпит е използван. Пакетите дават неограничени изпити в официалния формат.",
  "sim-locked": `Шофьорският симулатор влиза в пакет „${PACKS.premium_sim.nameBg}“. Теорията остава безплатна — симулаторът е отделният, по-голям пакет.`,
  "tutor-limit": `Безплатните ${FREE_TUTOR_LIFETIME_MESSAGES} въпроса към AI Учителя са използвани. И двата пакета му махат лимита.`,
};

export function StatusBanner({
  status,
  accessActive,
}: {
  status: PricingStatus;
  /** For "success": is the entitlement already visible? */
  accessActive?: boolean;
}) {
  const message =
    status === "success"
      ? accessActive
        ? "Плащането е прието — достъпът ти е активен. Успех на изпита!"
        : "Плащането е прието! Достъпът се активира до няколко минути — презареди страницата."
      : MESSAGES[status];

  return (
    <p
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm font-semibold leading-relaxed ${STYLES[status]}`}
    >
      {message}
    </p>
  );
}
