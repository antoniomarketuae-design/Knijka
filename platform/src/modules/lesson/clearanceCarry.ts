/**
 * THE CARRY — which unsigned concept summaries this classroom knowingly speaks,
 * pinned by the hash of the exact sentence it speaks.
 *
 * WHY A LEDGER AND NOT A STATUS CHECK. `narration.ts` gates authored text on
 * `status === "approved"`. A concept summary is the same kind of thing — a
 * teacher's assertion, read to a student — but `concepts.json` HAS NO STATUS
 * FIELD (content/SCHEMA.md § concepts.json: id, topicId, titleBg, titleEn,
 * summaryBg, dependsOn, lawRefs, difficulty, and nothing else). There is no
 * flag to check. Checking one that does not exist means every summary fails
 * and all 54 lessons go silent; checking nothing means every summary speaks,
 * reviewed or not, which is the hole this file closes.
 *
 * So this is the mechanism content/review/approvals.json already uses for the
 * 837 questions nobody has signed: FREEZE what is being carried, record the
 * count and the date, and let the number fall but never rise. The difference
 * from a plain allowlist is the hash — a summary that is EDITED no longer
 * matches its pin and stops being spoken until it is re-frozen, which is
 * exactly the property SCHEMA.md gives a signed question ("edit an approved row
 * and the signature stops being valid").
 *
 * THE FREEZE RULE, applied once to build this table: a summary is carried only
 * where at least one bank question that tests its concept was `approved` at
 * freeze time. Seven concepts failed it and are ABSENT — not denylisted,
 * absent, because the default is withheld and absence needs no maintenance:
 *
 *   c-first-aid-priorities (9 questions, 0 approved)   Първа помощ: първи стъпки
 *   c-cpr-basics           (6 questions, 0 approved)   Сърдечен масаж и обдишване
 *   c-bleeding-control     (7 questions, 0 approved)   Спиране на кръвотечение
 *   c-victim-handling      (7 questions, 0 approved)   Кога и как се мести пострадал
 *   c-speed-impact         (2 questions, 0 approved)   Скорост и сила на удара
 *   c-testing-refusal      (10 questions, 0 approved)  Проверка с дрегер и отказ
 *   c-new-driver-status    (3 questions, 0 approved)   Правила за новите водачи
 *
 * The first four are the reason this file exists. Their 29 questions were
 * regrounded on ERC 2025 / RCUK 2025 and several answers REVERSED, and at the
 * moment of the freeze the summaries still taught the superseded version —
 * c-victim-handling's read „Дишащ, но в безсъзнание човек се поставя в
 * стабилно странично положение", while ERC 2025
 * (content/medical/tools/erc2025_layperson.txt:768) reads „In cases of not
 * normal breathing or trauma, do NOT move the person into the recovery
 * position." and q-ptp-022 now grades the opposite.
 *
 * WHY THE PIN AND NOT JUST THE FREEZE RULE. The rule alone would re-open those
 * four the moment the founder signs the corrected questions — approving a
 * QUESTION would silently re-authorise a SUMMARY nobody re-read. The hash makes
 * the two decisions separate, which is what they are. That is not theoretical:
 * a parallel content wave rewrote all four of those summaries WHILE this gate
 * was being built, and they are correct now — and still withheld, because
 * „correct" and „read by a person" are different claims and only the second one
 * is what puts a sentence in a 17-year-old's ear.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG WITH THE FIRST VERSION OF THIS FILE, on the day it shipped.
 *
 * The table was regenerated at 23:26 from a content/concepts.json that had been
 * edited at 22:06. Hashing `git show HEAD:content/concepts.json` against it
 * afterwards: ELEVEN carried summaries had been edited since HEAD, and ELEVEN
 * OF ELEVEN pins matched the NEW text — none matched the old one. So the
 * property this file's own header promised („an EDITED summary no longer
 * matches its pin and stops being spoken until re-frozen") never fired for
 * those eleven. The gate was regenerated FROM the file it exists to check.
 *
 * Nothing eleven said was wrong; a content wave had improved them and their
 * legal half was verified verbatim. That is not the point. The point is that a
 * hash minted by a script reading the live file is not evidence of anything —
 * it certifies the wave that wrote it.
 *
 * TWO CAUSES, and the second is the one that matters:
 *
 *  1. `freeze-lesson-carry.mjs` had a bulk „repin" mode — one command, every
 *     stale pin rolled forward. It is gone. The script now has exactly ONE
 *     write path (`--clear <id> --pin <fingerprint> --by <name>`), it moves one
 *     row per invocation, and it refuses a `--pin` the operator did not
 *     transcribe from the sentence itself.
 *  2. THE TEST DEMANDED IT. `clearance.test.ts` asserted that no pin was ever
 *     stale — so every time a content wave touched a summary the suite went
 *     red, and re-running the script was the obvious way to make it green. A
 *     check that punishes the correct state (withheld, awaiting a read) trains
 *     everyone to defeat it. That assertion is inverted now: a stale pin is a
 *     NORMAL state and the test asserts only that a stale pin does not speak.
 *
 * WHAT REPLACED IT: the pins describe ONE IMMUTABLE GIT BLOB, named below.
 * Every one of the 145 is the fingerprint of that concept's summary inside
 * `CARRY_FROZEN_BLOB`, and `__tests__/clearanceProvenance.test.ts` re-derives
 * all 145 from `git cat-file blob` — an artifact nobody can edit. A pin rolled
 * forward from the working tree stops matching the blob and is caught BY NAME:
 * rolling c-scene-safety forward by hand produces
 * „c-scene-safety: pinned 0600ce6fda08411d, blob says 99110a7ef2031990".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TWO AUTHORITIES A SUMMARY CAN SPEAK UNDER, and they are not the same:
 *
 *   FREEZE   `CARRIED_CONCEPT_SUMMARIES`. A dated policy decision, applied
 *            once, in bulk, on the record: „carry a summary where at least one
 *            approved bank question tests its concept, exactly as it read at
 *            the freeze." No individual read these 145 sentences and this file
 *            has never claimed otherwise — it says „knowingly speaks", not
 *            „signed". The authority is the RULE plus the DATE, which is why
 *            the snapshot must stay pinned to one blob: roll it forward and the
 *            rule no longer covers what is in the table.
 *
 *   CLEARED  `CLEARED_SINCE_FREEZE`. A person read this exact sentence and
 *            said so, with their name and the date. This is the only authority
 *            that can cover text written AFTER the freeze — which is the whole
 *            of the eleven, and of anything a content wave writes next.
 *
 * A summary is spoken when its live fingerprint matches EITHER. Nothing else.
 *
 * ELEVEN ROWS ARE STALE ON PURPOSE RIGHT NOW. Their pins were put back to the
 * frozen blob, so the classroom has gone quiet on ELEVEN BEATS ACROSS NINE
 * LESSONS — counted by running the real resolver before and after, not
 * estimated: l-junctions-roundabout 3→1 speaking beats, l-accidents-duties
 * 4→2, and seven others −1 each. Every one of the nine keeps its quiz (3–4
 * questions), so none is reduced to teaching nothing and none of them is taken
 * off the shelf by `lessonsInPreparation()`. Each beat that lost its summary
 * says the one claim-free „под преглед" line instead of going silent.
 * They come back one at a time:
 *
 *     node scripts/freeze-lesson-carry.mjs --check          # what is stale
 *     node scripts/freeze-lesson-carry.mjs --show c-scene-safety
 *     node scripts/freeze-lesson-carry.mjs --clear c-scene-safety \
 *           --pin <the fingerprint --show printed> --by "<your name>"
 *
 * HOW THE FIRST-AID FOUR COME BACK, in the order that keeps both decisions
 * honest:
 *   1. the founder clears the 29 regrounded questions in /review (that is the
 *      signature ledger, content/review/approvals.json, whose own readme says
 *      the signature „е единственото доказателство, че ЧОВЕК е чел въпроса");
 *   2. `--propose` re-applies the freeze rule and PRINTS the ids that have
 *      become eligible. It writes nothing — being newly eligible is not the
 *      same as having been read;
 *   3. somebody reads each summary and `--clear`s it, which lands it in
 *      `CLEARED_SINCE_FREEZE` under their name.
 */

