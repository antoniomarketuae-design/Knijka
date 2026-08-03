import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getSessionUser } from "@/modules/auth";
import { readOnboarding } from "@/lib/onboarding/service";
import { NO_EXAM_DATE } from "@/lib/onboarding/storage";

export const metadata: Metadata = {
  title: "Добре дошъл · Книжка.AI",
  robots: { index: false },
};

/**
 * One-time post-registration onboarding (register success redirects here).
 *
 * „Once" now means once per STUDENT, not once per browser. The answers live on
 * the User row (User.onboardedAt), so a laptop that has never seen this flow
 * no longer re-asks a student who already answered on their phone — and what
 * they answered is pre-filled rather than blank.
 *
 * The page stays outside the auth proxy matcher on purpose: an anonymous
 * visitor gets the client-only flow exactly as before (no session ⇒ no read,
 * no redirect) and is bounced to /login by the /dashboard redirect at the end.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) return <OnboardingFlow />;

  const answers = await readOnboarding(user.id);
  if (answers.onboarded) redirect("/dashboard");

  return (
    <OnboardingFlow
      initial={{
        // The sentinel is an answer, not a value to pre-fill a date input
        // with; a row carrying it has onboardedAt set and never reaches here.
        examDate: answers.examDate === NO_EXAM_DATE ? null : answers.examDate,
        dailyGoalMin: answers.dailyGoalMin,
      }}
    />
  );
}
