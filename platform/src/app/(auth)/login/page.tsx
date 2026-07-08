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

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-black">Вход</h1>
      <p className="mb-6 text-sm text-muted">
        Влез в акаунта си, за да продължиш обучението.
      </p>
      <LoginForm callbackUrl={callbackUrl} />
      <p className="mt-6 text-center text-sm text-muted">
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
