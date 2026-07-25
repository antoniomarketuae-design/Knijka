/**
 * Shapes shared between the /outcome server actions and the client island.
 *
 * Separate file (same pattern as settings/privacy-contract.ts) because a
 * "use server" module may only export async functions — a form-state type or
 * a constant declared next to the actions would be a build error.
 */

export interface ReportOutcomeState {
  status: "idle" | "saved" | "updated" | "error";
  messageBg: string;
}

export const initialReportOutcomeState: ReportOutcomeState = {
  status: "idle",
  messageBg: "",
};

export interface WithdrawOutcomeState {
  status: "idle" | "withdrawn" | "error";
  messageBg: string;
}

export const initialWithdrawOutcomeState: WithdrawOutcomeState = {
  status: "idle",
  messageBg: "",
};

/**
 * The consent wording, verbatim, in one place: the checkbox label the student
 * reads and the gate the action enforces must never drift apart — under
 * GDPR Art. 7 the consent is only valid for what was actually shown.
 */
export const CONSENT_LABEL_BG =
  "Съгласен съм да запазите резултата от изпита ми заедно с оценката за готовност, която приложението ми беше дало.";

/** Value of the consent checkbox — presence is what the action checks. */
export const CONSENT_FIELD = "consent";