/** The date the freeze rule was applied. */
export const CARRY_FROZEN_AT = "2026-08-04";

/**
 * THE EXACT BYTES THE PINS DESCRIBE — `git rev-parse HEAD:content/concepts.json`
 * at commit 6430557, the tree the freeze was taken against.
 *
 * A blob sha and not a commit sha: a commit can be rebased, amended or
 * garbage-collected out from under this, and the thing being pinned is the
 * CONTENT, which is what a blob names. `clearance.test.ts` re-derives all 145
 * pins from `git cat-file blob` — so „the table was regenerated from the
 * working tree" is not a judgement call anybody has to make, it is a test.
 */
export const CARRY_FROZEN_BLOB = "ab63c90a777b1d3e0fa32af0d549ae4032b86524";

/**
 * The ratchet, and it binds the FREEZE table only.
 *
 * The freeze table may only shrink — a row leaves when its concept is deleted,
 * and nothing may ever be added to it, because „applied on 2026-08-04 against
 * blob ab63c90" is a claim about a moment that has passed. Growth happens in
 * `CLEARED_SINCE_FREEZE`, one signed row at a time, which is deliberately the
 * slower path.
 */
export const CARRY_CEILING = 145;

/**
 * conceptId → sha256(summaryBg, utf8).slice(0, 16), as the summary read in
 * `CARRY_FROZEN_BLOB`. Verbatim bytes, no trim.
 *
 * NOT a snapshot of content/concepts.json as it is now, and it must never be
 * regenerated to become one. Eleven of these deliberately no longer match the
 * live file; that is the gate holding, not drift to be tidied away.
 */
