/**
 * THE CITATION PIN — which `lawRefs` this classroom knowingly shows, pinned by
 * the hash of the exact lines it shows.
 *
 * WHY A SECOND TABLE AND NOT A SECOND COLUMN. `clearanceCarry.ts` pins
 * `summaryBg` and answers one question: „has a person read this sentence?".
 * That is the right authority for a sentence and the wrong one for a citation,
 * because what settles a citation is not an opinion — it is whether the article
 * is in content/law/acts and whether it says this. Two different claims, two
 * different proofs, two tables. The carry can be signed by a human and never by
 * a script (`MACHINE_SIGNERS`); this one is re-proved by machine on every test
 * run and is worth nothing without that proof.
 *
 * WHAT WAS WRONG. The pin covered `summaryBg` only. `resolve.ts` returns
 * `concept.lawRefs` on the same utterance, `classroom/lessonToRoom.ts` builds
 * „`${first.act} ${first.ref}`" from it and `Transcript.tsx` renders it beside
 * the sentence — so a citation could change to anything without moving any pin.
 * It had: of the 113 distinct citation strings a student could reach across the
 * 54 lessons, 45 CARRIED A QUESTION MARK — „ЗДвП чл. 25?", „ППЗДвП чл. 31?",
 * „Наредба № 37 учебна документация?". On a product whose whole claim is that
 * every rule is cited and checkable, a law reference with a question mark in it
 * is the most damaging possible typography: it neither informs nor admits.
 *
 * And the two that read as SETTLED were worse than the forty-five:
 *   c-railway-crossing cited „ППЗДвП чл. 109" for the whole mandatory-stop
 *     list. ЗДвП чл. 51, ал. 3 says only „Спирането на пътните превозни
 *     средства е задължително пред железопътен прелез, който няма бариери" —
 *     barriers-down, flashing red and „a train is coming" are чл. 52 and
 *     чл. 53, which this repo does hold and which now carry the claim.
 *   c-roundabout-rules cited „Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5"
 *     for the Б3 claim. That act is not in the repo at all.
 *
 * THE TWO STATES A PINNED CITATION MAY BE IN, and nothing else:
 *
 *   RESOLVABLE  the act is one we ship full text for and `resolveLawRef` finds
 *               the unit. The article can be quoted at the student.
 *
 *   NUMBERLESS  the act is one we do NOT hold, so the ref names NO article
 *               number — „ППЗДвП светлинни сигнали за регулиране на
 *               движението", „НК раздел „Престъпления по транспорта"". The
 *               founder's standing ruling, applied to citations: show the rule
 *               and the article with no number rather than a guessed one.
 *
 * `__tests__/clearanceCitations.test.ts` proves both properties over the real
 * repo, and `scripts/freeze-lesson-citations.mjs` refuses to pin a row that is
 * neither — so „ЗДвП чл. 999" cannot be frozen, and a re-added „?" fails the
 * freeze before it fails the test.
 *
 * TO RE-PIN after an authored change: `node scripts/freeze-lesson-citations.mjs`
 * prints every citation it is about to authorise with its verdict beside it.
 * `--check` answers „is the table current?" without vitest.
 */

/** Frozen against content/concepts.json as of this date. */
export const CITATIONS_FROZEN_AT = "2026-08-05";

/**
 * conceptId → sha256 of `lawRefs.map(r => `${r.act} ${r.ref}`).join("\n")`,
 * first 16 hex. The hashed string is the line a STUDENT SEES, not the JSON —
 * so a change that cannot reach a student cannot silence a lesson, and one that
 * can, does.
 */
