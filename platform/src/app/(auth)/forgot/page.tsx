import type { Metadata } from "next";
import Link from "next/link";
import { RESET_TOKEN_TTL_MINUTES } from "@/modules/auth";
import { AuthFooterNote, AuthHeading } from "../auth-ui";
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
      <AuthHeading
        eyebrow="Възстановяване"
        title="Забравена парола"
        lead="Напиши имейла, с който си се регистрирал(а), и ти пращаме линк за нова парола."
      />
      <ForgotForm expiresInMinutes={RESET_TOKEN_TTL_MINUTES} />
      {/* The manual channel stays as the second line of defence — e.g. when the
          registration e-mail itself was mistyped, which no token can fix. */}
      <AuthFooterNote>
        Нямаш достъп до този имейл?{" "}
        <Link
          href="/contact"
          className="rounded font-semibold text-accent underline-offset-4 hover:underline"
        >
          Пиши ни
        </Link>{" "}
        и ще помогнем.
      </AuthFooterNote>
    </div>
  );
}
