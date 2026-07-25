import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata: Metadata = {
  title: "Добре дошъл · Книжка.AI",
  robots: { index: false },
};

/**
 * One-time post-registration onboarding (register success redirects here).
 * Client-only state — answers live in localStorage (see
 * lib/onboarding/storage.ts), so no session/DB access is needed and
 * the page stays outside the auth proxy matcher on purpose: an anonymous
 * visitor just gets bounced to /login by the /dashboard redirect at the end.
 */
export default function OnboardingPage() {
  return <OnboardingFlow />;
}
