/**
 * ONE SPLITTER for every `lawRef` string this module authors.
 *
 * WHAT IT IS FOR. `rules/catalog.ts`, the scenario templates and
 * `traffic/controllerGestures.ts` all write a citation as one string —
 * „ЗДвП чл. 119", „ППЗДвП надлъжна пътна маркировка",
 * „Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3". Three
 * consumers turn that back into the `{ act, ref }` pair a citation chip
 * renders: `tutor/retrieval.ts parseCatalogLawRef`,
 * `hazard/feedback.ts parseHazardLawRef`, and (through the first)
 * `lesson/resolve.ts` + `lesson/interrupt.ts`.
 *
 * WHY IT MOVED HERE. Those two parsers were twins by copy — the hazard one even
 * says so in its header, and adds „if a third consumer appears, promote it to
 * the sim/rules barrel that owns the strings". That day arrived, and the reason
 * is the reason the twins existed: they split at the FIRST reference token
 * (чл./ал./т./§/№), which is a rule about the REF, not about the ACT, and it
 * breaks in both directions:
 *
 *   „Наредба № РД-02-21-1/23.11.2023 чл. 60, ал. 1"
 *       → act „Наредба", ref „№ РД-02-21-1/23.11.2023 чл. 60, ал. 1"
 *     The № in the act's own designation is a reference token, so the split
 *     landed inside the act NAME. Two entries citing the same наредба rendered
 *     as two different sources. This was already wrong before today.
 *
 *   „ППЗДвП светлинни сигнали за регулиране на движението"
 *       → null, no chip at all
 *     A subject-level citation carries no чл./ал./т./§ — and once the article
 *     numbers came off the acts this repo does not hold (2026-08-09, the
 *     founder's ruling: the act with NO NUMBER beats a number nobody can
 *     check), five catalogue entries and every controller gesture became
 *     exactly that shape. Splitting on the ref made them silent.
 *
 * SO IT SPLITS ON THE ACT, which is the half we can actually enumerate: the
 * repo cites five acts, and the наредби carry their designation in the name.
 * Everything after the act name is the ref, number or subject alike — the same
 * `{ act: "ППЗДвП", ref: "надлъжна пътна маркировка" }` shape the question bank
 * stores for the same rule, so a chip from the simulator and a chip from the
 * bank are one string.
 *
 * FAIL CLOSED. An unrecognised act name yields null and the surface simply
 * carries no chip. Manufacturing a citation out of a string we cannot parse is
 * precisely what ADR-002 forbids, and a missing chip is visible while a wrong
 * one is not.
 */

export interface RuleLawRef {
  act: string;
  ref: string;
}

/**
 * The act names authored under `modules/sim`, longest-first so „ППЗДвП" is
 * never read as „…ЗДвП".
 *
 * A наредба is „Наредба" + its designation up to the first space that is
 * followed by something which is not part of a designation. Rather than guess,
 * the designation is matched explicitly: `№ <token>` or a bare `<token>` where
 * the token holds a digit (38, № 24, № 2/2001, № РД-02-21-1/23.11.2023,
 * № Iз-2539).
 *
 * The boundary is written out instead of `\b`: JavaScript's `\b` is ASCII-only,
 * so /^ЗДвП\b/ does not match „ЗДвП чл. 25" — it fails silently, which is how a
 * scan of this same tree once reported every clause as „not an act".
 */
const CYR_END = "(?![А-Яа-яЁёA-Za-z0-9])";
const ACT_HEAD_RES: readonly RegExp[] = [
  new RegExp(`^Наредба\\s*(?:№\\s*)?[^\\s]*\\d[^\\s]*${CYR_END}`),
  new RegExp(`^ППЗДвП${CYR_END}`),
  new RegExp(`^ЗДвП${CYR_END}`),
  new RegExp(`^ЗБЛД${CYR_END}`),
  new RegExp(`^НК${CYR_END}`),
  new RegExp(`^Закон\\s+за\\s+движението\\s+по\\s+пътищата${CYR_END}`),
];

/**
 * „ЗДвП чл. 119" → `{ act: "ЗДвП", ref: "чл. 119" }`.
 * „ППЗДвП надлъжна пътна маркировка" → `{ act: "ППЗДвП", ref: "надлъжна…" }`.
 *
 * A trailing parenthetical gloss is the rule engine's note to itself and is
 * dropped: „ППЗДвП надлъжна пътна маркировка (М1 — единична непрекъсната
 * линия)" is one citation, not a sentence.
 *
 * Returns null when no recognised act name starts the string, or when nothing
 * follows it — a bare act name is not a citable reference.
 */
export function parseRuleLawRef(raw: string): RuleLawRef | null {
  const cleaned = raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const re of ACT_HEAD_RES) {
    const m = re.exec(cleaned);
    if (!m) continue;
    const act = m[0].trim();
    const ref = cleaned.slice(m[0].length).replace(/^[,\s]+/, "").trim();
    if (act.length === 0) return null;
    if (ref.length > 0) return { act, ref };

    // NOTHING FOLLOWS THE ACT NAME. For ЗДвП that is a bare act name and not a
    // citation — null, as before. For a наредба it is a real citation with only
    // one half: „Наредба № 38" IS the exam ordinance, and four catalogue
    // entries cite it that way (the gloss „(второстепенни грешки — …)" is a
    // note, stripped above). Split it the way the chip has always rendered it,
    // so „Наредба № 38" keeps reading „Наредба № 38".
    const naredba = /^(Наредба)\s+(.+)$/.exec(act);
    return naredba ? { act: naredba[1], ref: naredba[2] } : null;
  }
  return null;
}
