/**
 * Post-checkout status banner for /pricing (?status=...).
 * Server component; same visual language as the /exams message card.
 */

export type PricingStatus = "success" | "cancelled" | "unavailable" | "error";

export function parsePricingStatus(value: unknown): PricingStatus | null {
  return value === "success" ||
    value === "cancelled" ||
    value === "unavailable" ||
    value === "error"
    ? value
    : null;
}

const STYLES: Record<PricingStatus, string> = {
  success: "border-success/50 text-success",
  cancelled: "border-warning/50 text-warning",
  unavailable: "border-warning/50 text-warning",
  error: "border-danger/50 text-danger",
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
