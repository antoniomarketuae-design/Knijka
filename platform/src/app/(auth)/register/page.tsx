import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Регистрация | Книжка.AI",
};

export default function RegisterPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Регистрация</h1>
      <p className="mb-6 text-sm opacity-70">
        Създай акаунт и започни подготовката за изпита.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm opacity-80">
        Вече имаш акаунт?{" "}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Влез
        </Link>
      </p>
    </div>
  );
}
