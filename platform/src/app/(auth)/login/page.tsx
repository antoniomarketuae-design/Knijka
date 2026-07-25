import type { Metadata } from "next";
import Link from "next/link";
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
      <h1 className="mb-1 font-display text-2xl font-black">Вход</h1>
      <p className="mb-6 text-sm text-muted">
        Влез в акаунта си, за да продължиш обучението.
      </p>
      {resetDone && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm"
        >
          Паролата ти е сменена. Влез с новата.
        </p>
      )}
      <LoginForm callbackUrl={callbackUrl} />
      {/* Was a link to /contact + a promise of manual recovery — against an
          inbox that does not exist (audit H-14). Now it is the real flow. */}
      <p className="mt-4 text-center text-xs text-muted">
        <Link
          href="/forgot"
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          Забравена парола?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-muted">
        Нямаш акаунт?{" "}
        <Link
          href="/register"
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          Регистрирай се
        </Link>
      </p>
    </div>
  );
}
