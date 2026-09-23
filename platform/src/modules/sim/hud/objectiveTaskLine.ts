/**
 * THE TASK STATES ITS OWN NUMBER — founder ruling 2026-09-22, «Say it in the
 * banner» (row sc-ac-truck-spray:d1119d8f).
 *
 * THE FRAME: `.audit-frames/w37/frames/sc-ac-truck-spray__pc-wrong/04-t060s.png`.
 * The objective «Мини пелената със съобразена скорост и дистанция» is a
 * reachZone gated at 80 км/ч (`templates-conditions2.ts`, `sc-acts-gap`): the
 * cap decides `capMet`, and `capMet` decides whether the task is credited. The
 * banner — the surface whose whole job is to state the task — read «ЗАДАЧА 1/2
 * Мини пелената със съобразена скорост и дистанция» and nothing else; the 80
 * reached the student only as an amber clause on the cockpit strip, beside a
 * 140 disc. A student refused on `capMet` had never been told in the task what
 * the number was: a grade against an unstated threshold, which THEO-4 forbids.
 *
 * THE RULING, and what it overrides: when an objective's own speed cap is
 * STRICTER than the posted limit and gates the credit, the objective banner
 * states it («— дръж под 80 км/ч»), the way the advisor's capped cards already
 * do. It overrides the earlier «don't show the task speed twice» (O51 residual
 * 3, `advisorCapEchoesStrip`): the strip may keep its «задачата иска ≤80», and
 * the task itself now says the figure too.
 *
 * WHERE IT IS READ — everywhere the task is stated, not only the banner: the
 * roomy `ObjectiveBanner`, and on the phone (no banner) the queue's task row
 * and the micro-menu's «Задача» recall row, all through the shell's
 * `bannerObjectiveLineBg` (round 2: the round-1 repair reached the banner only,
 * and the phone's row kept dropping the figure whenever the strip printed it).
 *
 * WHOSE NUMBER. `taskCapKmh` is the figure the shell already publishes to the
 * strip — read out of the advisor's own sentence (`taskCapKmhFromPrompt`) and
 * held across a lawful wait (`heldTaskCapKmh`). It is NEVER the raw
 * `maxSpeedKmh`: that is the grader's tolerance after the rung's grace, and
 * `advisor.ts spokenCapKmh` exists because that figure may not be spoken to a
 * student. Taking the same figure means the banner, the strip and the advisor
 * card cannot disagree by construction, and — because `spokenCapKmh` ends on
 * `Math.min(visible, capKmh)` — a student who obeys the banner can never be
 * refused by the gate.
 *
 * THE WORDING IS THE ADVISOR'S, byte for byte: `${titleBg} — дръж под N км/ч`
 * (`advisorPromptForObjective`). So on the roomy stage `advisorEchoTrim` sees
 * the whole card already printed on the banner and drops it — the ruling puts
 * the number in the banner, it does not ask for a second card saying it.
 *
 * WHEN IT STAYS SILENT, and each is the other direction of the ruling:
 *   · no cap (`undefined`)                 — nothing gates on a speed;
 *   · cap AT OR ABOVE the posted limit     — not stricter; the sign is the
 *                                            binding number (B58 slack is not
 *                                            an instruction, same reading
 *                                            `readSpeedContract` makes);
 *   · the title already states that figure — «Мини зоната 30 под 30 км/ч»
 *                                            would otherwise say 30 twice in
 *                                            one sentence (the sweep161 crime
 *                                            `titleCapKmh` was written for).
 *
 * THE FLOOR TRAVELS WITH IT where a gate authors one (`minSpeedKmh`,
 * sc-ac-night-overdrive:b9d61410), in the advisor's own words — «— не под 35 и
 * дръж под 50 км/ч». MEASURED, without it: on that objective's five rungs the
 * banner said «— дръж под 50 км/ч» while the advisor card, no longer a prefix
 * echo of the banner, came back as the WHOLE sentence — title printed twice,
 * and a band the gate refuses at its lower edge stated only on the second card.
 *
 * THE LENGTH BUDGET. The composed line is, by construction, the advisor card's
 * own sentence, and those cards are held to the 95-character phone band
 * (`lessons/__tests__/advisor-authored-cap.test.ts`, longest 94). The banner's
 * reading line is 65 characters (`objective-banner-surface.test.tsx`) and it
 * wraps (`break-words`), with the numeral+unit bound against the wrap by
 * `withUnitsUnbroken`; `objective-banner-task-cap.test.ts` sweeps every capped
 * card in the catalogue against the 95 band and the two-line ceiling.
 */

const TITLE_STATES_KMH = (titleBg: string, capKmh: number): boolean => {
  for (const m of titleBg.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/gu)) {
    if (Number(m[1]!.replace(",", ".")) === capKmh) return true;
  }
  for (const m of titleBg.matchAll(/зона\s*(\d+)/giu)) {
    if (Number(m[1]) === capKmh) return true;
  }
  return false;
};

/**
 * The objective's sentence as the banner prints it: the authored title, plus
 * the task's own binding cap when it is stricter than the posted limit.
 * `null` in, `null` out (no active objective).
 */
export function objectiveLineWithTaskCap(
  titleBg: string | null,
  taskCapKmh: number | undefined,
  limitKmh: number,
  /** The gate's authored lower edge (`reachZone.minSpeedKmh`), if any. */
  floorKmh?: number,
): string | null {
  if (titleBg === null) return null;
  if (taskCapKmh === undefined || !Number.isFinite(taskCapKmh) || taskCapKmh <= 0) return titleBg;
  // Stricter than the sign, or it is not the binding number and says nothing.
  if (Number.isFinite(limitKmh) && limitKmh > 0 && taskCapKmh >= limitKmh) return titleBg;
  // Floor, never round: a figure above the gate would invite the refusal the
  // ruling exists to explain. (Every shipped cap is whole — 0 fractions.)
  const shown = Math.floor(taskCapKmh);
  if (TITLE_STATES_KMH(titleBg, shown)) return titleBg;
  // Same condition as the advisor's: a floor is spoken only below the cap.
  if (floorKmh !== undefined && Number.isFinite(floorKmh) && floorKmh > 0 && floorKmh < shown) {
    return `${titleBg} — не под ${floorKmh} и дръж под ${shown} км/ч`;
  }
  return `${titleBg} — дръж под ${shown} км/ч`;
}
