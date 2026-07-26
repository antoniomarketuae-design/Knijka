import type { Metadata } from "next";
import Link from "next/link";
import { verifyPasswordResetToken } from "@/modules/auth";
import { AuthFooterNote, AuthHeading } from "../auth-ui";
import { RESET_TOKEN_PROBLEM_BG } from "./reset-contract";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Нова парола | Книжка.AI",
  robots: { index: false, follow: false },
  // The token is in the query string (the only place a mail client can put
  // it), so suppress the Referer header — otherwise any outbound link or
  // third-party request from this page would leak a live reset token.
  referrer: "no-referrer",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  // Read-only check — it must not consume the token, or a mail client that
  // pre-fetches links would burn the reset before the student saw the form
  // (modules/auth reset.ts).
  const verdict = await verifyPasswordResetToken(token);

  if (!verdict.ok) {
    return (
      <div>
        <AuthHeading
          eyebrow="Възстановяване"
          title="Линкът не работи"
          lead={RESET_TOKEN_PROBLEM_BG[verdict.error]}
        />
        <Link href="/forgot" className="btn-accent inline-flex w-full justify-center">
          Поискай нов линк
        </Link>
        <AuthFooterNote>
          Сети се паролата?{" "}
          <Link
            href="/login"
            className="rounded font-semibold text-accent underline-offset-4 hover:underline"
          >
            Влез
          </Link>
        </AuthFooterNote>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        eyebrow="Възстановяване"
        title="Нова парола"
        lead="Избери нова парола за акаунта си. След това те пускаме направо вътре."
      />
      <ResetForm token={token} />
    </div>
  );
}
