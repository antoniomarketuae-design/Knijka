/**
 * r0Status — Claude's own R0 (visual-eyeball) verdict on each reel clip, shown
 * as a helper badge on the verdict board so the founder sees what I already
 * flagged before spending eyes on it. This is NOT the founder's verdict (that
 * lives in localStorage per clip); it's my recommendation.
 *
 * Only clips with a KNOWN status are listed. An unlisted clip = "no known
 * issue from my pass — your call" (renders no badge). Keyed by clip id
 * (`<templateId>__m<index>`). Statuses:
 *   ok    — I eyeballed this clip THIS session and it reads correctly.
 *   amber — known-weak: legible but a real fidelity gap (note says what).
 *   red   — broken: fails the fidelity checklist (note says what); a fix is
 *           in flight, badge flips to ok after I re-R0 the re-render.
 *
 * Source: the 2026-07-22 R0 pass (E:\ai-driver-recaps\2026-07-21.md) over the
 * 5 new Half-B reels + the carried-over backlog from doc 72.
 */

export type R0Level = "ok" | "amber" | "red";

export interface R0Note {
  level: R0Level;
  /** bg-BG one-liner shown in the badge tooltip / under the card. */
  noteBg: string;
}

export const R0_STATUS: Readonly<Record<string, R0Note>> = {
  // --- The 5 new BUILD reels (my 2026-07-22 eyeball) ---
  "sc-accident-own-conduct__m0": {
    level: "ok",
    noteBg:
      "Кадърът на удара показва ясно закачането на паркирания автомобил + спирачни следи; бягството се разчита.",
  },
  "sc-driver-distraction__m0": {
    level: "ok",
    noteBg: "Пешеходецът е поставен на платното, закъснялата реакция и ударът се виждат.",
  },
  "sc-animal-hazard__m0": {
    level: "ok",
    noteBg:
      "Поправено: животното (кафяв четириног) стои ясно на платното преди грешката; отбиването през осевата линия в насрещния автомобил се разчита.",
  },
  "sc-lane-control-signal__m0": {
    level: "ok",
    noteBg:
      "Поправено: порталът чете ясно — червен ✕ над затворената лента (в която навлиза егото), зелена ↓ над отворената; дърветата вече не закриват кадъра.",
  },
  "sc-sign-warning__m0": {
    level: "amber",
    noteBg:
      "Разчита се като скорост в дъжда; знакът А15 още не е в картата (знаците се пускат от строителя). Историята с таблото (42→50 през леда) е свързана, но знакът липсва.",
  },

  // --- Carried-over backlog (doc 72, not yet re-fixed) ---
  "sc-merge-bus-pullout__m0": {
    level: "amber",
    noteBg:
      "Нужен е автобусен модел + настроен прозорец за FOLLOWING_TOO_CLOSE; поставянето само не стига.",
  },
  "sc-park-parallel__m0": {
    level: "amber",
    noteBg: "Камерата следи носа, не задницата в слота — нужна е камера за паркиране.",
  },
  "sc-vp-police-stop__m1": {
    level: "amber",
    noteBg: "Полицаят се чете твърде дребен/далечен — нужно е по-близко рамкиране.",
  },
  "sc-hz-breakdown-pulloff__m0": {
    level: "amber",
    noteBg: "Липсва триъгълник/контекст на авария — това е отделен урок сам по себе си.",
  },
};

export function r0StatusFor(clipId: string): R0Note | null {
  return R0_STATUS[clipId] ?? null;
}
