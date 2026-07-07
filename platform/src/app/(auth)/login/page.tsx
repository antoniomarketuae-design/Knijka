import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход | AI Driving Academy",
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
      <h1 className="mb-1 text-2xl font-bold">Вход</h1>
      <p className="mb-6 text-sm opacity-70">
        Влез в акаунта си, за да продължиш обучението.
      </p>
      <LoginForm callbackUrl={callbackUrl} />
      <p className="mt-6 text-center text-sm opacity-80">
        Нямаш акаунт?{" "}
        <Link href="/register" className="font-medium underline underline-offset-4">
          Регистрирай се
        </Link>
      </p>
    </div>
  );
}
