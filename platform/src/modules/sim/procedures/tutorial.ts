/**
 * Pre-drive TUTORIAL content — the founder's 2026-07-30 ruling on Урок 1
 * (`brief.txt` §"Simulator Lesson 1 – Vehicle Preparation", ledger 86 D9):
 *
 *   „The moment I entered the lesson and saw that I had to remember and press
 *    thirteen different keyboard shortcuts, my first instinct was to skip the
 *    lesson entirely. … Instead of simply displaying `Press B`, the simulator
 *    should open a tutorial popup that contains a real-world illustration, a
 *    short instructional animation, or a 10–15 second realistic video. The
 *    tutorial should explain WHY the action is important, HOW it is performed,
 *    and WHAT the student should remember. After the tutorial finishes, the
 *    user clicks Next with the mouse."
 *
 * This module is the DATA half — pure TS, no DOM, unit-tested. The popup that
 * renders it lives in `hud/PreDriveTutorial.tsx`.
 *
 * THEO-4 (founder-ratified, absolute): nothing here is a bare verdict. Every
 * step carries its own WHY, HOW and „запомни", and a law citation.
 *
 * ADR-002 (no free recall): the citation is NOT typed here. Each step names
 * the fault code that GRADES its omission, and `preDriveTutorialLaw()` reads
 * the `lawRef` off `rules/catalog.ts` — retrieval from the authored bank, the
 * same string the violation toast and the debrief already show the student.
 * A step and its penalty can therefore never cite two different articles.
 *
 * MEDIA SWAP SEAM (the founder's "video comes later" constraint — every video
 * API account is at zero balance today). `preDriveTutorialMedia()` returns a
 * discriminated union: today every step resolves to `{ kind: "still" }` and
 * the popup draws the inline SVG illustration; the day a 10–15 s clip is
 * generated, its entry lands in `PRE_DRIVE_TUTORIAL_CLIPS` and the SAME call
 * starts returning `{ kind: "clip" }`. No component, no caller and no test
 * outside this file changes. That is the whole point of the indirection.
 */

import { VIOLATIONS } from "../rules/catalog";
import type { ViolationCode } from "../rules/types";
import type { PreDriveStepId } from "./types";

// ---------------------------------------------------------------------------
// Media (the still-now / clip-later seam)
// ---------------------------------------------------------------------------

/** A generated instructional clip. Authored ONLY when the file really ships —
 *  an entry here is a promise that `src` is fetchable. */
export interface PreDriveTutorialClip {
  /** Public-path MP4/WebM, e.g. "/sim/tutorial/fasten-seatbelt.mp4". */
  src: string;
  /** Poster frame shown before playback (and if the clip fails to load). */
  posterSrc?: string;
  /** Founder spec: 10–15 s. Validated by the tutorial test. */
  durationSec: number;
  /** Bulgarian narration transcript — accessibility + the muted-tab case. */
  transcriptBg: string;
}

/**
 * Resolved media for one step. `still` carries no artwork path: the
 * illustration is drawn inline as SVG (`hud/PreDriveStill.tsx`), so the
 * tutorial works offline, in the clip rig and inside a printed debrief.
 */
export type PreDriveTutorialMedia =
  | { kind: "still"; stepId: PreDriveStepId; captionBg: string }
  | { kind: "clip"; stepId: PreDriveStepId; captionBg: string; clip: PreDriveTutorialClip };

/**
 * Generated clips, keyed by step. **Deliberately empty on 2026-07-30** — no
 * video-generation account has balance. Adding one entry here upgrades that
 * step's tutorial from the still to the clip with zero other edits.
 */
export const PRE_DRIVE_TUTORIAL_CLIPS: Partial<Record<PreDriveStepId, PreDriveTutorialClip>> = {};

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface PreDriveTutorial {
  /** Why this step exists — the instructor's reason, never "because the exam". */
  whyBg: string;
  /** How it is physically performed in a real car. */
  howBg: string;
  /** The one sentence to carry onto a real street. */
  rememberBg: string;
  /** One-line caption under the illustration. */
  captionBg: string;
  /**
   * The catalog code that grades this step's omission. The law citation is
   * READ from it (ADR-002) — never typed as prose here.
   */
  gradedByCode: ViolationCode;
}

