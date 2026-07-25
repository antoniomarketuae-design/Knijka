import type { Metadata } from "next";
import Link from "next/link";
import { RESET_TOKEN_TTL_MINUTES } from "@/modules/auth";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Забравена парола | Книжка.AI",
  // Nothing here belongs in a search index, and a crawler following a reset
  // link would be one way to burn a student's token.
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-black">Забравена парола</h1>
      <p className="mb-6 text-sm text-muted">
        Напиши имейла, с който си се регистрирал(а), и ти пращаме линк за нова
        парола.
      </p>
      <ForgotForm expiresInMinutes={RESET_TOKEN_TTL_MINUTES} />
      {/* The manual channel stays as the second line of defence — e.g. when the
          registration e-mail itself was mistyped, which no token can fix. */}
      <p className="mt-6 text-center text-xs text-muted">
        Нямаш достъп до този имейл?{" "}
        <Link
          href="/contact"
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          Пиши ни
        </Link>{" "}
        и ще помогнем.
      </p>
    </div>
  );
}