export const CARRIED_CONCEPT_SUMMARIES: Readonly<Record<string, string>> = {
  "c-abs-systems": "fa16f9105428f385", // Системи за безопасност: ABS, ESP, въздушни възглавници
  "c-accident-definition": "61cd49a46c65c222", // Какво е пътнотранспортно произшествие
  "c-accident-duties": "ea13325c3be0388d", // Задължения на участник в ПТП
  "c-additional-plates": "d3746f7d22cf1cbb", // Допълнителни табели (група Т)
  "c-additional-sections": "2f29259597961935", // Допълнителни секции със стрелки
  "c-alcohol-effects": "8fa142625d089010", // Как алкохолът влияе на шофирането
  "c-alcohol-limit": "e8faa333c0c1a7e8", // Алкохол: границата и наказанията
  "c-animals-obstacles": "abce78006c1f07ca", // Животни и препятствия на пътя
  "c-average-speed-enforcement": "5bf03a1e23dbffa8", // Контрол на средната скорост
  "c-brakes": "870c171351b1c27f", // Спирачна система
  "c-braking-distance": "a65d6c9ef10fa8f4", // Спирачен път и скорост
  "c-bus-pullout": "b141aa47f43c4140", // Автобус, потеглящ от спирка
  "c-bus-stops-school": "5150c5c9618e7acf", // Спирки и училищни зони
  "c-child-safety": "5bafe7ec88fd30a4", // Превоз на деца в автомобила
  "c-children-on-road": "f15a103cfd2e7c91", // Деца на пътя
  "c-crosswalk-yield": "d174a55ce9f82324", // Пропускане на пешеходна пътека
  "c-cyclists": "d0990102f8db983f", // Велосипедисти
  "c-daytime-lights": "c75cc66c1846cecf", // Светлини през деня
  "c-dazzle-handling": "a408b56fcacfd513", // Заслепяване
  "c-defensive-principles": "68b6a2a7fab3ea96", // Принципи на защитното шофиране
  "c-direction-signs": "774a5527b77b6492", // Знаци за направления и разстояния (група Ж)
  "c-disabled-spaces": "7b4a010e3fe91179", // Места за хора с увреждания
  "c-distraction-emotions": "e6f6d1a5c6a75f78", // Разсейване и емоции зад волана
  "c-documents-required": "def1e5c0a6b2ea58", // Документи, които носиш в колата
  "c-driver-obligations": "a0f02b3abb46ec9d", // Основни задължения на водача
  "c-driver-signals": "bae1b26a72f93e1b", // Сигналите, които подава водачът
  "c-drugs-zero": "0bbc5ba59d822093", // Наркотици: нулева толерантност
  "c-e-scooters": "e44b5ee1b1c8ebae", // Електрически тротинетки (ИЕПС)
  "c-eco-techniques": "efd7827e0191a38d", // Техники за икономично шофиране
  "c-elderly-disabled": "087bdecdf4abf183", // Възрастни хора и хора с увреждания
  "c-emergency-lane-breakdown": "1e3e8c8e878d35dd", // Повреда на магистралата и аварийна лента
  "c-emergency-priority": "826175d60704f24f", // Пропускане на автомобили със специален режим
  "c-environment-impact": "712e20deeaefd855", // Автомобилът и околната среда
  "c-equal-junction": "8c01f46220e6f639", // Равнозначно кръстовище
  "c-exit-from-adjacent": "fa61560f6130c339", // Излизане от двор, гараж или паркинг
  "c-expressway": "03150d3c007e49cc", // Скоростен път
  "c-fatigue-microsleep": "09cb5d2cebcec1c1", // Умора и микросън
  "c-fines-tickets": "12fab94a79b47406", // Глоби, фишове и електронни фишове
  "c-flashing-yellow": "365990dcb17a1456", // Мигаща жълта светлина
  "c-fog-driving": "821b763e29ff3249", // Шофиране в мъгла
  "c-following-distance": "4a72a6cb2ffcfa98", // Безопасна дистанция
  "c-fuel-factors": "7d668cf7dcea00db", // От какво зависи разходът на гориво
  "c-general-care-duty": "1008091466436e4f", // Особено внимание към уязвимите
  "c-give-way-stop-behavior": "ee631d3b82e42543", // Поведение при Б1 и Б2 на кръстовище
  "c-hazard-perception": "ac71c6aed14371bf", // Разпознаване на опасности
  "c-high-beam-use": "a27d3d3ff549aeda", // Дълги светлини: кога да и кога не
  "c-hit-and-run": "88c78754ddf44f39", // Бягство от местопроизшествие
  "c-info-signs": "b3ade77a09cb33d1", // Указателни знаци (група Е)
  "c-insurance-go": "8b1ad26ba6acdc20", // Застраховка „Гражданска отговорност“
  "c-junction-approach": "42b8496152bf885d", // Приближаване към кръстовище
  "c-junction-blocking": "f4b39a452c15cc3d", // Не блокирай кръстовището
  "c-junction-types": "898a3fe29c1b3cc6", // Видове кръстовища
  "c-lane-change": "873f824ab9723bf3", // Смяна на пътна лента
  "c-lane-choice": "8610c248dcd36f45", // Избор на пътна лента
  "c-lane-control-signals": "4beabcf2a8a0b1dc", // Светофари над пътните ленти
  "c-leaving-vehicle-safely": "0653115b86696479", // Безопасно напускане на автомобила
  "c-left-turn-oncoming": "e6cef160e17c5a03", // Завой наляво: пропусни насрещните
  "c-license-categories": "a7803c31072cbacd", // Категории и възраст за шофиране
  "c-license-validity": "6429e58e53afa2a0", // Свидетелство за управление: валидност
  "c-license-withdrawal": "2383091f032dd8ff", // Отнемане на книжката и спиране от движение
  "c-light-junction": "784ec18753962b1b", // Светофарно кръстовище
  "c-lights-overview": "8a879f16ab3a6b77", // Светлини на автомобила
  "c-loading-passengers": "27f652ff7b124a33", // Превоз на пътници и товари
  "c-longitudinal-markings": "5159899286c3e154", // Надлъжна пътна маркировка
  "c-mandatory-equipment": "04be8d51525fec40", // Задължително оборудване
  "c-mandatory-signs": "73bc6caf1477b0bb", // Задължителни знаци (група Г)
  "c-maneuver-principles": "3df156f882fbda2b", // Общи правила при маневри
  "c-medical-fitness": "aca37438550085f1", // Здравословна годност на водача
  "c-medicines": "cd0ee64754f7fbc3", // Лекарства и шофиране
  "c-merging-traffic": "71f962e4bcf75f65", // Включване в движението
  "c-mirrors-blind-spots": "4a5c5483dedcb7c2", // Огледала и мъртви зони
  "c-motorcyclists-visibility": "6d79867553425c83", // Мотористи и видимост
  "c-motorway-entry-exit": "faccb9b0fcb91aaf", // Включване и напускане на магистралата
  "c-motorway-prohibitions": "5e2f2072f40b8003", // Забрани на автомагистралата
  "c-motorway-rules": "a45aa0f3eb82a289", // Движение по автомагистрала
  "c-mountain-roads": "6c24189bf32f90dd", // Планински пътища и дълги наклони
  "c-night-visibility": "91b0f39a6df7b105", // Шофиране през нощта
  "c-oncoming-passing": "babb30495ad7a2bc", // Разминаване
  "c-other-markings": "b6d2e28f86bc4c26", // Стрелки, надписи и специални ленти
  "c-overtaken-duties": "f366e044000e587b", // Задължения на изпреварвания
  "c-overtaking-procedure": "8274bd004ec3392b", // Изпреварване: как се прави
  "c-overtaking-prohibitions": "7ae193c551d28e73", // Къде изпреварването е забранено
  "c-parking-prohibitions": "96aad0e3bdc8dbed", // Къде престоят и паркирането са забранени
  "c-parking-signs-zones": "c748e99f2d9ddd2e", // Знаци и зони за паркиране
  "c-parking-slope-securing": "baed3de393589289", // Паркиране на наклон
  "c-pedestrian-rights-duties": "023c02e77a9247d2", // Правила за пешеходците
  "c-penalty-points": "c50b9926df536572", // Контролни точки
  "c-phone-use": "9667b69e2f693f04", // Телефон зад волана
  "c-police-interaction": "06244329db287d79", // Спиране за проверка от полицията
  "c-pre-drive-check": "fbdc5f4e85432233", // Проверка преди потегляне
  "c-priority-concept": "6556e3e2f8c9d27f", // Какво означава предимство
  "c-priority-road": "8512513a9fd46958", // Път с предимство
  "c-priority-signs": "e68ec04d4fbbf58b", // Знаци за предимство (група Б)
  "c-prohibition-signs": "7ae53135da6365fc", // Забранителни знаци (група В)
  "c-railway-crossing": "03e131b3d4110935", // Железопътен прелез
  "c-rain-aquaplaning": "c30a2d0e1f803285", // Дъжд и аквапланинг
  "c-reaction-time": "a8c56d37227f28a3", // Време за реакция
  "c-registration-inspection": "78ea2c45ef14480b", // Регистрация и годишен технически преглед
  "c-regulator-signals": "302fab0683cf368f", // Сигнали на регулировчика
  "c-residential-zone": "b80c7962a4a520df", // Жилищна зона
  "c-reversing": "702c7b873415953b", // Движение назад
  "c-right-hand-rule": "e48491b5aaf62bd6", // Правилото на дясното
  "c-right-side-rule": "9e994f50d3ec4f25", // Движение в дясната част на платното
  "c-road-elements": "9f616e1ab16f26d0", // Елементи на пътя
  "c-road-participants": "e9bc4a6080dd0f57", // Участници в движението
  "c-roundabout-behavior": "84cc32b29914668a", // Движение и излизане от кръговото
  "c-roundabout-rules": "a1ae4194c7571d3b", // Кръгово движение: кой е с предимство
  "c-rural-road-risks": "496d2bc3bddcba69", // Рискове на извънградските пътища
  "c-safety-space": "dc9e425dc3f80125", // Пространствен буфер около автомобила
  "c-scene-safety": "99110a7ef2031990", // Обезопасяване на местопроизшествието
  "c-seatbelts": "fcab8d5a15340a13", // Предпазни колани
  "c-shared-zones-paths": "e1527e9cb146ec51", // Пешеходни зони и велоалеи
  "c-sign-groups": "6b612f69c7c81455", // Групи пътни знаци
  "c-sign-scope": "bb413e60c33a56d0", // Зона на действие и отменяне на забраните
  "c-signal-hierarchy": "d772dd51b6b07f40", // Йерархия на сигналите и правилата
  "c-signed-junction": "cd0ab3c797e9e780", // Кръстовище със знаци за предимство
  "c-skid-control": "12a882dc00e94ccb", // Занасяне и как се реагира
  "c-special-regime-vehicles": "69ed99395f1f3fc7", // Автомобили със специален режим на движение
  "c-special-rules-signs": "abc1815b272da72b", // Знаци със специални предписания (група Д)
  "c-speed-adaptation": "95ab94b3d7336e97", // Съобразена скорост
  "c-speed-limits": "d95b8bc8bd5d257c", // Ограничения на скоростта за категория B
  "c-speed-signs-zone": "9a45a11dd408721c", // Знаци и зони за скорост
  "c-stop-give-way-signs": "a4a3b95862212cd5", // Знаците Б1 „Пропусни“ и Б2 „Спри“
  "c-stop-parking-definitions": "89de78466b5c280e", // Спиране, престой и паркиране — разликите
  "c-stopping-distance-total": "a2617338194d982a", // Общ спирачен път
  "c-stopping-standing-rules": "db71025940e86ae4", // Как се спира и престоява правилно
  "c-sudden-braking-slow-driving": "80e65ea98f5c067b", // Рязко спиране и излишно бавно движение
  "c-technical-condition": "c08eabae404eae68", // Техническа изправност
  "c-temporary-signalization": "e5e4c62e052fcadd", // Временна сигнализация при ремонти
  "c-towing-removal": "6e1fc2ff600ed28f", // Репатриране на неправилно паркирани коли
  "c-traffic-light-signals": "f30d0e61c123321d", // Сигнали на светофара
  "c-tram-priority": "25b47d73ead3a70f", // Предимство на трамваите
  "c-transverse-markings": "f3bc6f2721fccf03", // Напречна маркировка
  "c-trip-planning": "9485a4f8158f5b14", // Планиране на пътуването
  "c-tunnels": "8fe890c81c1883b3", // Движение в тунел
  "c-turning-left-junction": "15d66747dbc87aed", // Завиване наляво на кръстовище
  "c-turning-right": "8072a509b91029c1", // Завиване надясно
  "c-tyres": "6274d24baa21d64e", // Гуми и сцепление
  "c-u-turn": "ae1f2870393e8942", // Обратен завой
  "c-vehicle-controls": "322277da98b0d22b", // Основни управления на автомобила
  "c-vehicle-types": "0e9d2dcd2fc17a6c", // Видове пътни превозни средства
  "c-vignette-toll": "6432ed12e6a274f4", // Винетка и тол такси
  "c-warning-signs": "58be073b6f3d812a", // Предупредителни знаци (група А)
  "c-when-call-police": "db2bf3cc8644490b", // Кога се вика полиция и кога стига протокол
  "c-winter-ice": "67041ec6626a5337", // Сняг, лед и зимни условия
} as const;

