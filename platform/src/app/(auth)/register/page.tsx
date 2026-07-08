import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Регистрация | Книжка.AI",
};

export default function RegisterPage() {
  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-black">Регистрация</h1>
      <p className="mb-6 text-sm text-muted">
        Създай акаунт и започни подготовката за изпита.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted">
        Вече имаш акаунт?{" "}
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
