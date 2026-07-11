"use client";

import { signOut } from "next-auth/react";
import { IconLogout } from "@/components/icons";

/** Client island: settings-page „Изход" (redirectTo = next-auth v5 API). */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: "/" })}
      className="btn-ghost w-full sm:w-auto"
    >
      <IconLogout className="h-4 w-4" />
      Изход от акаунта
    </button>
  );
}
