"use server";

/**
 * Server actions for /outcome — the capture side of the transfer loop
 * (audit M-4 / I-5).
 *
 * Untrusted POST endpoints, same discipline as settings/actions.ts: the ONLY
 * identity input is the server session via requireUser(), so neither action
 * can be aimed at somebody else's account no matter what the form posts.
 *
 * Consent (ADR-004) is enforced HERE rather than in the module, because this
 * is where the wording the student actually read lives (CONSENT_LABEL_BG). No
 * tick, no row — the checkbox is the lawful basis, not a formality.
 *
 * Business logic lives in @/modules/outcomes; this file only adapts it to the
 * useActionState shapes the form needs.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import {
  EXAM_KINDS,
  recordExamOutcome,
  withdrawExamOutcome,
  type ExamKind,
} from "@/modules/outcomes";
import {
  CONSENT_FIELD,
  initialWithdrawOutcomeState,
  type ReportOutcomeState,
  type WithdrawOutcomeState,
} from "./outcome-contract";

function toExamKind(value: FormDataEntryValue | null): ExamKind | null {
  const raw = String(value ?? "");
  return (EXAM_KINDS as readonly string[]).includes(raw)
    ? (raw as ExamKind)
    : null;
}

/** „Как мина изпитът?" — store one reported real ДАИ outcome. */
export async function reportOutcome(
  _prevState: ReportOutcomeState,
  formData: FormData,
): Promise<ReportOutcomeState> {
  const user = await requireUser();

  if (formData.get(CONSENT_FIELD) !== "on") {
    return {
      status: "error",
      messageBg:
        "Без отметката не можем да запазим резултата — маркирай я, ако си съгласен.",
    };
  }

  const kind = toExamKind(formData.get("kind"));
  if (!kind) {
    return {
      status: "error",
      messageBg: "Избери кой изпит си явил — теория или кормуване.",
    };
  }

  const outcomeRaw = String(formData.get("outcome") ?? "");
  if (outcomeRaw !== "passed" && outcomeRaw !== "failed") {
    return { status: "error", messageBg: "Кажи ни дали изпитът е взет." };
  }

  const result = await recordExamOutcome(user.id, {
    kind,
    passed: outcomeRaw === "passed",
    examOn: String(formData.get("examOn") ?? ""),
  });

  if (!result.ok) {
    return { status: "error", messageBg: result.messageBg };
  }

  // The list of reports is rendered server-side on this very path, so the
  // freshly stored row has to be in the RSC payload the action sends back.
  revalidatePath("/outcome");

  return result.replaced
    ? {
        status: "updated",
        messageBg: "Готово — поправихме предишния ти отговор за този изпит.",
      }
    : {
        status: "saved",
        messageBg:
          "Благодарим ти! Това ни помага да проверим дали прогнозата ни е вярна — и да я оправим, ако не е.",
      };
}

/**
 * Art. 7(3) withdrawal: delete one report. Consent that cannot be taken back
 * with the same effort it was given is not consent, so this is a plain button
 * next to the row — not a support e-mail.
 */
export async function withdrawOutcome(
  _prevState: WithdrawOutcomeState,
  formData: FormData,
): Promise<WithdrawOutcomeState> {
  const user = await requireUser();

  const removed = await withdrawExamOutcome(
    user.id,
    String(formData.get("outcomeId") ?? ""),
  );
  if (!removed) {
    // Unknown id and someone else's id give the SAME answer — the endpoint
    // must not become a probe for other students' report ids.
    return {
      status: "error",
      messageBg: "Не намерихме такъв запис. Презареди страницата и опитай пак.",
    };
  }

  revalidatePath("/outcome");
  return {
    ...initialWithdrawOutcomeState,
    status: "withdrawn",
    messageBg: "Изтрихме записа.",
  };
}