// ---------------------------------------------------------------------------
// The second authority: a person, a sentence, a date
// ---------------------------------------------------------------------------

/** One human clearance. `pin` covers the exact sentence that was read. */
export interface CarrySignature {
  /** sha256(summaryBg, utf8).slice(0, 16) of the text the person read. */
  pin: string;
  /** Who read it. A real name — see `MACHINE_SIGNERS` for what is refused. */
  by: string;
  /** ISO date (YYYY-MM-DD) of the reading. */
  at: string;
}

/**
 * Summaries cleared by a person SINCE the freeze — the only way text written
 * after `CARRY_FROZEN_AT` is ever spoken.
 *
 * EMPTY, AND THAT IS THE HONEST STATE. Eleven rows are waiting in it: the
 * eleven the script rolled forward. Their new text is almost certainly better
 * than the frozen text — that is not the question this table answers. It
 * answers „did a person read the sentence we are about to say to a
 * 17-year-old", and today the answer for those eleven is no.
 *
 * WRITTEN ONLY BY `scripts/freeze-lesson-carry.mjs --clear`, one row per
 * invocation, never by hand and never in bulk — the same rule
 * content/review/approvals.json states for question signatures („Пише се само
 * от /review, никога на ръка"). The script cannot mint the `pin`; the operator
 * transcribes it from `--show`, which is the step that requires having looked.
 */
export const CLEARED_SINCE_FREEZE: Readonly<Record<string, CarrySignature>> = {} as const;

/**
 * Names that are not a person.
 *
 * `--by` is the weakest link in this file and pretending otherwise would be
 * theatre: nothing can stop a determined script from typing a human's name.
 * What this list does is remove the EASY path — the one somebody takes without
 * deciding to lie — and make the alternative a false attestation written into
 * the repository under a name, in a diff, which is a different kind of act.
 * `clearance.test.ts` refuses any signature whose `by` is one of these.
 */
export const MACHINE_SIGNERS: readonly string[] = [
  "script",
  "auto",
  "automatic",
  "bot",
  "ci",
  "agent",
  "claude",
  "codex",
  "copilot",
  "llm",
  "ai",
  "system",
  "freeze",
  "rebuild",
  "repin",
  "-",
  "n/a",
  "unknown",
  "tbd",
];
