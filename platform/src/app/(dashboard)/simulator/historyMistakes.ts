/**
 * „История на сесиите" — the stored events of one past drive, folded into the
 * mistake rows the list prints.
 *
 * WHY IT IS ITS OWN FILE. It used to be a loop inside `page.tsx`'s
 * `buildHistoryEntries`, which is a server component that reaches for
 * `requireUser` and the SimSession store at module scope and therefore cannot
 * be unit-tested. It sits beside `access.ts` and `scenarioDeepLink.ts` for the
 * same reason those do: the logic a gate has to be able to mutate does not live
 * inside the route.
 *
 * THE TRUST MODEL, unchanged and worth restating because this file now reads a
 * THIRD field. Severity, points, law refs, titles and the A15 corrective all
 * come rebuilt from the violation catalogue — a tampered or stale payload may
 * list events, never re-price or re-title them, and unknown codes are skipped
 * rather than trusted. `detail` is admitted on exactly the terms
 * `lessons/wire.ts rebuildRuleEvents` already admits it: it can only select
 * another row of an AUTHORED per-act table (`rules/catalog.ts actCopy`), an
 * unrecognised value falls back to the pooled row, and it reaches no point, no
 * verdict and no penalty.
 *
 * WHY IT IS READ AT ALL — w10-4, `sc-merge-accel-lane:93685d58`, 2026-08-25.
 * `makeViolation` stamps the ACT's own title onto an event, and `debrief.ts
 * groupMistakes` keys its groups on (code, act) precisely because a list that
 * collapses BY CODE prints one act's name over another act's row: the
 * 2026-08-18 sheet that read «Удар в друго превозно средство ×2» for a drive
 * that struck a car and then a PERSON, with the word «пешеходец» nowhere in
 * it. This fold was still keying on the code alone, so a motorway wrong-way
 * drive was filed here as «Движение в обратна посока по еднопосочна улица»
 * after both halves of the end screen had learnt to say «…по автомагистрала».
 * Same stored event, same registry, same key — one act, one name, everywhere.
 */

import { actCopy, VIOLATIONS, type ViolationCode } from "@/modules/sim/rules";
import type { SessionHistoryMistake } from "./session-history";

const SEVERITY_RANK: Record<SessionHistoryMistake["severityClass"], number> = {
  opasna: 2,
  osnovna: 1,
  vtorostepenna: 0,
};

/**
 * Stored canonical rule events → the list's mistake rows, gravest first.
 * `ruleEvents` is whatever the store's defensive parse handed back, so every
 * field is interrogated rather than assumed.
 */
export function historyMistakeGroups(
  ruleEvents: readonly unknown[] | null | undefined,
): SessionHistoryMistake[] {
  const groups = new Map<string, SessionHistoryMistake>();
  for (const raw of ruleEvents ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as { kind?: unknown; code?: unknown; detail?: unknown };
    if (e.kind !== "violation" || typeof e.code !== "string") continue;
    if (!(e.code in VIOLATIONS)) continue;
    const code = e.code as ViolationCode;
    const spec = VIOLATIONS[code];
    const act = typeof e.detail === "string" ? actCopy(code, e.detail) : null;
    // Keyed on (code, act) — the same key `debrief.ts groupMistakes` uses, and
    // for the same reason. An event whose detail names no authored act keys on
    // the code alone, so a speeding row's measurement string cannot split one
    // continuing offence into five rows.
    const key = act === null ? code : `${code}|${e.detail as string}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      continue;
    }
    groups.set(key, {
      titleBg: act?.titleBg ?? spec.titleBg,
      lawRef: act?.lawRef ?? spec.lawRef,
      severityClass: spec.severityClass,
      points: spec.points,
      count: 1,
      correctiveBg: spec.correctiveBg,
    });
  }
  return [...groups.values()].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severityClass] - SEVERITY_RANK[a.severityClass];
    return rank !== 0 ? rank : b.points * b.count - a.points * a.count;
  });
}
