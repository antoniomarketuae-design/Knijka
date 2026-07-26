import type { Metadata } from "next";
import Link from "next/link";
import { AuthFooterNote, AuthHeading } from "../auth-ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход | Книжка.AI",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.callbackUrl;
  // Only allow same-origin relative paths — never an open redirect.
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : "/dashboard";

  // Set by /reset when the password changed but the automatic sign-in did not
  // go through — without it that redirect looks like the reset silently failed.
  const resetDone = params.reset === "1";

  return (
    <div>
      <AuthHeading
        eyebrow="Достъп"
        title="Вход"
        lead="Влез в акаунта си, за да продължиш обучението."
      />

      {resetDone && (
        <p
          role="status"
          className="mb-5 rounded-lg border border-success/50 bg-success/10 px-3 py-2.5 text-sm font-semibold text-success"
        >
          Паролата ти е сменена. Влез с новата.
        </p>
      )}

      <LoginForm callbackUrl={callbackUrl} />

      {/* Was a link to /contact + a promise of manual recovery — against an
          inbox that does not exist (audit H-14). Now it is the real flow. */}
      <p className="mt-4 text-center text-xs">
        <Link
          href="/forgot"
          className="rounded font-semibold text-accent underline-offset-4 hover:underline"
        >
          Забравена парола?
        </Link>
      </p>

      <AuthFooterNote>
        Нямаш акаунт?{" "}
        <Link
          href="/register"
          className="rounded font-semibold text-accent underline-offset-4 hover:underline"
        >
          Регистрирай се
        </Link>
      </AuthFooterNote>
    </div>
  );
}
