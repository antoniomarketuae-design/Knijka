import type { Metadata } from "next";
import Link from "next/link";
import { AuthFooterNote, AuthHeading } from "../auth-ui";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Регистрация | Книжка.AI",
};

export default function RegisterPage() {
  return (
    <div>
      <AuthHeading
        eyebrow="Нов акаунт"
        title="Регистрация"
        lead="Създай акаунт и започни подготовката за изпита. Безплатно, без карта."
      />
      <RegisterForm />
      <AuthFooterNote>
        Вече имаш акаунт?{" "}
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