export const PRE_DRIVE_TUTORIALS: Record<PreDriveStepId, PreDriveTutorial> = {
  "adjust-seat": {
    whyBg:
      "Седалката определя всичко останало: докъде стигат краката ти на педалите, колко волан можеш да завъртиш, без да пуснеш, и какво виждаш през огледалата. Затова е първа — нагласиш ли я после, огледалата вече лъжат.",
    howBg:
      "Натисни спирачния педал докрай: кракът трябва да остане леко свит, не изпънат. После сложи китка върху горния край на волана с изпъната ръка — ако китката ляга свободно, гърбът е на точното разстояние. Накрая изправи облегалката, докато раменете ти не се отлепят при завъртане.",
    rememberBg:
      "Изпънат крак на спирачката означава, че при аварийно спиране няма да можеш да натиснеш докрай. Свит крак спира колата; изпънат — не.",
    captionBg: "Свит крак на педала, китка върху волана при изпъната ръка.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "adjust-mirrors": {
    whyBg:
      "Огледалата са единственият ти поглед назад по време на движение. Нагласени грешно, те показват собствената ти кола вместо лентата до теб — и точно там стои колата, която не виждаш при престрояване.",
    howBg:
      "Вътрешното огледало трябва да покрива целия заден прозорец. Страничните завърти навън, докато собствената ти кола заеме едва тесен ръб отстрани — останалото е път. В симулатора задръж огледалото с мишката (или клавиша), за да погледнеш в него; пуснеш ли, погледът се връща на пътя, точно както в истинска кола.",
    rememberBg:
      "Ако виждаш много от собствената си кола, огледалото гледа теб, не пътя. Мъртвата зона расте точно толкова, колкото си пропуснал да завъртиш.",
    captionBg: "Трите огледала: вътрешно, ляво, дясно — минимум собствена кола в кадъра.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "check-surroundings": {
    whyBg:
      "Преди да седнеш и след като седнеш, около колата има неща, които нито едно огледало не показва: дете зад задната броня, велосипед опрян на вратата, изтекло масло, спаднала гума. Обиколката отнема десет секунди и е единственият начин да ги видиш.",
    howBg:
      "Обиколи колата отпред-надясно-отзад-наляво. Гледай за хора и деца ниско долу, за препятствия под нивото на бронята, за гумите и за това дали нещо тече под колата. Чак после отваряй вратата.",
    rememberBg:
      "Дете, клекнало зад задната броня, е невидимо от седалката във всяко огледало. Единствената проверка, която го хваща, е обиколката пеша.",
    captionBg: "Обиколка около колата: ниските препятствия и хората са невидими отвътре.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "fasten-seatbelt": {
    whyBg:
      "Коланът е това, което те задържа на седалката, за да работят спирачките, воланът и въздушната възглавница. Без него въздушната възглавница удря, вместо да поеме — тя е проектирана да работи ЗАЕДНО с колана, не вместо него.",
    howBg:
      "Издърпай колана бавно и равномерно (рязкото дърпане заключва механизма), прекарай диагоналната част през средата на рамото — не през врата и не под мишницата — и щракни езичето, докато чуеш прещракване. После прокарай ръка по лентата: не бива да е усукана.",
    rememberBg:
      "Коланът се слага преди двигателя, не преди тръгването. Ако е станал навик да го слагаш на първия светофар, значи първите двеста метра си карал без него.",
    captionBg: "Диагоналът минава през средата на рамото, лентата не е усукана.",
    gradedByCode: "PREDRIVE_SEATBELT_SKIPPED",
  },
  "check-dashboard": {
    whyBg:
      "Контролните лампи светват при завъртане на ключа и трябва да ИЗГАСНАТ. Тази, която остане да свети, е предупреждение, дадено ти преди тръгване — а не докато си на магистралата.",
    howBg:
      "След запалването изчакай две секунди и прочети таблото отляво надясно. Червено = спри и провери сега (налягане на маслото, спирачки, температура). Жълто = потегли внимателно и провери скоро. Проверявай и нивото на горивото — най-честата причина за спряла кола на платното.",
    rememberBg:
      "Червена лампа, която не изгасва, означава да не тръгваш. Няма лампа, която да е „нормално да свети“.",
    captionBg: "След запалване всички лампи изгасват — освен тази, която ти казва нещо.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "headlights-on": {
    whyBg:
      "Светлините не са за да виждаш ти — те са за да те видят другите. Тъмна кола на здрачаване се появява в чуждото зрително поле със секунди закъснение, а секунда при 50 км/ч е близо четиринайсет метра.",
    howBg:
      "Завърти ключа за светлините до къси светлини. В симулатора щракни ключа на таблото (или клавиша). Дългите се използват само извън населено място и без насрещни; при насрещна кола се превключва на къси.",
    rememberBg:
      "Нощем и при намалена видимост късите светлини са задължение, не преценка.",
    captionBg: "Къси светлини — включени преди потегляне, не на първия завой.",
    gradedByCode: "HEADLIGHTS_OFF_AT_NIGHT",
  },
  "start-engine": {
    whyBg:
      "Двигателят се пали чак когато седалката, огледалата и коланът са наред. Причината е проста: щом моторът работи, колата може да тръгне — а ти още се наместваш.",
    howBg:
      "Провери, че скоростният лост е на P (или на нула при ръчна) и че ръчната спирачка е вдигната. Натисни спирачния педал и щракни бутона „Старт“. Изчакай оборотите да се успокоят, преди да включиш предавка.",
    rememberBg:
      "Двигателят се пали с крак на спирачката. Това е навикът, който не позволява на колата да тръгне сама.",
    captionBg: "Крак на спирачката, лост на P, после стартерът.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "press-brake": {
    whyBg:
      "Спирачката, натисната ПРЕДИ да включиш предавка, е това, което задържа колата, когато автоматикът поеме. Без нея колата пълзи напред в момента, в който лостът мине на D — а ти още не си погледнал напред.",
    howBg:
      "Натисни работната спирачка с десния крак и я задръж. Кракът остава на нея през цялото включване на предавката и през освобождаването на ръчната спирачка.",
    rememberBg:
      "При автоматик D означава „колата вече иска да тръгне“. Спирачката е това, което казва кога.",
    captionBg: "Десният крак на работната спирачка — и остава там.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "select-gear": {
    whyBg:
      "Предавката се включва при натисната спирачка и вдигната ръчна — тогава и само тогава колата не може да помръдне, докато ти решиш. Обратният ред е как се удря колата отпред на паркинга.",
    howBg:
      "Със задържана спирачка премести лоста от P през R и N до D (за движение назад — на R). В симулатора щракни лоста, за да го местиш към D, и с десния бутон — обратно към P.",
    rememberBg:
      "Ред: спирачка → предавка → ръчна спирачка. Всяка размяна на две от тези три означава кола, която се движи, преди да си готов.",
    captionBg: "Лостът минава P → R → N → D при задържана спирачка.",
    gradedByCode: "PREDRIVE_STEP_SKIPPED",
  },
  "release-handbrake": {
    whyBg:
      "Ръчната спирачка се пуска последна, защото до този момент тя е единственото, което държи колата на място, ако кракът ти се плъзне от педала. Пуснеш ли я преди предавката, на наклон колата тръгва сама.",
    howBg:
      "Със задържана работна спирачка освободи ръчната. Провери, че контролната лампа на таблото изгасва — ако свети, ръчната още държи и потеглянето ще влачи задните колела.",
    rememberBg:
      "Лампата на ръчната спирачка е последната, която трябва да изгасне преди тръгване. Тръгне ли колата с нея — усеща се като тежка кола, а всъщност е горящ накладка.",
    captionBg: "Ръчната се пуска последна — и лампата ѝ изгасва.",
    gradedByCode: "HANDBRAKE_LEFT_ON",
  },
  "final-mirror-check": {
    whyBg:
      "Между момента, в който си нагласил огледалата, и момента на потегляне минава минута. За тази минута отзад е приближила кола, велосипедист е тръгнал по платното, пешеходец е излязъл иззад съседната кола. Контролният поглед хваща точно това.",
    howBg:
      "Поглед в лявото огледало, поглед във вътрешното, после КРАТЪК поглед през рамо наляво — мъртвата зона не се вижда в никое огледало. Чак тогава мигач и потегляне.",
    rememberBg:
      "Проверката е последното действие преди колелата да се завъртят, не преди половин минута.",
    captionBg: "Огледало, огледало, поглед през рамо — в тази последователност.",
    gradedByCode: "MOVE_OFF_WITHOUT_OBSERVATION",
  },
  signal: {
    whyBg:
      "Потеглянето от място е маневра. Мигачът не иска разрешение — той съобщава намерението ти достатъчно рано, за да може приближаващият отзад да реагира, вместо да те заобикаля в последния момент.",
    howBg:
      "Подай ляв мигач, изчакай поне едно премигване и чак тогава тръгвай. В симулатора щракни лоста за мигачи (или клавиша). Мигачът се изключва, след като си се включил в лентата.",
    rememberBg:
      "Мигач след започване на маневрата не е сигнал, а обяснение. Той трябва да е преди движението.",
    captionBg: "Ляв мигач — подаден преди първия сантиметър движение.",
    gradedByCode: "TURN_WITHOUT_INDICATOR",
  },
  "move-off": {
    whyBg:
      "Потеглянето е моментът, в който встъпваш в движението — а движещите се по платното имат предимство пред теб. Плавното тръгване ти оставя време да прекратиш маневрата, ако отзад се появи някой.",
    howBg:
      "Отпусни спирачката и натисни газта постепенно — колата тръгва, без да подскача. Ако отзад приближава кола, изчакай я: тръгването не е състезание за пролука.",
    rememberBg:
      "Ако при потегляне някой намали заради теб, не си се включил безопасно — изчакал си недостатъчно.",
    captionBg: "Плавно потегляне — след като си пропуснал движещите се по платното.",
    gradedByCode: "MOVE_OFF_WITHOUT_OBSERVATION",
  },
};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * The law citation for a step, RETRIEVED from the rules catalog entry that
 * grades its omission (ADR-002: retrieval + citation, never free recall).
 */
export function preDriveTutorialLaw(stepId: PreDriveStepId): string | undefined {
  return VIOLATIONS[PRE_DRIVE_TUTORIALS[stepId].gradedByCode].lawRef;
}

/**
 * The media the popup should show for a step: the generated clip once one is
 * authored, otherwise the inline still. The ONLY place the still/clip choice
 * is made — callers never read `PRE_DRIVE_TUTORIAL_CLIPS` directly.
 */
export function preDriveTutorialMedia(stepId: PreDriveStepId): PreDriveTutorialMedia {
  const captionBg = PRE_DRIVE_TUTORIALS[stepId].captionBg;
  const clip = PRE_DRIVE_TUTORIAL_CLIPS[stepId];
  return clip === undefined
    ? { kind: "still", stepId, captionBg }
    : { kind: "clip", stepId, captionBg, clip };
}
