import type { Metadata } from "next";
import Link from "next/link";
import { verifyPasswordResetToken } from "@/modules/auth";
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
        <h1 className="mb-1 font-display text-2xl font-black">Линкът не работи</h1>
        <p className="mb-6 text-sm text-muted">
          {RESET_TOKEN_PROBLEM_BG[verdict.error]}
        </p>
        <Link href="/forgot" className="btn-accent inline-flex w-full justify-center">
          Поискай нов линк
        </Link>
        <p className="mt-4 text-center text-sm text-muted">
          Сети се паролата?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Влез
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-black">Нова парола</h1>
      <p className="mb-6 text-sm text-muted">
        Избери нова парола за акаунта си. След това те пускаме направо вътре.
      </p>
      <ResetForm token={token} />
    </div>
  );
}
