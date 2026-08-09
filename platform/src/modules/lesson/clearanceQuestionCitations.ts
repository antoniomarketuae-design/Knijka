/**
 * THE QUESTION BANK'S CITATION PIN — which `lawRefs` this product knowingly
 * shows beside a question, pinned by the hash of the exact lines it shows.
 *
 * WHY A THIRD TABLE. `clearanceCarry.ts` pins concept prose and asks „has a
 * person read this sentence?". `clearanceCitations.ts` pins concept citations
 * and asks „is this article in content/law/acts?". A question already carries
 * `status`, so the first question is answered — `questionClearance` refuses
 * anything but `approved`, exactly as `narration.ts` does. The SECOND question
 * was never asked of a question at all.
 *
 * WHAT WAS WRONG. A question's citation is not spoken by the classroom; it is
 * PRINTED, on five surfaces that never touch `resolve.ts` —
 * `theory/WhyPanel.tsx`, `exam/ExamResultView.tsx`,
 * `sim/lesson-ui/MicroQuizOverlay.tsx`, `hazard/HazardReveal.tsx` and
 * `tutor/TutorChatCitations.ts`. Of the 608 distinct citation strings across
 * the 1,089 rows, 269 NAMED AN ARTICLE NO RESOLVER IN THIS REPO CAN FIND, 110
 * of them on rows a student is served today. Two acts carried almost all of it:
 * ППЗДвП (106 refs) and Наредба № РД-02-21-1/23.11.2023 (88) — both catalogued
 * in content/law/sources.json with live, HEAD-verified URLs, neither ingested.
 * The product printed „ППЗДвП чл. 46, ал. 2" with no hedge, over a document it
 * cannot show the student. On a platform whose whole competitive claim is that
 * every rule is cited and checkable, that is worse than citing nothing.
 *
 * All 269 now name no article number. What replaced them is the same house
 * style the bank and the concepts pin already use — „ППЗДвП надлъжна пътна
 * маркировка", „НК раздел „Престъпления по транспорта"", „Наредба
 * № РД-02-21-1/23.11.2023 знак Д12" — a TOPIC, stating no rule and no number.
 * A „?" was not an option: 45 of those were the exact defect the concepts wave
 * had just removed, and a question mark inside a citation neither informs nor
 * admits.
 *
 * THE THREE STATES A PINNED CITATION MAY BE IN, and nothing else: RESOLVABLE
 * (the act is one we hold and the unit is there), NUMBERLESS (the act is one we
 * do not hold, so no article number is named), PENDING (Наредба № 24 — on disk,
 * not yet in `ACT_IDS`). `scripts/freeze-question-citations.mjs` refuses to pin
 * a row that is none of the three, and additionally re-checks every RESOLVABLE
 * ref's ал./т./б. against the verbatim article text, because `resolveLawRef`
 * truncates „чл. 21, ал. 3" to „чл. 21" and would never see a fabricated
 * alinea. 914 sub-references were checked; all 914 are real.
 *
 * TO RE-PIN after an authored change: `node scripts/freeze-question-citations.mjs`
 * prints every citation it is about to authorise with its verdict beside it.
 * `--check` answers „is the table current?" without vitest.
 *
 * Not `as const`: this table is 1,089 rows and the literal type would cost more
 * than it is worth. `Record<string, string>` is the whole contract.
 */

/** Frozen against content/questions/*.json as of this date. */
export const QUESTION_CITATIONS_FROZEN_AT = "2026-08-05";

/**
 * questionId → sha256 of `lawRefs.map(r => `${r.act} ${r.ref}`).join("\n")`,
 * first 16 hex. The hashed string is the line a STUDENT SEES, not the JSON —
 * so a change that cannot reach a student cannot silence a row, and one that
 * can, does.
 */
