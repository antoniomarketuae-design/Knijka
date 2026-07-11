/**
 * Status banner for /pricing (?status=...).
 * Covers both post-checkout returns (success/cancelled/error/unavailable) and
 * free-tier cap landings (quota/exam-limit) — every way a user can be *sent*
 * here must explain itself. Server component; same visual language as the
 * /exams message card.
 */

import { FREE_DAILY_PRACTICE_LIMIT } from "@/modules/payments";

export type PricingStatus =
  | "success"
  | "cancelled"
  | "unavailable"
  | "error"
  | "quota"
  | "exam-limit";

export function parsePricingStatus(value: unknown): PricingStatus | null {
  return value === "success" ||
    value === "cancelled" ||
    value === "unavailable" ||
    value === "error" ||
    value === "quota" ||
    value === "exam-limit"
    ? value
    : null;
}

const STYLES: Record<PricingStatus, string> = {
  success: "border-success/50 text-success",
  cancelled: "border-warning/50 text-warning",
  unavailable: "border-warning/50 text-warning",
  error: "border-danger/50 text-danger",
  // Cap landings are an invitation, not an error — accent, never red.
  quota: "border-accent/50 text-accent",
  "exam-limit": "border-accent/50 text-accent",
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
      : status === "cancelled"
        ? "Плащането беше прекъснато. Нищо не е таксувано — можеш да опиташ отново, когато решиш."
        : status === "unavailable"
          ? "Онлайн плащанията още не са активни. Пакетите ще бъдат достъпни съвсем скоро."
          : status === "quota"
            ? `Дневната безплатна порция от ${FREE_DAILY_PRACTICE_LIMIT} въпроса свърши. Утре има нова — или продължи без лимит с пакет.`
            : status === "exam-limit"
              ? "Безплатният пробен изпит е използван. Пакетите дават неограничени изпити в официалния формат."
              : "Нещо се обърка при започването на плащането. Опитай отново — нищо не е таксувано.";

  return (
    <p
      role="status"
      className={`card px-4 py-3 text-sm font-semibold ${STYLES[status]}`}
    >
      {message}
    </p>
  );
}