export const CARRIED_CONCEPT_CITATIONS: Readonly<Record<string, string>> = {
  "c-abs-systems": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-accident-definition": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-accident-duties": "69318164abed2d46", // ЗДвП чл. 123, ал. 1, т. 1 · ЗДвП чл. 123, ал. 1, т. 2
  "c-additional-plates": "cc5e1632b5515f6a", // Наредба № РД-02-21-1/2023 група Т
  "c-additional-sections": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "c-alcohol-effects": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-alcohol-limit": "4ff5c7d325775c0d", // ЗДвП чл. 5 · ЗДвП чл. 174
  "c-animals-obstacles": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-average-speed-enforcement": "eb30e9c9d1bc04dd", // ЗДвП чл. 21, ал. 3 · ЗДвП § 6, т. 76 ДР
  "c-bleeding-control": "fbc260f64f20802c", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5
  "c-brakes": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "c-braking-distance": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-bus-pullout": "c576c6c05cf4e5b4", // ЗДвП чл. 67
  "c-bus-stops-school": "b7ff3d2aa12a6b43", // ЗДвП чл. 65 · ЗДвП чл. 122
  "c-child-safety": "26a4f736b4dc4c55", // ЗДвП чл. 137в, ал. 2
  "c-children-on-road": "7fc2b9f9f2ceabd5", // ЗДвП чл. 117
  "c-cpr-basics": "544fde20797c56f0", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 4
  "c-crosswalk-yield": "3f4a45a3a8a71d2f", // ЗДвП чл. 119
  "c-cyclists": "195d442112221a93", // ЗДвП чл. 5, ал. 2, т. 1 · ЗДвП чл. 42, ал. 2, т. 1
  "c-daytime-lights": "844faf9c1a973080", // ЗДвП чл. 70
  "c-dazzle-handling": "470ad330a4eeceb8", // ЗДвП чл. 77
  "c-defensive-principles": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-direction-signs": "3b797dd8f2bc86d3", // Наредба № РД-02-21-1/2023 група Ж
  "c-disabled-spaces": "3b2b697ba9f641ca", // ЗДвП чл. 99а, ал. 1
  "c-distraction-emotions": "c59c9b24705d4643", // ЗДвП чл. 104а
  "c-documents-required": "b2512e52f4f8639e", // ЗДвП чл. 100
  "c-driver-obligations": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-driver-signals": "07160eda77054abd", // ЗДвП чл. 25
  "c-drugs-zero": "b5a01fe24dddc0bc", // ЗДвП чл. 5, ал. 3, т. 1 · НК раздел „Престъпления по транспорта“
  "c-e-scooters": "8efb45d6641e8c38", // ЗДвП чл. 80а, ал. 1, т. 1 · ЗДвП чл. 80а, ал. 1, т. 3 · ЗДвП чл. 80а, ал. 2, т. 6 · ЗДвП чл. 80а, ал. 2, т. 12 · ЗДвП чл. 80а, ал. 3
  "c-eco-techniques": "f9a4e6b9715fb8b7", // Наредба № 37 учебна документация
  "c-elderly-disabled": "0d36a47ef1407e2a", // ЗДвП чл. 116 · ЗДвП § 6, т. 75 ДР
  "c-emergency-lane-breakdown": "4611142929808d82", // ЗДвП чл. 97
  "c-emergency-priority": "409e5f84b2e148b8", // ЗДвП чл. 92
  "c-environment-impact": "f9a4e6b9715fb8b7", // Наредба № 37 учебна документация
  "c-equal-junction": "74723afc0a01cca8", // ЗДвП чл. 48
  "c-exit-from-adjacent": "b913250fdbc43027", // ЗДвП чл. 37, ал. 3 · ЗДвП чл. 49
  "c-expressway": "0a0f287b3a998885", // ЗДвП чл. 21 · ЗДвП § 6 ДР
  "c-fatigue-microsleep": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-fines-tickets": "a51de80095836489", // ЗДвП чл. 186 · ЗДвП чл. 189
  "c-first-aid-priorities": "4ffae7bbb0feb0a4", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 2 · Наредба № 24 чл. 9, т. 4
  "c-flashing-yellow": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "c-fog-driving": "031a80707d624883", // ЗДвП чл. 74
  "c-following-distance": "7d84e6802488fcd4", // ЗДвП чл. 23
  "c-fuel-factors": "f9a4e6b9715fb8b7", // Наредба № 37 учебна документация
  "c-general-care-duty": "0d36a47ef1407e2a", // ЗДвП чл. 116 · ЗДвП § 6, т. 75 ДР
  "c-give-way-stop-behavior": "70e0b157856dd11b", // ЗДвП чл. 50
  "c-hazard-perception": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-high-beam-use": "faf0b2eb628a31a6", // ЗДвП чл. 70, ал. 2
  "c-hit-and-run": "3ff881aabe8543a8", // ЗДвП чл. 123, ал. 1, т. 1 · ЗДвП чл. 175, ал. 1, т. 5 · НК раздел „Престъпления по транспорта“
  "c-info-signs": "536d88c9879c920e", // Наредба № РД-02-21-1/2023 група Е
  "c-insurance-go": "c8a2516f21d7d240", // ЗДвП чл. 100, ал. 1, т. 3 · Кодекс за застраховането задължителна застраховка „Гражданска отговорност“
  "c-junction-approach": "12bd9a065761f32d", // ЗДвП чл. 47
  "c-junction-blocking": "bb0d0fa511cde636", // ЗДвП чл. 50а
  "c-junction-types": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-lane-change": "07160eda77054abd", // ЗДвП чл. 25
  "c-lane-choice": "96cfe37c989276ae", // ЗДвП чл. 15 · ЗДвП чл. 16
  "c-lane-control-signals": "bc5ce6d4144b196f", // ППЗДвП светлинни сигнали за регулиране на движението по пътни ленти
  "c-leaving-vehicle-safely": "9783c873079a825d", // ЗДвП чл. 95, ал. 1 · ЗДвП чл. 96
  "c-left-turn-oncoming": "f15f2d9ff4c09176", // ЗДвП чл. 37
  "c-license-categories": "113d492683f236ed", // ЗДвП чл. 150а · ЗДвП чл. 151
  "c-license-validity": "a31120a5e49256c2", // ЗДвП чл. 150а, ал. 1 · ЗБЛД срок на валидност на свидетелството за управление
  "c-license-withdrawal": "2f190367f0f17b09", // ЗДвП чл. 171 · ЗДвП чл. 174
  "c-light-junction": "e7db1ecf1fb73f78", // ЗДвП чл. 7
  "c-lights-overview": "844faf9c1a973080", // ЗДвП чл. 70
  "c-loading-passengers": "4cd548b5c571c1e7", // ЗДвП чл. 127 · ЗДвП чл. 132
  "c-longitudinal-markings": "86d7eb7da0c68f9f", // Наредба № 2/2001 надлъжна маркировка
  "c-mandatory-equipment": "03b966b9b8940247", // ЗДвП чл. 139, ал. 2 · ЗДвП чл. 139, ал. 8 · ЗДвП чл. 101, ал. 1
  "c-mandatory-signs": "7d8aac5f97627bf7", // Наредба № РД-02-21-1/2023 група Г
  "c-maneuver-principles": "07160eda77054abd", // ЗДвП чл. 25
  "c-medical-fitness": "31ebf6d85afa7877", // ЗДвП чл. 151, ал. 2 · ЗДвП чл. 151, ал. 8
  "c-medicines": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-merging-traffic": "07160eda77054abd", // ЗДвП чл. 25
  "c-mirrors-blind-spots": "07160eda77054abd", // ЗДвП чл. 25
  "c-motorcyclists-visibility": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-motorway-entry-exit": "7198c44ff34740c7", // ЗДвП чл. 55
  "c-motorway-prohibitions": "903936892201a32a", // ЗДвП чл. 58
  "c-motorway-rules": "7198c44ff34740c7", // ЗДвП чл. 55
  "c-mountain-roads": "ca9e5f4d7aa60550", // ЗДвП чл. 45, ал. 1
  "c-new-driver-status": "2c9a53f2bc84404a", // ЗДвП чл. 157, ал. 1 · Наредба № Iз-2539 чл. 2, ал. 2
  "c-night-visibility": "c63d07144877be3b", // ЗДвП чл. 70 · ЗДвП чл. 20
  "c-oncoming-passing": "c8e09a959abde8c1", // ЗДвП чл. 44 · ЗДвП чл. 45, ал. 1
  "c-other-markings": "fc114c13604af914", // Наредба № 2/2001 други маркировки
  "c-overtaken-duties": "c8f1d9c8d04e1328", // ЗДвП чл. 42, ал. 3
  "c-overtaking-procedure": "ace0271402c105ae", // ЗДвП чл. 41 · ЗДвП чл. 42
  "c-overtaking-prohibitions": "a1fe65c96d0133b2", // ЗДвП чл. 43
  "c-parking-prohibitions": "371ea66e8ac906b3", // ЗДвП чл. 98, ал. 1 · ЗДвП чл. 98, ал. 2 · ЗДвП чл. 94, ал. 3
  "c-parking-signs-zones": "3cd415a87a841434", // Наредба № РД-02-21-1/2023 В27–В28
  "c-parking-slope-securing": "f2831ba39295d110", // ЗДвП чл. 96
  "c-pedestrian-rights-duties": "56ccc42aa91fb2fa", // ЗДвП чл. 108
  "c-penalty-points": "c02fdb2ed8e5ba24", // ЗДвП чл. 157 · Наредба № Iз-2539 чл. 2
  "c-phone-use": "c59c9b24705d4643", // ЗДвП чл. 104а
  "c-police-interaction": "908206aa3e95c616", // ЗДвП чл. 103
  "c-pre-drive-check": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "c-priority-concept": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-priority-road": "74723afc0a01cca8", // ЗДвП чл. 48
  "c-priority-signs": "8abb6e5b0797765b", // Наредба № РД-02-21-1/2023 група Б
  "c-prohibition-signs": "457b10b5926caa74", // Наредба № РД-02-21-1/2023 група В
  "c-railway-crossing": "19698157ccf3da53", // ЗДвП чл. 51, ал. 2 · ЗДвП чл. 51, ал. 3 · ЗДвП чл. 51, ал. 4 · ЗДвП чл. 51, ал. 5 · ЗДвП чл. 52 · ЗДвП чл. 53
  "c-rain-aquaplaning": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-reaction-time": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-registration-inspection": "cd7b070c91a784a0", // ЗДвП чл. 140 · ЗДвП чл. 147
  "c-regulator-signals": "6411857b99375d17", // ЗДвП чл. 10, ал. 2
  "c-residential-zone": "c2753279bb2b6f47", // ЗДвП чл. 61 · ЗДвП чл. 62
  "c-reversing": "5ad70d16c734cb2d", // ЗДвП чл. 40
  "c-right-hand-rule": "70e0b157856dd11b", // ЗДвП чл. 50
  "c-right-side-rule": "7f492291bc0a6bc4", // ЗДвП чл. 8 · ЗДвП чл. 15
  "c-road-elements": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-road-participants": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-roundabout-behavior": "ace10db022be03e1", // ЗДвП чл. 25, ал. 2 · ЗДвП чл. 28, ал. 1, т. 2
  "c-roundabout-rules": "176dfed383e92879", // ЗДвП чл. 50, ал. 1 · Наредба № РД-02-21-1/2023 правила за поставяне на знак Б3
  "c-rural-road-risks": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-safety-space": "7d84e6802488fcd4", // ЗДвП чл. 23
  "c-scene-safety": "8056f3d9f199ae83", // ЗДвП чл. 97, ал. 3 · ЗДвП чл. 97, ал. 4 · ЗДвП чл. 101, ал. 1 · ЗДвП чл. 123, ал. 1, т. 2, б. „в“
  "c-seatbelts": "6bc1a81761392b3f", // ЗДвП чл. 137а
  "c-shared-zones-paths": "fc0468e6c994b6a0", // Наредба № РД-02-21-1/2023 група Д
  "c-sign-groups": "09dd159f81bd8979", // ЗДвП чл. 6 · Наредба № РД-02-21-1/2023 групи А–Ж
  "c-sign-scope": "d88db46aeebe5d77", // Наредба № РД-02-21-1/2023 зона на действие
  "c-signal-hierarchy": "e7db1ecf1fb73f78", // ЗДвП чл. 7
  "c-signed-junction": "70e0b157856dd11b", // ЗДвП чл. 50
  "c-skid-control": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-special-regime-vehicles": "f7127804d3762790", // ЗДвП чл. 91
  "c-special-rules-signs": "fc0468e6c994b6a0", // Наредба № РД-02-21-1/2023 група Д
  "c-speed-adaptation": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-speed-impact": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-speed-limits": "a355a5ae5034747e", // ЗДвП чл. 21
  "c-speed-signs-zone": "a355a5ae5034747e", // ЗДвП чл. 21
  "c-stop-give-way-signs": "70e0b157856dd11b", // ЗДвП чл. 50
  "c-stop-parking-definitions": "9348ddb5a9a10594", // ЗДвП § 6 ДР
  "c-stopping-distance-total": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-stopping-standing-rules": "66e6fe045efd3cef", // ЗДвП чл. 94, ал. 1 · ЗДвП чл. 94, ал. 3
  "c-sudden-braking-slow-driving": "1705ae57d930eb4e", // ЗДвП чл. 24, ал. 1 · ЗДвП чл. 22, ал. 1
  "c-technical-condition": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "c-temporary-signalization": "ccee331a8fde3126", // Наредба № РД-02-21-1/2023 временна сигнализация
  "c-testing-refusal": "ab3d4e088e556bdc", // ЗДвП чл. 174
  "c-towing-removal": "bd91a48a191c6270", // ЗДвП чл. 171
  "c-traffic-light-signals": "8c6d8043a73c9cd0", // ППЗДвП светлинни сигнали за регулиране на движението
  "c-tram-priority": "2d11554e668f459b", // ЗДвП чл. 8, ал. 2 · ЗДвП чл. 48
  "c-transverse-markings": "95225645b9fef9ab", // Наредба № 2/2001 напречна маркировка
  "c-trip-planning": "75e0b3ef1cffb83c", // ЗДвП чл. 5
  "c-tunnels": "9b2fb5e7a2ebeb3e", // ЗДвП чл. 63 · ЗДвП чл. 64
  "c-turning-left-junction": "07f32d2824101cfc", // ЗДвП чл. 36, ал. 1 · ЗДвП чл. 37, ал. 1
  "c-turning-right": "eee312814a50cee2", // ЗДвП чл. 35
  "c-tyres": "91b7779f3d2a9cc0", // ЗДвП чл. 139
  "c-u-turn": "9bd6a46debdd54e4", // ЗДвП чл. 38 · ЗДвП чл. 39
  "c-vehicle-controls": "613b467b50a0ac02", // ЗДвП чл. 20
  "c-vehicle-types": "c140741eb06d09db", // ЗДвП чл. 149
  "c-victim-handling": "d5222581714fd762", // ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6 · Наредба № 24 чл. 9, т. 8
  "c-vignette-toll": "f0eb95d813574f89", // ЗДвП чл. 140, ал. 1
  "c-warning-signs": "ab928ab891ab69c2", // Наредба № РД-02-21-1/2023 група А
  "c-when-call-police": "a1a570389c27b0bc", // ЗДвП чл. 125 · ЗДвП чл. 123, ал. 1, т. 3
  "c-winter-ice": "91b7779f3d2a9cc0", // ЗДвП чл. 139
} as const;
