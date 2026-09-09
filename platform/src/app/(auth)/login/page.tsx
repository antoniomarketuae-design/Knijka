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

  // Set by /settings. Both revoke User.sessionEpoch, which ends the CURRENT
  // session too — so the student arrives here on purpose, not by a mystery
  // logout, and the banner is the difference between those two experiences.
  const changedHere = params.changed === "1";
  const revoked = params.revoked === "1";
  const notice = resetDone
    ? "Паролата ти е сменена. Влез с новата."
    : changedHere
      ? "Паролата ти е сменена и те отписахме от всички устройства. Влез с новата."
      : revoked
        ? "Отписахме те от всички устройства. Влез отново, за да продължиш."
        : null;

  return (
    <div>
      <AuthHeading
        eyebrow="Достъп"
        title="Вход"
        lead="Влез в акаунта си, за да продължиш обучението."
      />

      {/* The banner is 74px of the 393 a landscape phone has, and it is up on
          exactly the three URLs where a wrong password is most likely — so its
          box tightens on `short:` while its TEXT does not: `py-1.5` and a
          smaller gap, never a smaller type size. A status line a student has to
          squint at is not a saving. Worth 12px of the 79 that put the
          banner+wrong-password submit button back inside the fold. */}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-lg border border-success/50 bg-success/10 px-3 py-2.5 text-sm font-semibold text-success short:mb-2 short:py-1.5"
        >
          {notice}
        </p>
      )}

      <LoginForm callbackUrl={callbackUrl} />

      {/* Was a link to /contact + a promise of manual recovery — against an
          inbox that does not exist (audit H-14). Now it is the real flow. */}
      <p className="mt-4 text-center text-xs short:mt-2">
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