export const CARRIED_QUESTION_CITATIONS: Readonly<Record<string, string>> = {
  "q-alkohol-i-godnost-001": "18277a93f5707c03", // ЗДвП чл. 5, ал. 3, т. 1 · ЗДвП чл. 174, ал. 1 · ЗДвП чл. 165, ал. 2, т. 9 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-002": "5f52fcecd44ede38", // ЗДвП чл. 174 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-003": "ae751792b4364829", // ЗДвП чл. 174, ал. 1 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 6, ал. 1, т. 1 · ЗДвП чл. 157, ал. 4 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-004": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-005": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-006": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-007": "7aa9f0a45b21c83a", // ЗДвП чл. 5 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-008": "849343af9aeb62d8", // НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-009": "161f000dfadfbbff", // ЗДвП чл. 174, ал. 3 · ЗДвП чл. 174, ал. 4
  "q-alkohol-i-godnost-010": "8db3c374a8e1181a", // ЗДвП чл. 174, ал. 3 · ЗДвП чл. 174, ал. 2 · Наредба № Iз-2539 чл. 6
  "q-alkohol-i-godnost-011": "6fc71118716a419b", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 181, т. 4
  "q-alkohol-i-godnost-012": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-013": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-014": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-015": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-016": "c59c9b24705d4643", // ЗДвП чл. 104а
  "q-alkohol-i-godnost-017": "74e5c15b38197f9f", // ЗДвП чл. 5 · ЗДвП чл. 104а
  "q-alkohol-i-godnost-018": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-019": "8f5b736be8e642da", // ЗДвП чл. 151, ал. 8 · Наредба № 3/2011 медицинска годност на водачите
  "q-alkohol-i-godnost-020": "b5d22100455e8662", // ЗДвП чл. 151, ал. 2 · Наредба № 3/2011 медицинска годност на водачите
  "q-alkohol-i-godnost-021": "5f52fcecd44ede38", // ЗДвП чл. 174 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-022": "0a736d054224ee00", // ЗДвП чл. 5, ал. 3, т. 1 · ЗДвП чл. 174, ал. 1
  "q-alkohol-i-godnost-023": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-024": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-025": "b2860b1560409bb2", // ЗДвП чл. 102
  "q-alkohol-i-godnost-026": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-027": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-028": "c639afe12d2f30e9", // НК раздел „Престъпления по транспорта“ · ЗДвП чл. 174
  "q-alkohol-i-godnost-029": "7aa9f0a45b21c83a", // ЗДвП чл. 5 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-030": "62ebed3e30576337", // ЗДвП чл. 6, т. 2 · ЗДвП чл. 165, ал. 2, т. 9 · ЗДвП чл. 174, ал. 3
  "q-alkohol-i-godnost-031": "161f000dfadfbbff", // ЗДвП чл. 174, ал. 3 · ЗДвП чл. 174, ал. 4
  "q-alkohol-i-godnost-032": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-033": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-034": "6fc71118716a419b", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 181, т. 4
  "q-alkohol-i-godnost-035": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-036": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-037": "ad6bda33aa571931", // ЗДвП чл. 104а · ЗДвП чл. 5
  "q-alkohol-i-godnost-038": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-alkohol-i-godnost-039": "ad6bda33aa571931", // ЗДвП чл. 104а · ЗДвП чл. 5
  "q-alkohol-i-godnost-040": "0985367ceaa83990", // ЗДвП чл. 5 · Наредба № 3/2011 медицинска годност на водачите
  "q-alkohol-i-godnost-041": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-042": "b882ec6f48f969d4", // ЗДвП чл. 165, ал. 2, т. 1 · ЗДвП чл. 165, ал. 2, т. 9 · ЗДвП чл. 174, ал. 3
  "q-alkohol-i-godnost-043": "4ff5c7d325775c0d", // ЗДвП чл. 5 · ЗДвП чл. 174
  "q-alkohol-i-godnost-044": "5f52fcecd44ede38", // ЗДвП чл. 174 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-045": "23698064354eb4ff", // ЗДвП чл. 174, ал. 1, т. 1
  "q-alkohol-i-godnost-046": "5f52fcecd44ede38", // ЗДвП чл. 174 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-047": "cf2839a919c865d0", // ЗДвП чл. 5, ал. 3, т. 1
  "q-alkohol-i-godnost-048": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-049": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-050": "7aa9f0a45b21c83a", // ЗДвП чл. 5 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-051": "5f52fcecd44ede38", // ЗДвП чл. 174 · НК раздел „Престъпления по транспорта“
  "q-alkohol-i-godnost-052": "2b76161de8eb0c25", // ЗДвП чл. 123, ал. 1, т. 2, б. „е“ · ЗДвП чл. 123, ал. 1, т. 3, б. „в“ · ЗДвП чл. 175, ал. 1, т. 5
  "q-alkohol-i-godnost-053": "66abfc9ba8338fdb", // ЗДвП чл. 174, ал. 4 · ЗДвП чл. 165, ал. 2, т. 9
  "q-alkohol-i-godnost-054": "039a444950bbb02f", // ЗДвП чл. 165, ал. 2, т. 3 · ЗДвП чл. 171, т. 1, б. „б“ · ЗДвП чл. 174, ал. 1
  "q-alkohol-i-godnost-055": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-056": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-057": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-058": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-059": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-060": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-alkohol-i-godnost-061": "0985367ceaa83990", // ЗДвП чл. 5 · Наредба № 3/2011 медицинска годност на водачите
  "q-alkohol-i-godnost-062": "0985367ceaa83990", // ЗДвП чл. 5 · Наредба № 3/2011 медицинска годност на водачите
  "q-alkohol-i-godnost-063": "b5d22100455e8662", // ЗДвП чл. 151, ал. 2 · Наредба № 3/2011 медицинска годност на водачите
  "q-dokumenti-i-sanktsii-001": "b2512e52f4f8639e", // ЗДвП чл. 100
  "q-dokumenti-i-sanktsii-002": "b2512e52f4f8639e", // ЗДвП чл. 100
  "q-dokumenti-i-sanktsii-003": "c124171e86904f9b", // ЗБЛД срок на валидност на свидетелството за управление
  "q-dokumenti-i-sanktsii-004": "a31120a5e49256c2", // ЗДвП чл. 150а, ал. 1 · ЗБЛД срок на валидност на свидетелството за управление
  "q-dokumenti-i-sanktsii-005": "fa6f72dc0bad918c", // ЗДвП чл. 147
  "q-dokumenti-i-sanktsii-006": "73f1b0452252bb55", // ЗДвП чл. 147 · ЗДвП чл. 181, т. 1
  "q-dokumenti-i-sanktsii-007": "a4aec11c83133d04", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-008": "5622b2251a45a6bb", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“ · ЗДвП чл. 171
  "q-dokumenti-i-sanktsii-009": "a4aec11c83133d04", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-010": "2e69704a77923188", // Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-dokumenti-i-sanktsii-011": "908206aa3e95c616", // ЗДвП чл. 103
  "q-dokumenti-i-sanktsii-012": "22252b962506b2b6", // ЗДвП чл. 103 · ЗДвП чл. 100 · ЗДвП чл. 170, ал. 6
  "q-dokumenti-i-sanktsii-013": "1f50e3ec9cd82fef", // ЗДвП чл. 189
  "q-dokumenti-i-sanktsii-014": "f2e585b13f8611c7", // ЗДвП чл. 186, ал. 1 · ЗДвП чл. 186, ал. 2 · ЗДвП чл. 189, ал. 4 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 2, ал. 6
  "q-dokumenti-i-sanktsii-015": "23bde3114d438572", // ЗАНН административнонаказателно производство
  "q-dokumenti-i-sanktsii-016": "1ccd74c4a6f1ee04", // ЗДвП чл. 157, ал. 1 · ЗДвП чл. 157, ал. 4 · Наредба № Iз-2539 чл. 2
  "q-dokumenti-i-sanktsii-017": "ba4d412df64115b5", // Наредба № Iз-2539 чл. 2 · ЗДвП чл. 157
  "q-dokumenti-i-sanktsii-018": "1d5b192da4bb27eb", // ЗДвП чл. 157, ал. 2а · ЗДвП чл. 157, ал. 2б · ЗДвП чл. 157, ал. 3 · ЗДвП чл. 157, ал. 4 · ЗДвП чл. 158, ал. 1 · ЗДвП чл. 186, ал. 1 · ЗДвП чл. 189, ал. 5 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 2, ал. 6 · Наредба № Iз-2539 чл. 6, ал. 1
  "q-dokumenti-i-sanktsii-019": "0f574ea7bac3a2af", // ЗДвП чл. 157, ал. 1 · ЗДвП § 6, т. 25а от ДР · Наредба № Iз-2539 чл. 2
  "q-dokumenti-i-sanktsii-020": "bd91a48a191c6270", // ЗДвП чл. 171
  "q-dokumenti-i-sanktsii-021": "bd91a48a191c6270", // ЗДвП чл. 171
  "q-dokumenti-i-sanktsii-022": "b2512e52f4f8639e", // ЗДвП чл. 100
  "q-dokumenti-i-sanktsii-023": "07150cef4c0cc252", // ЗДвП чл. 100 · ЗДвП чл. 150
  "q-dokumenti-i-sanktsii-024": "326c658c963dac04", // ЗБЛД издаване и подмяна на българските лични документи · Наредба № I-157 издаване на свидетелства за управление · ЗДвП чл. 150а, ал. 1
  "q-dokumenti-i-sanktsii-025": "fa6f72dc0bad918c", // ЗДвП чл. 147
  "q-dokumenti-i-sanktsii-026": "42a9b0a8e422a136", // ЗДвП чл. 145, ал. 2
  "q-dokumenti-i-sanktsii-027": "a4aec11c83133d04", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-028": "a4aec11c83133d04", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-029": "2e69704a77923188", // Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-dokumenti-i-sanktsii-030": "2e69704a77923188", // Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-dokumenti-i-sanktsii-031": "face62f40dc235fc", // ЗДвП чл. 170
  "q-dokumenti-i-sanktsii-032": "8db3c374a8e1181a", // ЗДвП чл. 174, ал. 3 · ЗДвП чл. 174, ал. 2 · Наредба № Iз-2539 чл. 6
  "q-dokumenti-i-sanktsii-033": "56269007c77fbd9d", // ЗДвП чл. 186, ал. 3
  "q-dokumenti-i-sanktsii-034": "1f50e3ec9cd82fef", // ЗДвП чл. 189
  "q-dokumenti-i-sanktsii-035": "1f50e3ec9cd82fef", // ЗДвП чл. 189
  "q-dokumenti-i-sanktsii-036": "f8eba4f7b3578cab", // ЗДвП чл. 158, ал. 1 · ЗДвП чл. 158, ал. 2 · Наредба № Iз-2539 чл. 2
  "q-dokumenti-i-sanktsii-037": "07aea3b68f6361e5", // ЗДвП чл. 157
  "q-dokumenti-i-sanktsii-038": "d5fc643b0a61c721", // ЗДвП § 6, т. 25а от ДР · ЗДвП чл. 157, ал. 1 · ЗДвП чл. 157, ал. 2
  "q-dokumenti-i-sanktsii-039": "e9439fb25673a4a1", // НК раздел „Престъпления по транспорта“ · ЗДвП чл. 171
  "q-dokumenti-i-sanktsii-040": "6ec1479016235210", // ЗДвП чл. 171, т. 2 · ЗДвП чл. 181, т. 1
  "q-dokumenti-i-sanktsii-041": "0d5e02ac21cf2108", // ЗДвП чл. 174 · ЗДвП чл. 157
  "q-dokumenti-i-sanktsii-042": "b2860b1560409bb2", // ЗДвП чл. 102
  "q-dokumenti-i-sanktsii-043": "b2512e52f4f8639e", // ЗДвП чл. 100
  "q-dokumenti-i-sanktsii-044": "8d714f5b0eb70897", // ЗДвП чл. 151, ал. 8 · ЗДвП чл. 185 · ЗБЛД данни, вписвани в свидетелството за управление · Наредба № I-157 издаване на свидетелства за управление
  "q-dokumenti-i-sanktsii-045": "a4aec11c83133d04", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-046": "2e69704a77923188", // Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-dokumenti-i-sanktsii-047": "a78336c675240fdd", // ЗАНН административнонаказателно производство · ЗДвП чл. 189, ал. 5г
  "q-dokumenti-i-sanktsii-048": "23bde3114d438572", // ЗАНН административнонаказателно производство
  "q-dokumenti-i-sanktsii-049": "ac35913aeb2fb1e2", // ЗДвП чл. 170, ал. 4 · ЗДвП чл. 170, ал. 6 · ЗДвП чл. 103
  "q-dokumenti-i-sanktsii-050": "ac77eaf5daba33d2", // Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 2, ал. 6 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 2, ал. 7 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 6, ал. 1, т. 12 · ЗДвП чл. 186, ал. 1 · ЗДвП чл. 188, ал. 1 · ЗДвП чл. 189, ал. 4 · ЗДвП чл. 189, ал. 5, т. 8 · ЗДвП чл. 189, ал. 10 · ЗДвП чл. 189, ал. 11 · ЗДвП чл. 157
  "q-dokumenti-i-sanktsii-051": "07aea3b68f6361e5", // ЗДвП чл. 157
  "q-dokumenti-i-sanktsii-052": "0f574ea7bac3a2af", // ЗДвП чл. 157, ал. 1 · ЗДвП § 6, т. 25а от ДР · Наредба № Iз-2539 чл. 2
  "q-dokumenti-i-sanktsii-053": "c124171e86904f9b", // ЗБЛД срок на валидност на свидетелството за управление
  "q-dokumenti-i-sanktsii-054": "7391905ce6e8dfc2", // ЗДвП чл. 144, ал. 2 · ЗДвП чл. 145, ал. 2
  "q-dokumenti-i-sanktsii-055": "161f000dfadfbbff", // ЗДвП чл. 174, ал. 3 · ЗДвП чл. 174, ал. 4
  "q-dokumenti-i-sanktsii-056": "67bcb34c917e72a7", // ЗДвП чл. 150а, ал. 2, т. 6
  "q-dokumenti-i-sanktsii-057": "fa6f72dc0bad918c", // ЗДвП чл. 147
  "q-dokumenti-i-sanktsii-058": "2e69704a77923188", // Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-dokumenti-i-sanktsii-059": "cb836186db550734", // ЗДвП чл. 140, ал. 2 · ЗДвП чл. 143, ал. 6, т. 4 · ЗДвП чл. 143, ал. 6а · Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "q-dokumenti-i-sanktsii-060": "dc4b5210a312355d", // ЗДвП чл. 140, ал. 1 · ЗДвП чл. 175, ал. 3 · ЗДвП чл. 171, т. 5, б. „в“ · НК раздел „Престъпления по транспорта“
  "q-dokumenti-i-sanktsii-061": "52edfbf4c8c09b92", // ЗДвП чл. 186
  "q-dokumenti-i-sanktsii-062": "98a999994411580f", // ЗДвП чл. 140
  "q-dokumenti-i-sanktsii-063": "539ba322290df361", // ЗДвП чл. 147 · Кодекс за застраховането задължителна застраховка „Гражданска отговорност“ · Закон за пътищата такси за ползване на пътната мрежа (винетка)
  "q-eco-001": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-002": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-eco-003": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-eco-004": "b6ba7a68d0d98bfd", // ЗДвП чл. 20 · ЗДвП чл. 117
  "q-eco-005": "978115fd2f22eaea", // ЗДвП чл. 20, ал. 2 · ЗДвП чл. 67 · ЗДвП чл. 115, ал. 3
  "q-eco-006": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-007": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-eco-008": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-009": "a9db73600a7ce6d6", // ЗДвП чл. 23, ал. 1 · ЗДвП чл. 42, ал. 2, т. 1 · ЗДвП чл. 44, ал. 1
  "q-eco-010": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-011": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-012": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-013": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-014": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-015": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-016": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-017": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-018": "3de3692b1a93bf65", // ЗДвП чл. 5 · Наредба № 37 единна учебна документация
  "q-eco-019": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-020": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-eco-021": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-022": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-eco-023": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-eco-024": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-eco-025": "b5f73044da2bf440", // ЗДвП чл. 5 · ЗДвП чл. 20
  "q-eco-026": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-027": "fa3f2991de5440b7", // ЗДвП чл. 20 · ЗДвП чл. 119
  "q-eco-028": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-029": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-030": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-eco-031": "ce8336c0afc9ec50", // ЗДвП чл. 5 · ЗДвП чл. 25 · ЗДвП чл. 56
  "q-eco-032": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-033": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-034": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-035": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-036": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-037": "3de3692b1a93bf65", // ЗДвП чл. 5 · Наредба № 37 единна учебна документация
  "q-eco-038": "3c8c13c94c9b28b4", // ЗДвП чл. 5 · ЗДвП чл. 30
  "q-eco-039": "acd69b2286d2dbd3", // ЗДвП чл. 20 · ЗДвП чл. 104а
  "q-eco-040": "3227ff0bb878c9e8", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 21, ал. 1 · ЗДвП чл. 23, ал. 1 · ЗДвП чл. 42, ал. 1, т. 2
  "q-eco-041": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-042": "3de3692b1a93bf65", // ЗДвП чл. 5 · Наредба № 37 единна учебна документация
  "q-eco-043": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-044": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-045": "8e3e7261f9378694", // ЗДвП чл. 20 · ЗДвП чл. 70
  "q-eco-046": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-047": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-eco-048": "ad1a6db8917bcc93", // ЗДвП чл. 20 · ЗДвП чл. 25
  "q-eco-049": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-050": "3de3692b1a93bf65", // ЗДвП чл. 5 · Наредба № 37 единна учебна документация
  "q-eco-051": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-052": "577c63518c6243ff", // ЗДвП чл. 20 · Наредба № 37 единна учебна документация
  "q-eco-053": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-054": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-055": "a9fea9ac30df9440", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 23, ал. 1 · ЗДвП чл. 42, ал. 1, т. 2 · ЗДвП чл. 42, ал. 2, т. 3
  "q-eco-056": "45a9a6bcee54dd61", // ЗДвП чл. 5 · ЗДвП чл. 23
  "q-eco-057": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-eco-058": "f2c4985138ed90c1", // Наредба № 37 единна учебна документация
  "q-eco-059": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-060": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-eco-061": "911ac7354e37c285", // ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП чл. 20, ал. 2 · ЗДвП чл. 117
  "q-eco-062": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-eco-063": "577c63518c6243ff", // ЗДвП чл. 20 · Наредба № 37 единна учебна документация
  "q-eco-064": "9ea76e0e4fbe3028", // ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП чл. 20, ал. 2 · ЗДвП чл. 95, ал. 1
  "q-krastovishta-001": "b3b85e02a5003fa7", // ЗДвП § 6, т. 8 ДР
  "q-krastovishta-002": "12bd9a065761f32d", // ЗДвП чл. 47
  "q-krastovishta-003": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-004": "ab2d5a8507bfae51", // ЗДвП чл. 48 · ЗДвП чл. 37
  "q-krastovishta-005": "70e0b157856dd11b", // ЗДвП чл. 50
  "q-krastovishta-006": "86c6d2f0c444e434", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища
  "q-krastovishta-007": "e7db1ecf1fb73f78", // ЗДвП чл. 7
  "q-krastovishta-008": "f15f2d9ff4c09176", // ЗДвП чл. 37
  "q-krastovishta-009": "785999fc974cfeaa", // ЗДвП чл. 35, ал. 1 · ЗДвП чл. 35, ал. 3
  "q-krastovishta-010": "f15f2d9ff4c09176", // ЗДвП чл. 37
  "q-krastovishta-011": "910c26b33d34c38e", // ЗДвП чл. 36 · ЗДвП чл. 37
  "q-krastovishta-012": "f2e86a676f4c4032", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3 · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци)
  "q-krastovishta-013": "fb628213f56b8691", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3
  "q-krastovishta-014": "5f614ccd2ea0736d", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 28, ал. 1, т. 2 · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци)
  "q-krastovishta-015": "ace10db022be03e1", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 28, ал. 1, т. 2
  "q-krastovishta-016": "af9736f142bdc54f", // ЗДвП чл. 51
  "q-krastovishta-017": "14a578411d164f47", // ЗДвП чл. 51, ал. 3 · ППЗДвП железопътни прелези · ЗДвП чл. 52
  "q-krastovishta-018": "0e899416c527fb65", // ЗДвП чл. 54
  "q-krastovishta-019": "bf9400a4312b3853", // ЗДвП чл. 50а · ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-020": "4ad9a9ea9fbb1d6d", // ЗДвП чл. 48 · ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-021": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-022": "e7db1ecf1fb73f78", // ЗДвП чл. 7
  "q-krastovishta-023": "bda51d08b9f8e11c", // ЗДвП чл. 104, ал. 1 · ЗДвП чл. 104, ал. 2 · ЗДвП чл. 92, ал. 1, т. 1
  "q-krastovishta-024": "86c6d2f0c444e434", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища
  "q-krastovishta-025": "07e10a7305850d49", // ЗДвП чл. 37 · ЗДвП чл. 50
  "q-krastovishta-026": "ab2d5a8507bfae51", // ЗДвП чл. 48 · ЗДвП чл. 37
  "q-krastovishta-027": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-028": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-029": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-030": "d0998edf5caba5ff", // ЗДвП чл. 37 · ЗДвП чл. 119
  "q-krastovishta-031": "5241ae5a225b194a", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 35, ал. 2 · ЗДвП чл. 119, ал. 4
  "q-krastovishta-032": "40aea3abef851144", // ЗДвП чл. 36
  "q-krastovishta-033": "b0fbcf85e0adc6ee", // ЗДвП чл. 6
  "q-krastovishta-034": "78290231a0f9f91b", // ЗДвП чл. 7 · ЗДвП чл. 50
  "q-krastovishta-035": "d0998edf5caba5ff", // ЗДвП чл. 37 · ЗДвП чл. 119
  "q-krastovishta-036": "a0f13e3dbb00beff", // ЗДвП чл. 39 · ЗДвП чл. 43, т. 3 · ЗДвП чл. 51, ал. 5
  "q-krastovishta-037": "e2fdc3942852955f", // ЗДвП чл. 52
  "q-krastovishta-038": "3392f58861176b18", // ЗДвП чл. 98
  "q-krastovishta-039": "5623daa55fb05f6f", // ЗДвП чл. 43, т. 2
  "q-krastovishta-040": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-041": "346c8f0e1fd9b4ad", // ЗДвП чл. 49 · ППЗДвП излизане на път от прилежащ или черен път
  "q-krastovishta-042": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-043": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-044": "7ae909720174dfa5", // ЗДвП чл. 6, т. 2 · ЗДвП чл. 7, ал. 1 · ЗДвП чл. 10, ал. 2
  "q-krastovishta-045": "acf1eabde0848029", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 48
  "q-krastovishta-046": "5c0a9153874d662e", // ЗДвП чл. 8, ал. 2 · ППЗДвП движение спрямо релсовите превозни средства
  "q-krastovishta-047": "1b017821a51507db", // ЗДвП чл. 40, ал. 1 · ЗДвП чл. 40, ал. 2 · ЗДвП чл. 38, ал. 4 · ЗДвП чл. 51, ал. 5, т. 4 · ЗДвП чл. 58, т. 2 · ЗДвП чл. 58а, т. 2 · ЗДвП чл. 64 · ЗДвП чл. 183, ал. 2, т. 4
  "q-krastovishta-048": "70e0b157856dd11b", // ЗДвП чл. 50
  "q-krastovishta-049": "73e07f3e70d47a9b", // ЗДвП чл. 7 · ЗДвП чл. 48
  "q-krastovishta-050": "420ac9e867e7227a", // Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3 · ЗДвП чл. 50, ал. 1
  "q-krastovishta-051": "fd7dba808b18d7ab", // ЗДвП чл. 43б, ал. 1 · ЗДвП чл. 43б, ал. 2 · ЗДвП чл. 41, ал. 1
  "q-krastovishta-052": "07e10a7305850d49", // ЗДвП чл. 37 · ЗДвП чл. 50
  "q-krastovishta-053": "74b18fd97b847817", // ЗДвП чл. 37, ал. 1 · ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-054": "6d6dc8e244f68a30", // ЗДвП чл. 51, ал. 3 · ППЗДвП железопътни прелези · ЗДвП чл. 53, ал. 1 · Наредба № РД-02-21-1/23.11.2023 знаци за железопътен прелез
  "q-krastovishta-055": "6ba43e7a879af2c2", // ЗДвП чл. 43, т. 2 · ЗДвП чл. 43, т. 3
  "q-krastovishta-056": "a2892cda41a688d9", // ЗДвП чл. 37, ал. 3
  "q-krastovishta-057": "8abcc29818f436b3", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 119, ал. 4
  "q-krastovishta-058": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-krastovishta-059": "1af815d257c6cf08", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 50, ал. 1
  "q-krastovishta-060": "e7db1ecf1fb73f78", // ЗДвП чл. 7
  "q-krastovishta-061": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-krastovishta-062": "a57e81785d41dddf", // Наредба № 2/2001 напречна маркировка · ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 50, ал. 1
  "q-krastovishta-063": "edb0ab7ac352b61e", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-krastovishta-064": "fb628213f56b8691", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3
  "q-krastovishta-065": "8cf922a06dc32805", // ЗДвП чл. 28, ал. 1, т. 2 · ЗДвП чл. 50, ал. 1
  "q-krastovishta-066": "6d6dc8e244f68a30", // ЗДвП чл. 51, ал. 3 · ППЗДвП железопътни прелези · ЗДвП чл. 53, ал. 1 · Наредба № РД-02-21-1/23.11.2023 знаци за железопътен прелез
  "q-krastovishta-067": "41a7aef561654093", // Наредба № РД-02-21-1/23.11.2023 знак А32 · ЗДвП чл. 51
  "q-krastovishta-068": "13256e3ea870d3e5", // Наредба № РД-02-21-1/23.11.2023 знак А33 · ЗДвП чл. 51
  "q-krastovishta-069": "0bfae6f37e5456d4", // Наредба № РД-02-21-1/23.11.2023 сигнализиране на кръговото кръстовище с пътни знаци · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци)
  "q-magistrali-i-izvangradsko-001": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-002": "418cba6dc3707592", // ЗДвП чл. 55, ал. 1
  "q-magistrali-i-izvangradsko-003": "a7a30e3ac3119187", // ЗДвП чл. 15, ал. 1 · ЗДвП чл. 15, ал. 2 · ЗДвП чл. 41, ал. 1
  "q-magistrali-i-izvangradsko-004": "e7325c794f73fa39", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 2
  "q-magistrali-i-izvangradsko-005": "99fe891f39945ad4", // ЗДвП чл. 56 · ЗДвП чл. 24, ал. 1
  "q-magistrali-i-izvangradsko-006": "3d6ce09afd088ab7", // ЗДвП чл. 56 · ЗДвП чл. 26 · ЗДвП чл. 25, ал. 2
  "q-magistrali-i-izvangradsko-007": "fc26b3fd4c50557c", // ЗДвП чл. 58, т. 2 · ЗДвП чл. 58, т. 3
  "q-magistrali-i-izvangradsko-008": "eb9a70d9f7139f7c", // ЗДвП чл. 58, т. 2 · ЗДвП чл. 41, ал. 1
  "q-magistrali-i-izvangradsko-009": "f9002548624bb22d", // ЗДвП чл. 58, т. 3 · ЗДвП чл. 58, т. 4
  "q-magistrali-i-izvangradsko-010": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-011": "a7e8093f2c28f91d", // ЗДвП чл. 21, ал. 1 · ЗДвП чл. 55, ал. 1 · ЗДвП § 6, т. 52а ДР
  "q-magistrali-i-izvangradsko-012": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-013": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-014": "fa92f253dd6aa751", // ЗДвП чл. 42, ал. 1, т. 2 · ЗДвП чл. 43, т. 1
  "q-magistrali-i-izvangradsko-015": "32e9ce5aa0de9020", // ЗДвП чл. 45, ал. 1 · ЗДвП чл. 45, ал. 3 · ЗДвП чл. 45, ал. 4
  "q-magistrali-i-izvangradsko-016": "236b716e6b036db9", // ЗДвП чл. 20, ал. 1
  "q-magistrali-i-izvangradsko-017": "f6128abc26cff9bf", // ЗДвП чл. 63, т. 3
  "q-magistrali-i-izvangradsko-018": "577031209cd6c473", // ЗДвП чл. 63, т. 2 · ЗДвП чл. 64 · ЗДвП чл. 23, ал. 1
  "q-magistrali-i-izvangradsko-019": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-magistrali-i-izvangradsko-020": "28a3c862610e6996", // ЗДвП чл. 97, ал. 4 · ЗДвП чл. 139, ал. 2
  "q-magistrali-i-izvangradsko-021": "930acaa8c308f29c", // ЗДвП чл. 23, ал. 1
  "q-magistrali-i-izvangradsko-022": "350f36a24335fd02", // ЗДвП чл. 20, ал. 2 · ЗДвП чл. 21, ал. 1 · ЗДвП чл. 74, ал. 2
  "q-magistrali-i-izvangradsko-023": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-024": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-025": "418cba6dc3707592", // ЗДвП чл. 55, ал. 1
  "q-magistrali-i-izvangradsko-026": "f8a543b4df30a3dd", // ЗДвП чл. 55, ал. 1 · ЗДвП чл. 22, ал. 1
  "q-magistrali-i-izvangradsko-027": "327898b4d7bd0ddc", // ЗДвП чл. 58, т. 3 · ЗДвП чл. 20, ал. 1
  "q-magistrali-i-izvangradsko-028": "e7325c794f73fa39", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 2
  "q-magistrali-i-izvangradsko-029": "632208047f883433", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 26
  "q-magistrali-i-izvangradsko-030": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-031": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-032": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-033": "a0be483aa4bde45b", // ЗДвП чл. 21, ал. 1 · ЗДвП чл. 21, ал. 3
  "q-magistrali-i-izvangradsko-034": "678227bfb649380c", // ЗДвП чл. 139, ал. 1, т. 4
  "q-magistrali-i-izvangradsko-035": "df666fb65ded3822", // ЗДвП чл. 42, ал. 3 · ЗДвП чл. 15, ал. 1 · ЗДвП чл. 22, ал. 2
  "q-magistrali-i-izvangradsko-036": "1a976b57d385da66", // ЗДвП чл. 104, ал. 1
  "q-magistrali-i-izvangradsko-037": "bff792e15f86e0a4", // ЗДвП чл. 20, ал. 2 · ЗДвП чл. 94, ал. 1
  "q-magistrali-i-izvangradsko-038": "4798750716cb3cb3", // ЗДвП чл. 7, ал. 4 · ЗДвП чл. 7, ал. 5
  "q-magistrali-i-izvangradsko-039": "9b317796700372d0", // ЗДвП чл. 42, ал. 1, т. 2 · ЗДвП чл. 42, ал. 2, т. 1
  "q-magistrali-i-izvangradsko-040": "2654240c1cf26832", // ЗДвП чл. 63, т. 2 · ЗДвП чл. 64
  "q-magistrali-i-izvangradsko-041": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-magistrali-i-izvangradsko-042": "0416f4d3d15f93f5", // ЗДвП чл. 58, т. 1 · ЗДвП чл. 58, т. 3 · ЗДвП чл. 6, т. 2
  "q-magistrali-i-izvangradsko-043": "901c829d4a39f620", // ЗДвП чл. 20, ал. 1 · ЗДвП чл. 139, ал. 1, т. 1
  "q-magistrali-i-izvangradsko-044": "763a021e609b240a", // ЗДвП чл. 41, ал. 1
  "q-magistrali-i-izvangradsko-045": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-046": "930acaa8c308f29c", // ЗДвП чл. 23, ал. 1
  "q-magistrali-i-izvangradsko-047": "418cba6dc3707592", // ЗДвП чл. 55, ал. 1
  "q-magistrali-i-izvangradsko-048": "b88728902b70e7a5", // ЗДвП чл. 58а, т. 2
  "q-magistrali-i-izvangradsko-049": "f6128abc26cff9bf", // ЗДвП чл. 63, т. 3
  "q-magistrali-i-izvangradsko-050": "c39623fe9187ce0d", // ЗДвП чл. 74, ал. 1 · ЗДвП чл. 74, ал. 2
  "q-magistrali-i-izvangradsko-051": "b9d165c1dc64bd7f", // ЗДвП чл. 77 · ЗДвП чл. 70, ал. 2, т. 1
  "q-magistrali-i-izvangradsko-052": "dc73a6cb25e8ae6d", // ЗДвП чл. 70, ал. 2, т. 1
  "q-magistrali-i-izvangradsko-053": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-054": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-magistrali-i-izvangradsko-055": "cca5d5d88f637362", // ЗДвП чл. 42, ал. 1, т. 2
  "q-magistrali-i-izvangradsko-056": "6624f61effa1fc60", // ЗДвП чл. 15, ал. 1 · ЗДвП чл. 15, ал. 2 · ЗДвП чл. 41, ал. 2
  "q-magistrali-i-izvangradsko-057": "236b716e6b036db9", // ЗДвП чл. 20, ал. 1
  "q-magistrali-i-izvangradsko-058": "10b1fc8a7b7f25a8", // ЗДвП чл. 58, т. 2 · ЗДвП чл. 25, ал. 1
  "q-magistrali-i-izvangradsko-059": "e678b2b59f5a4ec6", // ЗДвП чл. 20, ал. 2 · ЗДвП чл. 23, ал. 1
  "q-magistrali-i-izvangradsko-060": "e7325c794f73fa39", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 2
  "q-magistrali-i-izvangradsko-061": "3771018b89f134c2", // ЗДвП чл. 97, ал. 3 · ЗДвП чл. 97, ал. 4
  "q-magistrali-i-izvangradsko-062": "bf42c7c8e42cfd04", // ЗДвП чл. 57
  "q-magistrali-i-izvangradsko-063": "c2d7a99ce0764a4f", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 1 · ЗДвП чл. 26
  "q-magistrali-i-izvangradsko-064": "3091be5fd69b95d8", // ЗДвП чл. 21, ал. 1 · ЗДвП чл. 55, ал. 1
  "q-magistrali-i-izvangradsko-065": "d757f68fca479469", // ЗДвП чл. 15, ал. 1 · ЗДвП чл. 41, ал. 1
  "q-magistrali-i-izvangradsko-066": "28a3c862610e6996", // ЗДвП чл. 97, ал. 4 · ЗДвП чл. 139, ал. 2
  "q-magistrali-i-izvangradsko-067": "e7325c794f73fa39", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 2
  "q-magistrali-i-izvangradsko-068": "ca661e7c7465d203", // Наредба № РД-02-21-1/23.11.2023 знак Д5 · ЗДвП чл. 55, ал. 1 · ЗДвП чл. 21, ал. 1
  "q-magistrali-i-izvangradsko-069": "d43843b7d1b77cd2", // Наредба № РД-02-21-1/23.11.2023 знак Д6 · ЗДвП чл. 21, ал. 1
  "q-manevri-001": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-002": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-003": "2d46dbc2040edb59", // ЗДвП чл. 37, ал. 3 · ЗДвП чл. 25
  "q-manevri-004": "cbff5341f1bd46bd", // ЗДвП чл. 15
  "q-manevri-005": "c597d9cf943191d7", // ЗДвП чл. 16, ал. 1, т. 2
  "q-manevri-006": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-007": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-008": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-009": "574888b390689c0c", // ЗДвП чл. 42, ал. 1
  "q-manevri-010": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-manevri-011": "ace0271402c105ae", // ЗДвП чл. 41 · ЗДвП чл. 42
  "q-manevri-012": "a1fe65c96d0133b2", // ЗДвП чл. 43
  "q-manevri-013": "190f95d4082edf25", // ЗДвП чл. 43, т. 1 · ЗДвП чл. 43, т. 3 · ЗДвП чл. 43, т. 6
  "q-manevri-014": "103fe7fcf63846fb", // ЗДвП чл. 6 · Наредба № 2/2001 надлъжна маркировка
  "q-manevri-015": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-manevri-016": "9c39998be5c5d082", // ЗДвП чл. 44
  "q-manevri-017": "ae6e670cc45f62e7", // ЗДвП чл. 45
  "q-manevri-018": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-manevri-019": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-manevri-020": "92d5481bf387f10e", // ЗДвП чл. 38
  "q-manevri-021": "fc1cdfd81ad210b6", // ЗДвП чл. 39
  "q-manevri-022": "2d46dbc2040edb59", // ЗДвП чл. 37, ал. 3 · ЗДвП чл. 25
  "q-manevri-023": "41addcbd0971cd36", // ЗДвП § 6, т. 80 ДР · ЗДвП § 6, т. 81 ДР · ЗДвП чл. 41, ал. 2 · ЗДвП чл. 25, ал. 1 · ЗДвП чл. 25, ал. 2
  "q-manevri-024": "d6a778ee4c784d5d", // ЗДвП чл. 43б, ал. 1 · ЗДвП чл. 43б, ал. 2 · ЗДвП § 6, т. 80
  "q-manevri-025": "2d235e6183665c6e", // ЗДвП чл. 25 · ЗДвП чл. 26
  "q-manevri-026": "3ec5c2cd58b932f5", // ЗДвП чл. 26
  "q-manevri-027": "5b335ff1347a816f", // ЗДвП чл. 21 · ЗДвП чл. 42, ал. 2, т. 3
  "q-manevri-028": "574888b390689c0c", // ЗДвП чл. 42, ал. 1
  "q-manevri-029": "ace0271402c105ae", // ЗДвП чл. 41 · ЗДвП чл. 42
  "q-manevri-030": "66eb1f05498882d4", // Наредба № РД-02-21-1/23.11.2023 знак В24 · ЗДвП чл. 43
  "q-manevri-031": "a7b94a3d0a28b61c", // ЗДвП чл. 41, ал. 1 · ЗДвП чл. 41, ал. 2 · ЗДвП чл. 15, ал. 1 · ЗДвП чл. 5, ал. 2, т. 4
  "q-manevri-032": "cbff5341f1bd46bd", // ЗДвП чл. 15
  "q-manevri-033": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-034": "9c39998be5c5d082", // ЗДвП чл. 44
  "q-manevri-035": "05202c4abb4ea0c5", // ЗДвП чл. 49
  "q-manevri-036": "0b2dede79e360e94", // ЗДвП чл. 67 · ЗДвП чл. 65
  "q-manevri-037": "903936892201a32a", // ЗДвП чл. 58
  "q-manevri-038": "a478f4ee4f43d25d", // ЗДвП чл. 119 · ЗДвП чл. 43
  "q-manevri-039": "5623daa55fb05f6f", // ЗДвП чл. 43, т. 2
  "q-manevri-040": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-manevri-041": "cca5d5d88f637362", // ЗДвП чл. 42, ал. 1, т. 2
  "q-manevri-042": "92d5481bf387f10e", // ЗДвП чл. 38
  "q-manevri-043": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-manevri-044": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-045": "f776a678d3124b59", // ЗДвП чл. 43а · ЗДвП чл. 41, ал. 1
  "q-manevri-046": "cb3addbd0602a838", // Наредба № РД-02-21-1/23.11.2023 знак В25 · ЗДвП чл. 43
  "q-manevri-047": "5df388bdcb7a1f30", // Наредба № РД-02-21-1/23.11.2023 знаци В24 и В31 — зона на действие
  "q-manevri-048": "2f9ffa627cdac6f8", // Наредба № 2/2001 надлъжна маркировка · ЗДвП чл. 6
  "q-manevri-049": "9c39998be5c5d082", // ЗДвП чл. 44
  "q-manevri-050": "9c39998be5c5d082", // ЗДвП чл. 44
  "q-manevri-051": "28bda8db09996048", // Наредба № РД-02-21-1/23.11.2023 знаци Б5 и Б6
  "q-manevri-052": "5c820432d8e8486f", // ЗДвП чл. 39 · ЗДвП чл. 6, т. 1
  "q-manevri-053": "1a97b10f6f9f40e7", // Наредба № РД-02-21-1/23.11.2023 знак В23
  "q-manevri-054": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-manevri-055": "a101194d34a4ebec", // ЗДвП чл. 25 · ЗДвП чл. 15
  "q-manevri-056": "ace0271402c105ae", // ЗДвП чл. 41 · ЗДвП чл. 42
  "q-manevri-057": "d868febb2a41bdd9", // ЗДвП чл. 90 · ЗДвП чл. 89
  "q-manevri-058": "96cfe37c989276ae", // ЗДвП чл. 15 · ЗДвП чл. 16
  "q-manevri-059": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-060": "f2197a5e65316c7c", // ЗДвП чл. 41, ал. 1 · ЗДвП чл. 41, ал. 2 · ЗДвП чл. 43б, ал. 1 · ЗДвП § 6, т. 80 ДР · ЗДвП чл. 43а
  "q-manevri-061": "84261630d1ddcc64", // ЗДвП чл. 183, ал. 2, т. 6 · ЗДвП чл. 179, ал. 1, т. 5 · ЗДвП чл. 157, ал. 3 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 6, ал. 1, т. 9 · Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.) чл. 6, ал. 1, т. 16
  "q-manevri-062": "abf3bf858cb2b3ea", // ЗДвП чл. 42, ал. 1, т. 1
  "q-manevri-063": "07160eda77054abd", // ЗДвП чл. 25
  "q-manevri-064": "a2892cda41a688d9", // ЗДвП чл. 37, ал. 3
  "q-manevri-065": "20f681b40a7d67a3", // ЗДвП чл. 43, т. 1 · ЗДвП чл. 43, т. 2 · Наредба № 2/2001 надлъжна маркировка · ЗДвП чл. 6, т. 1
  "q-manevri-066": "1e2c11ee010ad52d", // ЗДвП чл. 15 · ЗДвП чл. 25
  "q-manevri-067": "2f9ffa627cdac6f8", // Наредба № 2/2001 надлъжна маркировка · ЗДвП чл. 6
  "q-manevri-068": "c9ab85c83bba7aed", // Наредба № РД-02-21-1/23.11.2023 знак В24 · ЗДвП чл. 42
  "q-manevri-069": "1a2dd10dabff99a3", // Наредба № РД-02-21-1/23.11.2023 знак В23 · ЗДвП чл. 38
  "q-manevri-070": "66eb1f05498882d4", // Наредба № РД-02-21-1/23.11.2023 знак В24 · ЗДвП чл. 43
  "q-manevri-071": "559acf5d66394e97", // Наредба № РД-02-21-1/23.11.2023 знак В22 · ЗДвП чл. 38
  "q-nosht-001": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-002": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-003": "844faf9c1a973080", // ЗДвП чл. 70
  "q-nosht-004": "844faf9c1a973080", // ЗДвП чл. 70
  "q-nosht-005": "8e6a2c2dca2e0910", // ЗДвП чл. 20 · ЗДвП чл. 77
  "q-nosht-006": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-007": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-008": "02049a2174b5b113", // ЗДвП чл. 70 · ЗДвП чл. 74
  "q-nosht-009": "031a80707d624883", // ЗДвП чл. 74
  "q-nosht-010": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-011": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-012": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-013": "844faf9c1a973080", // ЗДвП чл. 70
  "q-nosht-014": "7424e7dbac1dc912", // ЗДвП чл. 20 · ЗДвП чл. 139
  "q-nosht-015": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-016": "4ce0050c1939a73b", // ЗДвП чл. 20 · ЗДвП чл. 74
  "q-nosht-017": "8e3e7261f9378694", // ЗДвП чл. 20 · ЗДвП чл. 70
  "q-nosht-018": "8e6a2c2dca2e0910", // ЗДвП чл. 20 · ЗДвП чл. 77
  "q-nosht-019": "0e06911c8fb6b212", // ЗДвП чл. 139 · ЗДвП чл. 20
  "q-nosht-020": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-021": "844faf9c1a973080", // ЗДвП чл. 70
  "q-nosht-022": "e5a939c3e78b03ec", // ЗДвП чл. 5 · ЗДвП чл. 77
  "q-nosht-023": "844faf9c1a973080", // ЗДвП чл. 70
  "q-nosht-024": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-025": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-026": "031a80707d624883", // ЗДвП чл. 74
  "q-nosht-027": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-028": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-029": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-030": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-031": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-032": "93225e99293732ab", // ППЗДвП движение в тунел · ЗДвП чл. 70
  "q-nosht-033": "8e6a2c2dca2e0910", // ЗДвП чл. 20 · ЗДвП чл. 77
  "q-nosht-034": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-nosht-035": "02049a2174b5b113", // ЗДвП чл. 70 · ЗДвП чл. 74
  "q-nosht-036": "c63d07144877be3b", // ЗДвП чл. 70 · ЗДвП чл. 20
  "q-nosht-037": "5a46b3e443e57993", // ЗДвП чл. 20, ал. 1 · ЗДвП чл. 5, ал. 1, т. 1
  "q-nosht-038": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-039": "4ce0050c1939a73b", // ЗДвП чл. 20 · ЗДвП чл. 74
  "q-nosht-040": "662563661a0fb9a8", // ЗДвП чл. 97, ал. 4 · ЗДвП чл. 101, ал. 1 · ЗДвП чл. 139, ал. 2, т. 4
  "q-nosht-041": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-042": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-043": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-044": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-045": "dd65f5633f1ee1f2", // ППЗДвП изисквания към гумите на пътното превозно средство · ЗДвП чл. 139
  "q-nosht-046": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-047": "031a80707d624883", // ЗДвП чл. 74
  "q-nosht-048": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-049": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-nosht-050": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-051": "54275473e8dfb349", // ППЗДвП движение в тунел
  "q-nosht-052": "8e6a2c2dca2e0910", // ЗДвП чл. 20 · ЗДвП чл. 77
  "q-nosht-053": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-054": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-055": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-056": "232fa59eff2c43ff", // ЗДвП чл. 20 · ЗДвП чл. 23
  "q-nosht-057": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-nosht-058": "4ce0050c1939a73b", // ЗДвП чл. 20 · ЗДвП чл. 74
  "q-nosht-059": "b2ef9977dd6217e0", // ЗДвП чл. 97, ал. 4 · ЗДвП чл. 101, ал. 1
  "q-nosht-060": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-061": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-nosht-062": "54275473e8dfb349", // ППЗДвП движение в тунел
  "q-nosht-063": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-nosht-064": "92d17fd076d274d1", // Наредба № РД-02-21-1/23.11.2023 знак Г19 · ЗДвП чл. 139
  "q-nosht-065": "604915082344fecb", // Наредба № РД-02-21-1/23.11.2023 знак Д9 · ППЗДвП движение в тунел · ЗДвП чл. 70
  "q-osnovni-001": "6d5783f408e28d1f", // ЗДвП § 6, т. 28 ДР
  "q-osnovni-002": "cbb8f3c67f310274", // ЗДвП чл. 107, т. 2
  "q-osnovni-003": "5448959b195703e3", // ЗДвП § 6, т. 6 ДР
  "q-osnovni-004": "6f15f4c358c0ecf4", // ЗДвП § 6, т. 1, 5 и 6 ДР
  "q-osnovni-005": "b81b5ce1798fe64d", // ЗДвП чл. 15, ал. 1 · ЗДвП чл. 15, ал. 5
  "q-osnovni-006": "16949729439fe53c", // ЗДвП § 6, т. 11 ДР · ЗДвП § 6, т. 19 ДР
  "q-osnovni-007": "540e2632d2cb44d8", // ЗДвП § 6, т. 11 ДР · ЗДвП § 6, т. 12 ДР
  "q-osnovni-008": "708d6cafd528443d", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 5, ал. 3, т. 1
  "q-osnovni-009": "770830fa4036acfc", // ЗДвП чл. 5, ал. 1, т. 2 · ЗДвП чл. 137, т. 4
  "q-osnovni-010": "8ce5bfdf774963e3", // ЗДвП чл. 8, ал. 1 · ЗДвП чл. 15, ал. 1
  "q-osnovni-011": "97121a93e9e99fef", // ЗДвП чл. 15, ал. 1 · ЗДвП чл. 16, ал. 1, т. 1 · ЗДвП чл. 41, ал. 1 · ЗДвП чл. 37, ал. 1
  "q-osnovni-012": "f245c713a420c657", // ЗДвП чл. 150а, ал. 2
  "q-osnovni-013": "6923f3c92888c034", // ЗДвП чл. 151, ал. 1, т. 6 · Наредба № 37 единна учебна документация
  "q-osnovni-014": "ad64f1dad1ef8cdd", // ЗДвП чл. 150а, ал. 2, т. 6 · ЗДвП чл. 150а, ал. 2, т. 7
  "q-osnovni-015": "c9896f7ce9f451d4", // ЗДвП чл. 6, т. 2 · ЗДвП чл. 7, ал. 1
  "q-osnovni-016": "5042fb4a318ee188", // ЗДвП чл. 7, ал. 3
  "q-osnovni-017": "6cb08c0ab46d08ce", // ЗДвП чл. 137а, ал. 1
  "q-osnovni-018": "a345634d89c72776", // ЗДвП чл. 137а, ал. 1 · ЗДвП чл. 137в, ал. 1
  "q-osnovni-019": "26a4f736b4dc4c55", // ЗДвП чл. 137в, ал. 2
  "q-osnovni-020": "c59c9b24705d4643", // ЗДвП чл. 104а
  "q-osnovni-021": "c59c9b24705d4643", // ЗДвП чл. 104а
  "q-osnovni-022": "6d5bcf7abcd2df99", // ЗДвП чл. 104а · ЗДвП чл. 20, ал. 1
  "q-osnovni-023": "f43cae90701d005f", // ЗДвП § 6, т. 25 ДР
  "q-osnovni-024": "a10be4e0ba9cfec2", // ЗДвП чл. 95, ал. 1
  "q-osnovni-025": "d85955fe965b3ee0", // ЗДвП § 6, т. 2 ДР
  "q-osnovni-026": "223fcf136dffabbb", // ЗДвП чл. 58, т. 2 · ЗДвП § 6, т. 3 ДР
  "q-osnovni-027": "67e4204773bd7fd1", // ЗДвП § 6, т. 1, 5 и 6 ДР · ЗДвП чл. 15, ал. 4
  "q-osnovni-028": "20d1373d5e6eba7a", // ЗДвП § 6, т. 13 ДР · ЗДвП § 6, т. 14 ДР
  "q-osnovni-029": "421785a03c526d5c", // ЗДвП § 6, т. 17 ДР
  "q-osnovni-030": "99e4b6d6c2a2eedc", // ЗДвП § 6, т. 10 ДР · ЗДвП чл. 107, т. 1
  "q-osnovni-031": "b5a01fe24dddc0bc", // ЗДвП чл. 5, ал. 3, т. 1 · НК раздел „Престъпления по транспорта“
  "q-osnovni-032": "cf2839a919c865d0", // ЗДвП чл. 5, ал. 3, т. 1
  "q-osnovni-033": "236b716e6b036db9", // ЗДвП чл. 20, ал. 1
  "q-osnovni-035": "e04e1ac7e0bcaee2", // ЗДвП чл. 7, ал. 2
  "q-osnovni-036": "25bef125e2d96ecb", // ЗДвП чл. 6, т. 2 · ЗДвП чл. 7, ал. 2 · ЗДвП чл. 7, ал. 3 · ЗДвП чл. 7, ал. 4 · ЗДвП чл. 7, ал. 5
  "q-osnovni-037": "d365ab9d56134058", // ЗДвП чл. 137а, ал. 2
  "q-osnovni-038": "c3a850ebf41dfd79", // ЗДвП чл. 137в, ал. 5
  "q-osnovni-039": "c6557b40147fc747", // ЗДвП чл. 137в, ал. 2 · ЗДвП чл. 137в, ал. 3
  "q-osnovni-040": "c59c9b24705d4643", // ЗДвП чл. 104а
  "q-osnovni-041": "3b4f387e50728480", // ЗДвП чл. 150а, ал. 1 · ЗДвП чл. 151, ал. 1
  "q-osnovni-042": "826b790d73020691", // Наредба № 38 чл. 18а, ал. 2 · Наредба № 38 чл. 38, ал. 3 · Наредба № 38 чл. 39, ал. 1 · Наредба № 37 единна учебна документация
  "q-osnovni-043": "38bfc4c58f6aff2a", // ЗДвП чл. 70, ал. 3 · ЗДвП чл. 100, ал. 1 · ЗДвП чл. 119, ал. 1 · ЗДвП чл. 30
  "q-osnovni-044": "74effa4e6651c5c1", // ЗДвП § 6, т. 12 ДР
  "q-osnovni-045": "74effa4e6651c5c1", // ЗДвП § 6, т. 12 ДР
  "q-osnovni-046": "7556367effda86f9", // ЗДвП § 6, т. 10 ДР · ЗДвП § 6, т. 16 ДР
  "q-osnovni-047": "f39c4c9450894dff", // ЗДвП чл. 80а, ал. 1, т. 1 · ЗДвП чл. 80а, ал. 2 · ЗДвП чл. 80а, ал. 3 · ЗДвП § 6, т. 18б ДР
  "q-osnovni-048": "5d9fdbe63d01982c", // ЗДвП чл. 107, т. 3
  "q-osnovni-049": "6eb0f7aa8fba4844", // ЗДвП § 6, т. 26 ДР
  "q-osnovni-050": "20ed2fa25113d34b", // ЗДвП чл. 58, т. 3
  "q-osnovni-051": "89ebc7f6876d3158", // ЗДвП § 6, т. 87 ДР · ЗДвП чл. 15, ал. 4 · ЗДвП чл. 80а, ал. 1, т. 1
  "q-osnovni-052": "70f6fc2a313f019f", // ЗДвП чл. 100, ал. 1 · ЗДвП чл. 100, ал. 3
  "q-osnovni-053": "0778c0c1f5144781", // ЗДвП чл. 123, ал. 1
  "q-osnovni-054": "81c3632a022da068", // ЗДвП чл. 8, ал. 1 · ЗДвП чл. 15, ал. 2
  "q-osnovni-055": "29999adec257c64b", // ЗДвП чл. 150а, ал. 2 · ЗДвП чл. 151, ал. 1, т. 2
  "q-osnovni-056": "c124171e86904f9b", // ЗБЛД срок на валидност на свидетелството за управление
  "q-osnovni-057": "1ccd74c4a6f1ee04", // ЗДвП чл. 157, ал. 1 · ЗДвП чл. 157, ал. 4 · Наредба № Iз-2539 чл. 2
  "q-osnovni-058": "1803163ea4a26502", // ЗДвП чл. 6, т. 1
  "q-osnovni-059": "c34fd1fc318f5d54", // ЗДвП чл. 137а, ал. 1 · ЗДвП чл. 5, ал. 1, т. 1
  "q-osnovni-060": "fefc3b73df30533d", // Закон за закрила на детето оставяне на малолетно дете без надзор · ЗДвП чл. 5, ал. 1, т. 1
  "q-osnovni-061": "6d5bcf7abcd2df99", // ЗДвП чл. 104а · ЗДвП чл. 20, ал. 1
  "q-osnovni-062": "c91ee53c6b045e73", // ЗДвП § 6, т. 10, 11 и 12 ДР
  "q-osnovni-063": "c43b025e09edd3a0", // ЗДвП чл. 5, ал. 1, т. 1 · ЗДвП чл. 20, ал. 1
  "q-osnovni-064": "6ae3b22f557bcafe", // ЗДвП чл. 137 · ЗДвП чл. 137а, ал. 1 · ЗДвП чл. 95, ал. 1
  "q-osnovni-065": "8ce5bfdf774963e3", // ЗДвП чл. 8, ал. 1 · ЗДвП чл. 15, ал. 1
  "q-predimstvo-001": "e7e20ec76c8867df", // ЗДвП § 6, т. 31 ДР
  "q-predimstvo-002": "0ffa1c366f972a6b", // ЗДвП чл. 47 · ЗДвП чл. 20, ал. 2
  "q-predimstvo-003": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-predimstvo-004": "4e0c4ce798368a67", // ЗДвП чл. 48 · ЗДвП чл. 7
  "q-predimstvo-005": "7f4089aefdd92676", // ЗДвП чл. 48 · ЗДвП чл. 7 · ЗДвП чл. 6, т. 2
  "q-predimstvo-006": "f69726bbaecd7a9e", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 47
  "q-predimstvo-007": "52cf77f6052c10dd", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 7, ал. 2 · ЗДвП чл. 104, ал. 1
  "q-predimstvo-008": "86c6d2f0c444e434", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища
  "q-predimstvo-009": "07b33bd108f4c9ff", // ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство)
  "q-predimstvo-010": "86c6d2f0c444e434", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища
  "q-predimstvo-011": "2fca73eb5bea1d93", // ЗДвП чл. 37, ал. 1
  "q-predimstvo-012": "3c51ad42b33e210e", // ЗДвП чл. 37, ал. 1 · ЗДвП чл. 28, ал. 1
  "q-predimstvo-013": "5b74018f368a74a8", // ЗДвП чл. 37, ал. 1 · ЗДвП чл. 119, ал. 4
  "q-predimstvo-014": "3f873f68f296951e", // ЗДвП чл. 48 · ЗДвП чл. 8, ал. 2
  "q-predimstvo-015": "333b42e0a9a6eaa8", // ЗДвП чл. 48 · ЗДвП чл. 7, ал. 2 · ЗДвП чл. 19, ал. 1
  "q-predimstvo-016": "0d436fa40e5cc0e8", // ЗДвП чл. 104, ал. 1 · ЗДвП чл. 91, ал. 1
  "q-predimstvo-017": "7c5f999fcd6d1c32", // ЗДвП чл. 91, ал. 1 · ЗДвП чл. 104, ал. 1
  "q-predimstvo-018": "a2892cda41a688d9", // ЗДвП чл. 37, ал. 3
  "q-predimstvo-019": "b913250fdbc43027", // ЗДвП чл. 37, ал. 3 · ЗДвП чл. 49
  "q-predimstvo-020": "c576c6c05cf4e5b4", // ЗДвП чл. 67
  "q-predimstvo-021": "fb628213f56b8691", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3
  "q-predimstvo-022": "df3a22021d4d93ab", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 28, ал. 1, т. 2 · ЗДвП чл. 7, ал. 2
  "q-predimstvo-023": "b4621f896e9b7fca", // ППЗДвП светлинни сигнали за регулиране на движението · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство)
  "q-predimstvo-024": "ca2d08fa2b4de44f", // ЗДвП чл. 7, ал. 1 · ЗДвП чл. 6, т. 2
  "q-predimstvo-025": "1ddc6e2e22d5ad9d", // ЗДвП чл. 37, ал. 1 · ЗДвП чл. 48
  "q-predimstvo-026": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-predimstvo-027": "a26a1a173ed710e8", // ЗДвП чл. 48 · ЗДвП чл. 5, ал. 2, т. 1
  "q-predimstvo-028": "2abbe9447773ca59", // ЗДвП чл. 48 · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство)
  "q-predimstvo-029": "01bfcdf949991f9e", // Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · ЗДвП чл. 44, ал. 2
  "q-predimstvo-030": "ec077d84a590445a", // ЗДвП чл. 44, ал. 2
  "q-predimstvo-031": "ca9e5f4d7aa60550", // ЗДвП чл. 45, ал. 1
  "q-predimstvo-032": "7105f1a6eaca3899", // ЗДвП чл. 119, ал. 4 · ЗДвП чл. 30
  "q-predimstvo-033": "e38f8d4960c6e8ae", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 119, ал. 4
  "q-predimstvo-034": "1c22393400a9f4a7", // ЗДвП чл. 25, ал. 1 · ЗДвП чл. 28, ал. 1
  "q-predimstvo-035": "60aedf9a69c75095", // ЗДвП чл. 25, ал. 2
  "q-predimstvo-036": "3f873f68f296951e", // ЗДвП чл. 48 · ЗДвП чл. 8, ал. 2
  "q-predimstvo-037": "ecc45c1256fa55ad", // ЗДвП чл. 104, ал. 1 · ЗДвП чл. 104, ал. 2
  "q-predimstvo-038": "8faa52800cdeb845", // ЗДвП чл. 51, ал. 1 · ЗДвП чл. 51, ал. 3 · ЗДвП чл. 53, ал. 1
  "q-predimstvo-039": "bf9400a4312b3853", // ЗДвП чл. 50а · ППЗДвП светлинни сигнали за регулиране на движението
  "q-predimstvo-040": "1a43a7a1c427ae82", // ЗДвП § 6, т. 31 ДР · ЗДвП чл. 28 · ЗДвП чл. 30
  "q-predimstvo-041": "c576c6c05cf4e5b4", // ЗДвП чл. 67
  "q-predimstvo-042": "b02ce2220e654f2b", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 48 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3
  "q-predimstvo-043": "91ab33bcc55ee6ac", // ЗДвП чл. 7, ал. 2 · ППЗДвП светлинни сигнали за регулиране на движението
  "q-predimstvo-044": "e7325c794f73fa39", // ЗДвП чл. 56 · ЗДвП чл. 25, ал. 2
  "q-predimstvo-045": "d1471156996ee5cb", // ЗДвП чл. 37, ал. 1 · ЗДвП чл. 8, ал. 2
  "q-predimstvo-046": "093bdaaaa9ff753a", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 48 · ЗДвП чл. 8, ал. 2 · ППЗДвП движение спрямо релсовите превозни средства
  "q-predimstvo-047": "7c5f999fcd6d1c32", // ЗДвП чл. 91, ал. 1 · ЗДвП чл. 104, ал. 1
  "q-predimstvo-048": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-predimstvo-049": "ecc45c1256fa55ad", // ЗДвП чл. 104, ал. 1 · ЗДвП чл. 104, ал. 2
  "q-predimstvo-050": "125e403c5c185c3d", // ЗДвП чл. 40, ал. 1 · ЗДвП чл. 40, ал. 2
  "q-predimstvo-051": "9314d8bc4c9192ba", // ЗДвП чл. 119, ал. 1
  "q-predimstvo-052": "778fdf12f8354f9f", // ЗДвП чл. 119, ал. 1 · ЗДвП чл. 119, ал. 2 · ЗДвП чл. 116 · ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП § 6, т. 75 ДР · ЗДвП чл. 43, т. 6 · ЗДвП чл. 120, ал. 1, т. 2
  "q-predimstvo-053": "54cef2850cbfe3b9", // Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · ЗДвП чл. 48
  "q-predimstvo-054": "8ae9dcfb4fef94b8", // ЗДвП чл. 53, ал. 2
  "q-predimstvo-055": "40fd11b2f28f7120", // ЗДвП чл. 51, ал. 3 · ЗДвП чл. 52, т. 2 · ЗДвП чл. 43, т. 3
  "q-predimstvo-056": "266c20ac20479da8", // ЗДвП чл. 50, ал. 2 · Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци
  "q-predimstvo-057": "a1c45bf88e4ab537", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 25, ал. 2 · ЗДвП чл. 28, ал. 1, т. 2
  "q-predimstvo-058": "b9f2ad600ec15cc9", // ЗДвП чл. 119, ал. 1 · ЗДвП чл. 50, ал. 1
  "q-predimstvo-059": "55bfd5cc3efb3e5c", // ЗДвП чл. 48 · ЗДвП чл. 20, ал. 2 · ЗДвП чл. 5, ал. 1, т. 1
  "q-predimstvo-060": "13721a747f385b60", // ЗДвП чл. 48 · ЗДвП чл. 28, ал. 2
  "q-predimstvo-061": "60aedf9a69c75095", // ЗДвП чл. 25, ал. 2
  "q-predimstvo-062": "1fecaa5f8616e63b", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 35, ал. 2 · ЗДвП чл. 5, ал. 2, т. 1
  "q-predimstvo-063": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-predimstvo-064": "9ced2be00624d4bc", // ЗДвП чл. 48 · ЗДвП чл. 20, ал. 2
  "q-predimstvo-065": "5b51cdd08a3263cf", // ЗДвП чл. 37, ал. 1 · ЗДвП чл. 20, ал. 1
  "q-predimstvo-066": "2fca73eb5bea1d93", // ЗДвП чл. 37, ал. 1
  "q-predimstvo-067": "86c6d2f0c444e434", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища
  "q-predimstvo-068": "5f39b96d0b0f420d", // ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-predimstvo-069": "6d6217003809db10", // ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б1
  "q-predimstvo-070": "3c4eacc93924fc2c", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 знак Б3
  "q-predimstvo-071": "36d0775efdbb0188", // Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · ЗДвП чл. 48
  "q-predimstvo-072": "471bc1c853d817e0", // Наредба № РД-02-21-1/23.11.2023 знак Б5 · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · ЗДвП чл. 44, ал. 2
  "q-ptp-001": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-002": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-003": "a1c6b1c4c50a9843", // ЗДвП чл. 123, ал. 1, т. 2
  "q-ptp-004": "04b1dede2de27820", // ЗДвП чл. 123, ал. 1, т. 3
  "q-ptp-005": "84e87fea8abab686", // ЗДвП чл. 124 · ЗДвП чл. 175, ал. 1, т. 6
  "q-ptp-006": "a1a570389c27b0bc", // ЗДвП чл. 125 · ЗДвП чл. 123, ал. 1, т. 3
  "q-ptp-007": "da3ad72197c22eb0", // ЗДвП чл. 123, ал. 1, т. 3 · ЗДвП чл. 125, т. 1
  "q-ptp-008": "083e5d0a7acc1100", // ЗДвП чл. 123, ал. 2
  "q-ptp-009": "05fc32c63fbd8ef8", // ЗДвП чл. 123, ал. 1, т. 2 · ЗДвП чл. 175, ал. 1, т. 5 · НК наказателна отговорност за оставяне на пострадал без помощ · НК раздел „Престъпления по транспорта“
  "q-ptp-010": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-ptp-011": "48108770c929cdca", // ЗДвП чл. 97, ал. 4 · ЗДвП чл. 123
  "q-ptp-012": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-013": "47a85dc7dfd7120f", // ЗДвП чл. 124, т. 1 · ЗДвП чл. 124, т. 2 · Наредба № 24 чл. 9, т. 4
  "q-ptp-014": "42f2790b9a06a261", // ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · ЗДвП чл. 124, т. 2
  "q-ptp-015": "4ffae7bbb0feb0a4", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 2 · Наредба № 24 чл. 9, т. 4
  "q-ptp-016": "2d2efab543cb3a64", // Наредба № 24 чл. 9, т. 4
  "q-ptp-017": "69a75d5f740095f3", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · ЗДвП чл. 124, т. 1 · Наредба № 24 чл. 9, т. 4
  "q-ptp-018": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-019": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-020": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-021": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-022": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-023": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-024": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-025": "083e5d0a7acc1100", // ЗДвП чл. 123, ал. 2
  "q-ptp-026": "a1c6b1c4c50a9843", // ЗДвП чл. 123, ал. 1, т. 2
  "q-ptp-027": "95a999dae3ed4d39", // ЗДвП чл. 125
  "q-ptp-028": "083e5d0a7acc1100", // ЗДвП чл. 123, ал. 2
  "q-ptp-029": "8b105c1a47bf15a6", // ЗДвП чл. 123, ал. 1, т. 3 · ЗДвП чл. 125
  "q-ptp-030": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-031": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-ptp-032": "c997c76a1ce54a6d", // ЗДвП чл. 139, ал. 2, т. 4 · ЗДвП чл. 123
  "q-ptp-033": "544fde20797c56f0", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 4
  "q-ptp-034": "03aaf0432bf59b49", // Наредба № 24 чл. 9, т. 3
  "q-ptp-035": "c5422a9677232694", // Наредба № 24 чл. 9, т. 3 · Наредба № 24 чл. 9, т. 9
  "q-ptp-036": "2d2efab543cb3a64", // Наредба № 24 чл. 9, т. 4
  "q-ptp-037": "5604323b375ee88d", // Наредба № 24 чл. 9, т. 2 · Наредба № 24 чл. 9, т. 4
  "q-ptp-038": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-039": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-040": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-041": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-042": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-043": "d5a43a71c054cb32", // Наредба № Iз-41 двустранен констативен протокол за ПТП · ЗДвП чл. 123, ал. 1, т. 3
  "q-ptp-044": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-045": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-046": "4d90b8de36ebd745", // ЗДвП § 6, т. 30 ДР
  "q-ptp-047": "a1c6b1c4c50a9843", // ЗДвП чл. 123, ал. 1, т. 2
  "q-ptp-048": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-049": "32d88ae304dd2be4", // ЗДвП чл. 123, ал. 1, т. 3 · ЗДвП чл. 125, т. 7
  "q-ptp-050": "2dfc40906b7fc676", // Кодекс за застраховането задължителна застраховка „Гражданска отговорност“ · ЗДвП чл. 123, ал. 1, т. 3
  "q-ptp-051": "3e24c8df1ee86b80", // ЗДвП чл. 125 · ЗДвП чл. 123, ал. 2
  "q-ptp-052": "c8f58143679113f6", // ЗДвП чл. 175, ал. 1, т. 5 · ЗДвП чл. 175, ал. 2 · ЗДвП чл. 123, ал. 1, т. 1 · ЗДвП чл. 123, ал. 2
  "q-ptp-053": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-054": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-055": "528cc4a3ca698e6b", // ЗДвП чл. 123
  "q-ptp-056": "4a1483d25bf91fbb", // Наредба № 24 чл. 9, т. 4 · Наредба № 24 чл. 9, т. 6
  "q-ptp-057": "2d2efab543cb3a64", // Наредба № 24 чл. 9, т. 4
  "q-ptp-058": "42f2790b9a06a261", // ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · ЗДвП чл. 124, т. 2
  "q-ptp-059": "2d2efab543cb3a64", // Наредба № 24 чл. 9, т. 4
  "q-ptp-060": "2d2efab543cb3a64", // Наредба № 24 чл. 9, т. 4
  "q-ptp-061": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-062": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-063": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-ptp-064": "1115b9769eba1c58", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "q-signali-i-markirovka-001": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-002": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-003": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-004": "749287ba51e4aba3", // ППЗДвП светлинни сигнали за регулиране на движението · ППЗДвП напречна пътна маркировка
  "q-signali-i-markirovka-005": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-006": "ae3c1854940f5b0d", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 119, ал. 1
  "q-signali-i-markirovka-007": "d170de109e38d0f6", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 48
  "q-signali-i-markirovka-008": "8636164cb67bf44b", // ППЗДвП светлинни сигнали за регулиране на движението · ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 50, ал. 1
  "q-signali-i-markirovka-009": "bc5ce6d4144b196f", // ППЗДвП светлинни сигнали за регулиране на движението по пътни ленти
  "q-signali-i-markirovka-010": "229972a7600da476", // ЗДвП чл. 7, ал. 1 · ЗДвП чл. 10, ал. 2, т. 1
  "q-signali-i-markirovka-011": "064e9811c5bd83bd", // ЗДвП чл. 10, ал. 2, т. 2
  "q-signali-i-markirovka-012": "7ae909720174dfa5", // ЗДвП чл. 6, т. 2 · ЗДвП чл. 7, ал. 1 · ЗДвП чл. 10, ал. 2
  "q-signali-i-markirovka-013": "a2fadd4fc813ad6b", // ППЗДвП надлъжна пътна маркировка
  "q-signali-i-markirovka-014": "a2fadd4fc813ad6b", // ППЗДвП надлъжна пътна маркировка
  "q-signali-i-markirovka-015": "a0b88e967af89994", // ППЗДвП напречна пътна маркировка · ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 50, ал. 1
  "q-signali-i-markirovka-016": "b788d8310754a51e", // ППЗДвП напречна пътна маркировка · ЗДвП § 6, т. 54 ДР · ЗДвП чл. 119, ал. 1
  "q-signali-i-markirovka-017": "2813cc433a39a240", // ППЗДвП други пътни маркировки
  "q-signali-i-markirovka-018": "23e1633d3fe33456", // ЗДвП чл. 15, ал. 6 · ППЗДвП надлъжна пътна маркировка · ППЗДвП други пътни маркировки
  "q-signali-i-markirovka-019": "3656e5dea149ea49", // ЗДвП чл. 25, ал. 1 · ППЗДвП подаване на сигнали от водача
  "q-signali-i-markirovka-020": "aebd14d402fcdc12", // ЗДвП чл. 26 · ЗДвП чл. 25, ал. 1
  "q-signali-i-markirovka-021": "86f04819f41631d1", // ЗДвП чл. 91, ал. 1 · ЗДвП чл. 34, ал. 1
  "q-signali-i-markirovka-022": "9fafc84efd5c0527", // ЗДвП чл. 92, ал. 1, т. 1 · ЗДвП чл. 104, ал. 1
  "q-signali-i-markirovka-023": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-024": "fe3338981b206f36", // ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 50, ал. 1
  "q-signali-i-markirovka-025": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-026": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-027": "74723afc0a01cca8", // ЗДвП чл. 48
  "q-signali-i-markirovka-028": "064e9811c5bd83bd", // ЗДвП чл. 10, ал. 2, т. 2
  "q-signali-i-markirovka-029": "a595640f9d29a62b", // ЗДвП чл. 10, ал. 2, т. 1
  "q-signali-i-markirovka-030": "a2fadd4fc813ad6b", // ППЗДвП надлъжна пътна маркировка
  "q-signali-i-markirovka-031": "2813cc433a39a240", // ППЗДвП други пътни маркировки
  "q-signali-i-markirovka-032": "48b2ab3109d0deb1", // ЗДвП чл. 3, ал. 4 · Наредба № 2/2001 временна пътна маркировка · Наредба № 3/2010 временна организация на движението при пътни работи
  "q-signali-i-markirovka-033": "447375d426cc8bfe", // ППЗДвП сигнализиране на предимството на кръстовища · ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/2023 група Б (знаци относно предимство)
  "q-signali-i-markirovka-034": "079ac447c6f69c4f", // ЗДвП чл. 30 · ЗДвП чл. 28, ал. 2
  "q-signali-i-markirovka-035": "ab9f6c68898a6f3c", // ЗДвП чл. 26 · ЗДвП чл. 28, ал. 1, т. 1
  "q-signali-i-markirovka-036": "5f79a664cdb8ebc6", // ЗДвП чл. 26 · ЗДвП чл. 28 · ЗДвП чл. 30
  "q-signali-i-markirovka-037": "d74eaf5f0a3a7d06", // ЗДвП чл. 7, ал. 3 · ППЗДвП надлъжна пътна маркировка · ППЗДвП напречна пътна маркировка
  "q-signali-i-markirovka-038": "bc5ce6d4144b196f", // ППЗДвП светлинни сигнали за регулиране на движението по пътни ленти
  "q-signali-i-markirovka-039": "f0f44c7ac98a2f03", // ЗДвП чл. 31 · ЗДвП чл. 74а · ЗДвП чл. 86
  "q-signali-i-markirovka-040": "ecc45c1256fa55ad", // ЗДвП чл. 104, ал. 1 · ЗДвП чл. 104, ал. 2
  "q-signali-i-markirovka-041": "b1a79fa06505e40d", // ЗДвП чл. 7, ал. 1–3 · ЗДвП чл. 7, ал. 4 · ЗДвП чл. 7, ал. 5
  "q-signali-i-markirovka-042": "c158eba3f4bcd2d2", // ЗДвП чл. 52, т. 2 · ЗДвП чл. 53, ал. 1 · ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-043": "bf9400a4312b3853", // ЗДвП чл. 50а · ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-044": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-045": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-046": "d59f2e6d4057d7f8", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 37, ал. 1 · ЗДвП чл. 119, ал. 1
  "q-signali-i-markirovka-047": "2898f35694b63df7", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 12, ал. 3
  "q-signali-i-markirovka-048": "89fca123127d789c", // ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 12, ал. 4 · ЗДвП чл. 119, ал. 4
  "q-signali-i-markirovka-049": "4300763a57c6dbc5", // ЗДвП чл. 119, ал. 1 · ППЗДвП светлинни сигнали за регулиране на движението · ЗДвП чл. 30
  "q-signali-i-markirovka-050": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "q-signali-i-markirovka-051": "e3c6c6f2f3985324", // ЗДвП чл. 10, ал. 2, т. 3
  "q-signali-i-markirovka-052": "8bc68e73e527656a", // ЗДвП чл. 10, ал. 1 · ЗДвП чл. 10, ал. 2
  "q-signali-i-markirovka-053": "c9341db4eab72f50", // ППЗДвП надлъжна пътна маркировка · ЗДвП чл. 37, ал. 2
  "q-signali-i-markirovka-054": "a2fadd4fc813ad6b", // ППЗДвП надлъжна пътна маркировка
  "q-signali-i-markirovka-055": "a2fadd4fc813ad6b", // ППЗДвП надлъжна пътна маркировка
  "q-signali-i-markirovka-056": "2bd000186957eebc", // Наредба № 2/2001 цветове на пътната маркировка · ППЗДвП други пътни маркировки
  "q-signali-i-markirovka-057": "583812826608ee71", // ЗДвП чл. 99, ал. 1 · ЗДвП чл. 99, ал. 2 · Наредба № РД-02-21-1/2023 означаване на зоните за платено паркиране · Наредба № 2/2001 цветове на пътната маркировка
  "q-signali-i-markirovka-058": "0d9f9fde05b8c6e3", // ЗДвП чл. 15, ал. 6 · ЗДвП § 6, т. 4 ДР · ЗДвП чл. 35, ал. 1 · ЗДвП чл. 183, ал. 4, т. 12 · ППЗДвП надлъжна пътна маркировка · ППЗДвП означаване на лентите със специално предназначение
  "q-signali-i-markirovka-059": "ce5c5c33ae585901", // Наредба № 2/2001 цветове на пътната маркировка · Наредба № 2/2001 временна пътна маркировка · ППЗДвП други пътни маркировки
  "q-signali-i-markirovka-060": "48b2ab3109d0deb1", // ЗДвП чл. 3, ал. 4 · Наредба № 2/2001 временна пътна маркировка · Наредба № 3/2010 временна организация на движението при пътни работи
  "q-signali-i-markirovka-061": "dcf86216b1c929f5", // ЗДвП чл. 34, ал. 2 · ЗДвП чл. 91, ал. 1
  "q-signali-i-markirovka-062": "c38923b2d313340d", // ЗДвП чл. 28, ал. 2 · ЗДвП чл. 30 · ЗДвП чл. 70, ал. 2
  "q-signali-i-markirovka-063": "eae1c501e9106192", // ЗДвП чл. 50, ал. 1
  "q-signali-i-markirovka-064": "bc5ce6d4144b196f", // ППЗДвП светлинни сигнали за регулиране на движението по пътни ленти
  "q-signali-i-markirovka-065": "af4ec9a4449a26e4", // ППЗДвП надлъжна пътна маркировка · ЗДвП чл. 6
  "q-signs-001": "0db621d6aae6ba54", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство)
  "q-signs-002": "ba6c3310884bfe42", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 знак Г1
  "q-signs-003": "e94ed063a783c8b5", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 форма и цвят на пътните знаци
  "q-signs-004": "4c313426d81a02e9", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци)
  "q-signs-005": "829614b628217919", // ЗДвП чл. 20 · ЗДвП чл. 117 · Наредба № РД-02-21-1/23.11.2023 знак А19
  "q-signs-006": "48108407825e7659", // ЗДвП чл. 50 · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство)
  "q-signs-007": "edb0ab7ac352b61e", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-signs-008": "edb0ab7ac352b61e", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-signs-009": "fbd69c72bcb3a783", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 48 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б1
  "q-signs-010": "ff6ddc502d87c7d2", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци)
  "q-signs-011": "ce3087aa0f7543e6", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знак В26 · Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци
  "q-signs-012": "dab0e059223e3bcc", // Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци · ЗДвП чл. 6
  "q-signs-013": "a306ea96c5af2863", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 знак Г2
  "q-signs-014": "3e9dfc0ec473782d", // Наредба № РД-02-21-1/23.11.2023 знак Д5 · Наредба № РД-02-21-1/23.11.2023 група Д (знаци със специални предписания) · ЗДвП чл. 6
  "q-signs-015": "778ab2e6703be271", // Наредба № РД-02-21-1/23.11.2023 знак Д15 · ЗДвП чл. 6
  "q-signs-016": "032a1aa003ad4551", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 знак Е7
  "q-signs-017": "e6c48d71492ca98e", // ЗДвП чл. 25 · Наредба № РД-02-21-1/23.11.2023 знаци за направления и обекти
  "q-signs-018": "832eddb1fed41fb8", // Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци · ЗДвП чл. 6
  "q-signs-019": "832eddb1fed41fb8", // Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци · ЗДвП чл. 6
  "q-signs-020": "dafece23a0ef4cc2", // Наредба № РД-02-21-1/23.11.2023 временна сигнализация при ремонтни работи · ЗДвП чл. 6
  "q-signs-021": "c0fdbd95f1656772", // Наредба № РД-02-21-1/23.11.2023 знак В24 · Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци · ЗДвП чл. 6
  "q-signs-022": "78a9fe1e99bf8409", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · Наредба № РД-02-21-1/23.11.2023 знаци Б1 и Б2
  "q-signs-023": "675c7315ee719385", // ЗДвП чл. 50, ал. 1 · ЗДвП чл. 48 · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3 · Наредба № РД-02-21-1/23.11.2023 знак Б3
  "q-signs-024": "0bc35a853b03f221", // ЗДвП чл. 48 · ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · Наредба № РД-02-21-1/23.11.2023 знак Б4
  "q-signs-025": "d6e1585cd3e47268", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 знак Б5
  "q-signs-026": "15dc19ffacb0e3bb", // Наредба № РД-02-21-1/23.11.2023 знак Б1 · Наредба № РД-02-21-1/23.11.2023 знак Б2 · ЗДвП чл. 6
  "q-signs-027": "45f5d95a3fc56a3c", // ЗДвП чл. 50 · ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-signs-028": "edb0ab7ac352b61e", // ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-signs-029": "ff43c921fbe86025", // ЗДвП чл. 7 · ЗДвП чл. 50 · Наредба № РД-02-21-1/23.11.2023 знак Б2
  "q-signs-030": "b9c3fdde52bf2940", // Наредба № РД-02-21-1/23.11.2023 знак В1 · ЗДвП чл. 6
  "q-signs-031": "e402e54944beaa6f", // ЗДвП чл. 93 · Наредба № РД-02-21-1/23.11.2023 знак В28
  "q-signs-032": "a7cf0209d0c4c475", // ЗДвП чл. 6, т. 1 · Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак В24
  "q-signs-033": "07a59edc804b315a", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знак В34 · Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци
  "q-signs-034": "000963b3faa85a07", // Наредба № РД-02-21-1/23.11.2023 знак Г17 · ЗДвП чл. 21
  "q-signs-035": "287353477999a408", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак Д4
  "q-signs-036": "2cfa69259032e325", // Наредба № РД-02-21-1/23.11.2023 знак А18 · Наредба № РД-02-21-1/23.11.2023 знак Д17 · ЗДвП чл. 119
  "q-signs-037": "ea6ae01782dc1ee0", // ЗДвП чл. 50 · Наредба № РД-02-21-1/23.11.2023 знак А26
  "q-signs-038": "fecf0be24150e4f1", // ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 знак А15
  "q-signs-039": "832eddb1fed41fb8", // Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци · ЗДвП чл. 6
  "q-signs-040": "3f1d9d4fddc1e05e", // ЗДвП чл. 21 · ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци
  "q-signs-041": "a5c15d732081ffd1", // Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци · Наредба № РД-02-21-1/23.11.2023 знак В1 · ЗДвП чл. 6
  "q-signs-042": "d241c01e3dd163bf", // ЗДвП чл. 21, ал. 1 · ЗДвП чл. 55, ал. 1 · ЗДвП чл. 58, т. 3 · Наредба № РД-02-21-1/23.11.2023 знаци Д5 и Д6
  "q-signs-043": "212c896d57db74c3", // Наредба № РД-02-21-1/23.11.2023 временна сигнализация при ремонтни работи · Наредба № РД-02-21-1/23.11.2023 знак А23 · ЗДвП чл. 6
  "q-signs-044": "38a13616053f3e99", // ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 знак А12
  "q-signs-045": "e106b7d1dc100436", // ЗДвП чл. 63, т. 3 · ЗДвП чл. 64 · Наредба № РД-02-21-1/23.11.2023 група Д (знаци със специални предписания) · Наредба № РД-02-21-1/23.11.2023 знак Д9
  "q-signs-046": "3e488f3c9d7abfdc", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3
  "q-signs-047": "d9a19317a99d5065", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 група Е (указателни знаци) · Наредба № РД-02-21-1/23.11.2023 група Ж
  "q-signs-048": "4845f93d9d3f4e76", // ЗДвП чл. 62, т. 1 · ЗДвП чл. 62, т. 2 · ЗДвП чл. 62, т. 3 · Наредба № РД-02-21-1/23.11.2023 група Д (знаци със специални предписания) · Наредба № РД-02-21-1/23.11.2023 знак Д15
  "q-signs-049": "23699ff29e2f9c57", // ЗДвП чл. 62, т. 4 · Наредба № РД-02-21-1/23.11.2023 група Д (знаци със специални предписания) · Наредба № РД-02-21-1/23.11.2023 знак Д16
  "q-signs-050": "cfc6fd1d91401988", // ЗДвП чл. 6 · Наредба № РД-02-21-1/23.11.2023 форма и цвят на пътните знаци · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак Г15а (група Г)
  "q-signs-051": "d33e6333877990b9", // Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 група В · ЗДвП чл. 6
  "q-signs-052": "3525cb123dc488fb", // ЗДвП чл. 93 · Наредба № РД-02-21-1/23.11.2023 знак В27
  "q-signs-053": "4e7afa3581b9ce26", // ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 група Б (знаци относно предимство) · Наредба № РД-02-21-1/23.11.2023 знаци Б5 и Б6
  "q-signs-054": "ff952bb59d57b351", // ЗДвП чл. 50, ал. 2 · ППЗДвП сигнализиране на предимството на кръстовища · Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3 · Наредба № РД-02-21-1/23.11.2023 табела Т13
  "q-signs-055": "e4146ae04da73e04", // ЗДвП чл. 6 · ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци)
  "q-signs-056": "134ff7f3f4385899", // Наредба № РД-02-21-1/23.11.2023 поставяне на предупредителните знаци (група А) · ЗДвП чл. 6, т. 1
  "q-signs-057": "e15cae07f5c08898", // ЗДвП чл. 6 · ЗДвП чл. 40 · Наредба № РД-02-21-1/23.11.2023 знак Г4
  "q-signs-058": "3671d60d0cee908e", // ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 знак А5
  "q-signs-059": "e4146ae04da73e04", // ЗДвП чл. 6 · ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци)
  "q-signs-060": "4853398b7f8608b8", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знак Д11
  "q-signs-061": "25806f2ae34e1c8c", // ЗДвП чл. 20 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци)
  "q-signs-062": "6e920d99d9b139f4", // ЗДвП чл. 6, т. 1 · Наредба № РД-02-21-1/23.11.2023 означаване на препоръчителната скорост · Наредба № РД-02-21-1/23.11.2023 група Е (указателни знаци) · Наредба № РД-02-21-1/23.11.2023 знак Ж19
  "q-signs-063": "deac62d4a61d1377", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знак В26 · Наредба № РД-02-21-1/23.11.2023 знак Г17
  "q-signs-064": "a29f8b17876ff40d", // ЗДвП чл. 6, т. 1 · ЗДвП чл. 50, ал. 1 · ППЗДвП сигнализиране на предимството на кръстовища · ППЗДвП напречна пътна маркировка · Наредба № РД-02-21-1/23.11.2023 знак Б1
  "q-signs-065": "b943f656cfcabb55", // Наредба № РД-02-21-1/23.11.2023 знак А1 · ЗДвП чл. 6
  "q-signs-066": "6818d2114e9112e1", // Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · ЗДвП чл. 6
  "q-signs-067": "b2a5ca39c6079e05", // Наредба № РД-02-21-1/23.11.2023 знак А5 · ЗДвП чл. 20
  "q-signs-068": "3f56f9b6ec29be73", // Наредба № РД-02-21-1/23.11.2023 знак А12 · ЗДвП чл. 20
  "q-signs-069": "a094a47ae5ba842b", // Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · ЗДвП чл. 20
  "q-signs-070": "3f8875ea12f17780", // Наредба № РД-02-21-1/23.11.2023 знак А23 · ЗДвП чл. 6
  "q-signs-071": "a2f4ea7bd0ff7402", // Наредба № РД-02-21-1/23.11.2023 знак А30 · ЗДвП чл. 15
  "q-signs-072": "8959c37a56c568e0", // Наредба № РД-02-21-1/23.11.2023 знак А39 · ЗДвП чл. 20
  "q-signs-073": "42fbf67910cbc507", // Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · Наредба № РД-02-21-1/23.11.2023 група Д (знаци със специални предписания) · ЗДвП чл. 119
  "q-signs-074": "a365699ef7f87bc2", // Наредба № РД-02-21-1/23.11.2023 знак Д17 · ЗДвП чл. 119
  "q-signs-075": "0a92db18dd4499ee", // ЗДвП чл. 48 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак А25
  "q-signs-076": "13e9f7f801e1c672", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/23.11.2023 група А (предупредителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак А26
  "q-signs-077": "39294cd2904da90b", // Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · ЗДвП чл. 6
  "q-signs-078": "5f75b46f5fbdf665", // Наредба № РД-02-21-1/23.11.2023 знак В2 · ЗДвП чл. 6
  "q-signs-079": "60ba3e0f6907f467", // Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · ППЗДвП сигнализиране с пътни знаци · Наредба № РД-02-21-1/23.11.2023 знак В3 · ЗДвП чл. 6
  "q-signs-080": "473ba2fa97ab4638", // Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 знак В34 · ЗДвП чл. 6
  "q-signs-081": "f5d89e8bb4ae4b0e", // Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 форма и цвят на пътните знаци · ЗДвП чл. 6
  "q-signs-082": "ff42347e75b8d41a", // Наредба № РД-02-21-1/23.11.2023 знак Г9 · ЗДвП чл. 6
  "q-signs-083": "261f0aeee4535915", // Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · Наредба № РД-02-21-1/23.11.2023 сигнализиране на кръговото кръстовище с пътни знаци
  "q-signs-084": "f537c66e8a543ad8", // Наредба № РД-02-21-1/23.11.2023 знак Д4 · ЗДвП чл. 6
  "q-signs-085": "e51499771bc55e1e", // Наредба № РД-02-21-1/23.11.2023 знак Е21 · ЗДвП чл. 6
  "q-signs-086": "c6047b74758556a9", // Наредба № РД-02-21-1/23.11.2023 форма и цвят на пътните знаци · Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци) · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · ЗДвП чл. 6
  "q-signs-087": "f42cfc3b499cd8dd", // Наредба № РД-02-21-1/23.11.2023 знак Е22 · ЗДвП чл. 21
  "q-signs-088": "fef92e8850b1b016", // Наредба № РД-02-21-1/23.11.2023 група Е (указателни знаци) · Наредба № РД-02-21-1/23.11.2023 група Г (задължителни знаци) · ЗДвП чл. 6
  "q-speed-001": "a355a5ae5034747e", // ЗДвП чл. 21
  "q-speed-002": "a355a5ae5034747e", // ЗДвП чл. 21
  "q-speed-003": "a355a5ae5034747e", // ЗДвП чл. 21
  "q-speed-004": "d5c57c178237ce5f", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знаци В26 и В33 — зона на действие
  "q-speed-005": "d5c57c178237ce5f", // ЗДвП чл. 21 · Наредба № РД-02-21-1/23.11.2023 знаци В26 и В33 — зона на действие
  "q-speed-006": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-speed-007": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-speed-008": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-009": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-010": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-011": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-012": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-013": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-014": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-015": "43d4f6cb64e0fad5", // ЗДвП чл. 20 · ЗДвП чл. 21
  "q-speed-016": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-017": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-018": "7defb5c785b277e2", // ЗДвП чл. 24, ал. 1
  "q-speed-019": "b764840ac7b3c331", // ЗДвП чл. 22 · ЗДвП чл. 24, ал. 1
  "q-speed-020": "83e278cfeabfd3fe", // ЗДвП чл. 21, ал. 3 · ЗДвП чл. 182, ал. 3а
  "q-speed-021": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-022": "a355a5ae5034747e", // ЗДвП чл. 21
  "q-speed-023": "fc68b1bf3c13b292", // ЗДвП чл. 21, ал. 2 · ЗДвП чл. 182, ал. 1 · Наредба № 8121з-532 чл. 16, ал. 5 · Наредба за средствата за измерване, които подлежат на метрологичен контрол чл. 425, ал. 1, т. 2
  "q-speed-024": "12d064b6e2e676db", // ЗДвП чл. 21, ал. 1
  "q-speed-025": "222cb1eb5a7c8fde", // ЗДвП чл. 21 · ЗДвП чл. 182, ал. 1, т. 1 · Наредба № 8121з-532 чл. 16, ал. 5 · Наредба за средствата за измерване, които подлежат на метрологичен контрол чл. 425, ал. 1, т. 2
  "q-speed-026": "ef2d303d6780156a", // ЗДвП чл. 62, т. 2 · Наредба № РД-02-21-1/23.11.2023 знак Д15
  "q-speed-027": "05f224dbcd27d9df", // ЗДвП чл. 21, ал. 1 · Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци · Наредба № РД-02-21-1/23.11.2023 знак Д12
  "q-speed-028": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-029": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-030": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-031": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-032": "16cc78ff3e0fc05e", // ЗДвП чл. 23, ал. 2
  "q-speed-033": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-034": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-035": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-036": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-037": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-038": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-039": "83e278cfeabfd3fe", // ЗДвП чл. 21, ал. 3 · ЗДвП чл. 182, ал. 3а
  "q-speed-040": "ff59fcdae91a7a90", // Наредба № РД-02-21-1/23.11.2023 знак Г17 · ЗДвП чл. 20
  "q-speed-041": "0e926f3eb3d9e5cf", // ЗДвП чл. 20 · ЗДвП чл. 21 · ЗДвП чл. 23
  "q-speed-042": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-043": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-044": "a355a5ae5034747e", // ЗДвП чл. 21
  "q-speed-045": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-046": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-047": "0ef29a12828a7f70", // ЗДвП чл. 20, ал. 2
  "q-speed-048": "e7326c8b25cd6768", // Наредба № РД-02-21-1/23.11.2023 знак Ж19 · Наредба № РД-02-21-1/23.11.2023 знак Г17
  "q-speed-049": "40bd7c1c1431c164", // ЗДвП чл. 62а · ЗДвП чл. 21, ал. 2 · Наредба № РД-02-21-1/23.11.2023 знаци Д13 и Д14
  "q-speed-050": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-051": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-052": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-053": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-054": "43d4f6cb64e0fad5", // ЗДвП чл. 20 · ЗДвП чл. 21
  "q-speed-055": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-056": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-speed-057": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-058": "4077e80b157a9a26", // Наредба № РД-02-21-1/23.11.2023 знаци В26 и В33 · Наредба № РД-02-21-1/23.11.2023 знак Г17
  "q-speed-059": "1c1b7c9453fe286c", // ЗДвП чл. 182, ал. 1
  "q-speed-060": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-061": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-062": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-speed-063": "e09bb65bad10e019", // ЗДвП чл. 182, ал. 1, т. 6
  "q-speed-064": "0e926f3eb3d9e5cf", // ЗДвП чл. 20 · ЗДвП чл. 21 · ЗДвП чл. 23
  "q-speed-065": "1da1487f1c555ae7", // ЗДвП чл. 23 · ЗДвП чл. 20
  "q-speed-066": "0a76ba793b53c270", // ЗДвП чл. 62а · ЗДвП чл. 117
  "q-speed-067": "d2aa111fedf55d31", // Наредба № РД-02-21-1/23.11.2023 знак В26 · ЗДвП чл. 21
  "q-speed-068": "8c25681bd1457c66", // Наредба № РД-02-21-1/23.11.2023 знак Д11 · ЗДвП чл. 21
  "q-spirane-i-parkirane-001": "db47d7e85b364553", // ЗДвП чл. 93, ал. 1
  "q-spirane-i-parkirane-002": "b0113134caf7b8a0", // ЗДвП чл. 93
  "q-spirane-i-parkirane-003": "b0113134caf7b8a0", // ЗДвП чл. 93
  "q-spirane-i-parkirane-004": "8cf6d5148e18ca8b", // ЗДвП чл. 94
  "q-spirane-i-parkirane-005": "8cf6d5148e18ca8b", // ЗДвП чл. 94
  "q-spirane-i-parkirane-006": "4afbf845554b2dd4", // ЗДвП чл. 94, ал. 3
  "q-spirane-i-parkirane-007": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-008": "d4735137fa1854ff", // ЗДвП чл. 98, ал. 1 · ЗДвП чл. 98, ал. 2, т. 3
  "q-spirane-i-parkirane-009": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-010": "c7a6e122ef656368", // ЗДвП чл. 98, ал. 2
  "q-spirane-i-parkirane-011": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-012": "c7a6e122ef656368", // ЗДвП чл. 98, ал. 2
  "q-spirane-i-parkirane-013": "e204e426d3e64fed", // Наредба № РД-02-21-1/23.11.2023 знак В28 · ЗДвП чл. 93
  "q-spirane-i-parkirane-014": "5c18267de4483d8a", // Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци
  "q-spirane-i-parkirane-015": "d694a60ed5ddfd42", // ЗДвП чл. 99
  "q-spirane-i-parkirane-016": "1cfa9050c15716b2", // ЗДвП чл. 95
  "q-spirane-i-parkirane-017": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-018": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-019": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-020": "3ffee3d08ca3a62c", // ЗДвП чл. 98, ал. 2, т. 4 · ЗДвП чл. 99а, ал. 1
  "q-spirane-i-parkirane-021": "82670ca81cf7217b", // ЗДвП чл. 171, т. 5
  "q-spirane-i-parkirane-022": "82670ca81cf7217b", // ЗДвП чл. 171, т. 5
  "q-spirane-i-parkirane-023": "c1b8a37f326827ef", // ЗДвП чл. 97 · ЗДвП чл. 93
  "q-spirane-i-parkirane-024": "4611142929808d82", // ЗДвП чл. 97
  "q-spirane-i-parkirane-025": "4611142929808d82", // ЗДвП чл. 97
  "q-spirane-i-parkirane-026": "7dd4c6ef161af3a7", // ЗДвП чл. 98, ал. 1
  "q-spirane-i-parkirane-027": "c901a52bd2a38f3f", // ЗДвП чл. 98, ал. 2, т. 3 · ЗДвП чл. 183, ал. 4, т. 8
  "q-spirane-i-parkirane-028": "0913ac42ae8f9d9b", // ЗДвП чл. 98, ал. 1 · ЗДвП чл. 98, ал. 2
  "q-spirane-i-parkirane-029": "e18e1ee22c90672b", // ЗДвП чл. 98, ал. 1, т. 5 · ЗДвП § 6, т. 86
  "q-spirane-i-parkirane-030": "e07cd61df3bc0497", // ЗДвП чл. 73
  "q-spirane-i-parkirane-031": "8cf6d5148e18ca8b", // ЗДвП чл. 94
  "q-spirane-i-parkirane-032": "07160eda77054abd", // ЗДвП чл. 25
  "q-spirane-i-parkirane-033": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-spirane-i-parkirane-034": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-035": "0af3d37a80ee2f18", // ЗДвП чл. 97 · ЗДвП чл. 101, ал. 1
  "q-spirane-i-parkirane-036": "2a56cabd90ad1bd0", // ЗДвП чл. 167, ал. 2
  "q-spirane-i-parkirane-037": "923902889d14c447", // ЗДвП чл. 99а
  "q-spirane-i-parkirane-038": "1cfa9050c15716b2", // ЗДвП чл. 95
  "q-spirane-i-parkirane-039": "b0113134caf7b8a0", // ЗДвП чл. 93
  "q-spirane-i-parkirane-040": "82670ca81cf7217b", // ЗДвП чл. 171, т. 5
  "q-spirane-i-parkirane-041": "ae437eced97bef76", // ЗДвП чл. 93 · ЗДвП чл. 98
  "q-spirane-i-parkirane-042": "d36c074c31590050", // Наредба № РД-02-21-1/23.11.2023 допълнителни табели към пътните знаци · Наредба № РД-02-21-1/23.11.2023 табели Т10 и Т15
  "q-spirane-i-parkirane-043": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-spirane-i-parkirane-044": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-045": "66041b24a1cdc11c", // ЗДвП чл. 94, ал. 4 · ЗДвП чл. 94, ал. 3
  "q-spirane-i-parkirane-046": "d08367b052ba7037", // ЗДвП чл. 58, т. 1 · ЗДвП чл. 58, т. 3
  "q-spirane-i-parkirane-047": "4611142929808d82", // ЗДвП чл. 97
  "q-spirane-i-parkirane-048": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-049": "c2753279bb2b6f47", // ЗДвП чл. 61 · ЗДвП чл. 62
  "q-spirane-i-parkirane-050": "e621f8f756ed722f", // Наредба № РД-02-21-1/23.11.2023 знаци Г15а и Г15б · Наредба № РД-02-21-1/23.11.2023 табела Т7
  "q-spirane-i-parkirane-051": "d694a60ed5ddfd42", // ЗДвП чл. 99
  "q-spirane-i-parkirane-052": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-053": "f2831ba39295d110", // ЗДвП чл. 96
  "q-spirane-i-parkirane-054": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "q-spirane-i-parkirane-055": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-056": "9ca2e6fa2228a622", // ЗДвП чл. 98, ал. 1, т. 4
  "q-spirane-i-parkirane-057": "a6dbfda4eb1d9e49", // Наредба № РД-02-21-1/23.11.2023 табела Т2 · Наредба № РД-02-21-1/23.11.2023 зона на действие на пътните знаци
  "q-spirane-i-parkirane-058": "b0113134caf7b8a0", // ЗДвП чл. 93
  "q-spirane-i-parkirane-059": "6d646b2df0acc96b", // ЗДвП чл. 101, ал. 1 · ЗДвП чл. 139, ал. 2, т. 4
  "q-spirane-i-parkirane-060": "0af3d37a80ee2f18", // ЗДвП чл. 97 · ЗДвП чл. 101, ал. 1
  "q-spirane-i-parkirane-061": "40afd7bb75dada9a", // ЗДвП чл. 98, ал. 1, т. 7
  "q-spirane-i-parkirane-062": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "q-spirane-i-parkirane-063": "b0113134caf7b8a0", // ЗДвП чл. 93
  "q-spirane-i-parkirane-064": "fd2271d712d600bd", // ЗДвП чл. 98, ал. 2, т. 4 · ЗДвП чл. 98, ал. 1, т. 1
  "q-spirane-i-parkirane-065": "c901a52bd2a38f3f", // ЗДвП чл. 98, ал. 2, т. 3 · ЗДвП чл. 183, ал. 4, т. 8
  "q-spirane-i-parkirane-066": "3392f58861176b18", // ЗДвП чл. 98
  "q-spirane-i-parkirane-067": "a6fc3bb537e288e2", // Наредба № РД-02-21-1/23.11.2023 знак В27 · ЗДвП чл. 98
  "q-spirane-i-parkirane-068": "222bc3775688fbe5", // Наредба № РД-02-21-1/23.11.2023 знак В28 · ЗДвП чл. 98
  "q-spirane-i-parkirane-069": "2b58d5cf104341ba", // Наредба № РД-02-21-1/23.11.2023 знак Д24 · ЗДвП чл. 98, ал. 2, т. 3 · ЗДвП чл. 183, ал. 4, т. 8
  "q-uyazvimi-001": "3f4a45a3a8a71d2f", // ЗДвП чл. 119
  "q-uyazvimi-002": "9450d8a7cda56d6b", // ЗДвП чл. 43, т. 5 и т. 6 · ЗДвП чл. 119, ал. 2
  "q-uyazvimi-003": "4740605333005c5e", // ЗДвП чл. 43, т. 5 и т. 6 · ЗДвП чл. 98, ал. 1, т. 5 · ЗДвП чл. 119, ал. 2
  "q-uyazvimi-004": "45ae89b5f9a94909", // ЗДвП чл. 119, ал. 1 · ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП § 6, т. 75 ДР
  "q-uyazvimi-005": "244c6bd3a071a7ad", // ЗДвП чл. 116 · ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП § 6, т. 75 ДР
  "q-uyazvimi-006": "92754ac824eeb54f", // ЗДвП чл. 116
  "q-uyazvimi-007": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "q-uyazvimi-008": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "q-uyazvimi-009": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "q-uyazvimi-010": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-uyazvimi-011": "07160eda77054abd", // ЗДвП чл. 25
  "q-uyazvimi-012": "e600457112243faf", // ЗДвП чл. 80 · ЗДвП чл. 42
  "q-uyazvimi-013": "c60efee7f895ae10", // ЗДвП чл. 80а, ал. 1, т. 1 · ЗДвП чл. 80а, ал. 2, т. 12 · ЗДвП чл. 15, ал. 1
  "q-uyazvimi-014": "db7647f28053a3f0", // ЗДвП чл. 80а, ал. 1, т. 1 · ЗДвП чл. 80а, ал. 1, т. 3 · ЗДвП чл. 80а, ал. 1, т. 4 · ЗДвП чл. 80а, ал. 2, т. 3 · ЗДвП чл. 80а, ал. 2, т. 6
  "q-uyazvimi-015": "6b81857e4073e66b", // ЗДвП чл. 37 · ЗДвП чл. 20
  "q-uyazvimi-016": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-uyazvimi-017": "b43272da7e707e11", // ЗДвП чл. 62, т. 1 · ЗДвП чл. 62, т. 3
  "q-uyazvimi-018": "a7e55858e08752dc", // ЗДвП чл. 62, т. 4
  "q-uyazvimi-019": "92754ac824eeb54f", // ЗДвП чл. 116
  "q-uyazvimi-020": "07160eda77054abd", // ЗДвП чл. 25
  "q-uyazvimi-021": "6b0a857e8b9109b6", // Наредба № РД-02-21-1/23.11.2023 група В (забранителни знаци)
  "q-uyazvimi-022": "e9f4a9f77cd3851e", // ЗДвП чл. 108, ал. 1 · ЗДвП чл. 113, ал. 2
  "q-uyazvimi-023": "2f2136232f11fc96", // ЗДвП чл. 120
  "q-uyazvimi-024": "2f2136232f11fc96", // ЗДвП чл. 120
  "q-uyazvimi-025": "3392f58861176b18", // ЗДвП чл. 98
  "q-uyazvimi-026": "fa3f2991de5440b7", // ЗДвП чл. 20 · ЗДвП чл. 119
  "q-uyazvimi-027": "5d3cd1a83195ca70", // ЗДвП чл. 116 · ЗДвП чл. 20
  "q-uyazvimi-028": "1401c9b8ccfb308c", // ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП § 6, т. 75 ДР · ЗДвП чл. 20, ал. 2
  "q-uyazvimi-029": "56ccc42aa91fb2fa", // ЗДвП чл. 108
  "q-uyazvimi-030": "9a44f9438b05a658", // ЗДвП чл. 40 · ЗДвП чл. 117
  "q-uyazvimi-031": "07160eda77054abd", // ЗДвП чл. 25
  "q-uyazvimi-032": "7d84e6802488fcd4", // ЗДвП чл. 23
  "q-uyazvimi-033": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-uyazvimi-034": "07160eda77054abd", // ЗДвП чл. 25
  "q-uyazvimi-035": "7fdd606aa5e3c0bc", // ЗДвП чл. 80а, ал. 3
  "q-uyazvimi-036": "ada4f07cd2cc6675", // ЗДвП чл. 80а, ал. 1, т. 1 · ЗДвП чл. 80а, ал. 1, т. 3 · ЗДвП чл. 80а, ал. 2, т. 8 · ЗДвП чл. 80а, ал. 2, т. 12
  "q-uyazvimi-037": "2647af5016dab273", // ЗДвП чл. 80
  "q-uyazvimi-038": "ac69ab6360d9a189", // ЗДвП чл. 108 · ЗДвП чл. 116
  "q-uyazvimi-039": "1734b7087653557d", // ЗДвП чл. 20 · ЗДвП чл. 116
  "q-uyazvimi-040": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "q-uyazvimi-041": "42c618d6a0d9bd98", // ЗДвП чл. 66, ал. 1
  "q-uyazvimi-042": "e3364b39f3bf23d2", // ЗДвП чл. 62, т. 2
  "q-uyazvimi-043": "f59e7789937130f6", // ЗДвП чл. 117 · ЗДвП чл. 20
  "q-uyazvimi-044": "f3d98c0b586a02ee", // ЗДвП § 6, т. 75 ДР · ЗДвП чл. 116
  "q-uyazvimi-045": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-uyazvimi-046": "eed436f609778dac", // ЗДвП чл. 119 · ЗДвП чл. 116
  "q-uyazvimi-047": "92754ac824eeb54f", // ЗДвП чл. 116
  "q-uyazvimi-048": "92754ac824eeb54f", // ЗДвП чл. 116
  "q-uyazvimi-049": "3bd6913806ed69cb", // ЗДвП чл. 116 · ЗДвП чл. 117
  "q-uyazvimi-050": "f9acf7b500c69822", // ЗДвП чл. 42
  "q-uyazvimi-051": "f67a11480b0165c8", // ЗДвП чл. 23 · ЗДвП чл. 42
  "q-uyazvimi-052": "eed436f609778dac", // ЗДвП чл. 119 · ЗДвП чл. 116
  "q-uyazvimi-053": "ab928ab891ab69c2", // Наредба № РД-02-21-1/2023 група А
  "q-uyazvimi-054": "45ae89b5f9a94909", // ЗДвП чл. 119, ал. 1 · ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП § 6, т. 75 ДР
  "q-uyazvimi-055": "1734b7087653557d", // ЗДвП чл. 20 · ЗДвП чл. 116
  "q-uyazvimi-056": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-uyazvimi-057": "2673439bb5b0b3eb", // ЗДвП чл. 42 · ЗДвП чл. 80
  "q-uyazvimi-058": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "q-uyazvimi-059": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-uyazvimi-060": "1734b7087653557d", // ЗДвП чл. 20 · ЗДвП чл. 116
  "q-uyazvimi-061": "c801d9d93fc2970b", // ЗДвП чл. 25 · ЗДвП чл. 42
  "q-uyazvimi-062": "81b33bf561929a5d", // ЗДвП чл. 120 · ЗДвП чл. 116
  "q-uyazvimi-063": "c801d9d93fc2970b", // ЗДвП чл. 25 · ЗДвП чл. 42
  "q-uyazvimi-064": "b3ac324ddfe6aaef", // ЗДвП чл. 20 · ЗДвП чл. 42
  "q-uyazvimi-065": "6acc33469ec7fcad", // ЗДвП чл. 116 · ЗДвП чл. 119
  "q-uyazvimi-066": "3f4a45a3a8a71d2f", // ЗДвП чл. 119
  "q-uyazvimi-067": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "q-uyazvimi-068": "777ac4d226053f2d", // ЗДвП чл. 37 · ЗДвП чл. 25
  "q-uyazvimi-069": "deae79721d2d8b0f", // ЗДвП чл. 67 · ЗДвП чл. 116
  "q-uyazvimi-070": "215c943ec202595e", // Наредба № РД-02-21-1/23.11.2023 знак А19 · ЗДвП чл. 117
  "q-uyazvimi-071": "c5ce9a29d64cb8de", // Наредба № РД-02-21-1/23.11.2023 знак А20 · ЗДвП чл. 116
  "q-uyazvimi-072": "234493bef05c0bfc", // Наредба № РД-02-21-1/23.11.2023 знак Д15
  "q-vehicle-001": "844faf9c1a973080", // ЗДвП чл. 70
  "q-vehicle-002": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-003": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-004": "00147bd2feced180", // ППЗДвП изисквания към гумите на пътното превозно средство · ЗДвП чл. 139, ал. 1, т. 1 · ЗДвП чл. 139, ал. 1, т. 4
  "q-vehicle-005": "d8fb79bc510c28df", // ЗДвП чл. 139, ал. 2 · ЗДвП чл. 139, ал. 8
  "q-vehicle-006": "6d646b2df0acc96b", // ЗДвП чл. 101, ал. 1 · ЗДвП чл. 139, ал. 2, т. 4
  "q-vehicle-007": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-008": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-009": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-010": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-011": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-012": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-013": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-014": "53bbb13c272ccdb9", // ЗДвП чл. 97, ал. 3 · ЗДвП чл. 97, ал. 4 · ЗДвП чл. 97, ал. 5 · ЗДвП чл. 101, ал. 1
  "q-vehicle-015": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-vehicle-016": "031a80707d624883", // ЗДвП чл. 74
  "q-vehicle-017": "07160eda77054abd", // ЗДвП чл. 25
  "q-vehicle-018": "7424e7dbac1dc912", // ЗДвП чл. 20 · ЗДвП чл. 139
  "q-vehicle-019": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-020": "fe4ad699aa7bfe96", // ЗДвП чл. 137 · ЗДвП чл. 137а
  "q-vehicle-021": "f786de4e5b1be828", // ЗДвП чл. 127
  "q-vehicle-022": "8f7c7d63dae932ff", // ЗДвП чл. 70, ал. 1 · ЗДвП чл. 70, ал. 2, т. 1
  "q-vehicle-023": "470ad330a4eeceb8", // ЗДвП чл. 77
  "q-vehicle-024": "031a80707d624883", // ЗДвП чл. 74
  "q-vehicle-025": "844faf9c1a973080", // ЗДвП чл. 70
  "q-vehicle-026": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-027": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-028": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-029": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-030": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-031": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-032": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-033": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-034": "07160eda77054abd", // ЗДвП чл. 25
  "q-vehicle-035": "1d05ad84433ce1f5", // ЗДвП чл. 97, ал. 4
  "q-vehicle-036": "c00912c4d4a719f5", // ЗДвП чл. 147, ал. 3, т. 1
  "q-vehicle-037": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-038": "f5e9de6bad2afd6d", // ЗДвП чл. 105
  "q-vehicle-039": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-040": "c3a850ebf41dfd79", // ЗДвП чл. 137в, ал. 5
  "q-vehicle-041": "f786de4e5b1be828", // ЗДвП чл. 127
  "q-vehicle-042": "c958dce2bfe5caef", // ЗДвП чл. 31 · ЗДвП чл. 86 · ЗДвП чл. 101
  "q-vehicle-043": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-044": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-045": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-046": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-047": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-048": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-049": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-050": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-051": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-052": "07160eda77054abd", // ЗДвП чл. 25
  "q-vehicle-053": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-054": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-055": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-056": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-057": "5f465c8d05d552e0", // ЗДвП чл. 55, ал. 1 · ЗДвП чл. 84 · ЗДвП чл. 85, ал. 2 · ЗДвП чл. 86 · ЗДвП чл. 87
  "q-vehicle-058": "a47a7c8fa252663f", // ЗДвП чл. 137в, ал. 2 · ЗДвП чл. 137в, ал. 5
  "q-vehicle-059": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-060": "844faf9c1a973080", // ЗДвП чл. 70
  "q-vehicle-061": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "q-vehicle-062": "613b467b50a0ac02", // ЗДвП чл. 20
  "q-vehicle-063": "c09d83d179fc63b5", // ЗДвП чл. 97 · ЗДвП чл. 101
};
