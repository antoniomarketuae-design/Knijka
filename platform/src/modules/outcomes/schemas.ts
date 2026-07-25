/**
 * Input validation for a reported real-exam outcome.
 *
 * The schema is a FACTORY over `now` rather than a module-level constant: the
 * "not in the future" bound has to be evaluated per parse, otherwise a
 * long-lived server process would keep rejecting today's reports against the
 * date it booted on (same reasoning as the birth-year bound in
 * modules/auth/schemas.ts).
 *
 * Every message is the Bulgarian a 17-year-old reads on the form — this is
 * user-facing copy, not developer text.
 */

import { z } from "zod";
import { EXAM_KINDS, parseExamDay } from "./types";

/**
 * How far back a report may reach. Two years covers "I passed theory last
 * autumn and only just found this page" while still catching the classic
 * date-field typo (a 2016 that should have been 2026) before it lands in the
 * calibration as a wildly stale pairing.
 */
export const MAX_REPORT_AGE_DAYS = 730;

const DAY_MS = 24 * 60 * 60 * 1000;

export function outcomeReportSchema(now: Date) {
  const today = parseExamDay(now.toISOString().slice(0, 10));
  // Unreachable for a valid Date; keeps the type non-null below.
  const todayMs = today?.getTime() ?? now.getTime();

  return z.object({
    kind: z.enum(EXAM_KINDS, {
      error: "Избери кой изпит си явил — теория или кормуване.",
    }),
    passed: z.boolean({ error: "Кажи ни дали изпитът е взет." }),
    examOn: z
      .string({ error: "Въведи датата на изпита." })
      .trim()
      .refine((iso) => parseExamDay(iso) !== null, {
        error: "Невалидна дата на изпита.",
      })
      .refine((iso) => (parseExamDay(iso)?.getTime() ?? 0) <= todayMs, {
        error: "Датата е в бъдещето — изчакай изпита и тогава ни кажи.",
      })
      .refine(
        (iso) =>
          todayMs - (parseExamDay(iso)?.getTime() ?? 0) <=
          MAX_REPORT_AGE_DAYS * DAY_MS,
        {
          error: "Датата е отпреди повече от 2 години — провери годината.",
        },
      ),
  });
}
