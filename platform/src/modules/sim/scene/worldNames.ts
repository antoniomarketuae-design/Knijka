/**
 * BG display names of the shipped worlds — the loading/error copy in
 * LessonScene reads these („Зареждане на {name}…" / „Данните за {name} не
 * успяха да се заредят."). Extracted from LessonScene (a "use client" module
 * that drags in three.js/rapier) so the coverage test (worldNames.test.ts) can
 * import the map under the node test env. LessonScene imports `worldNameBg`
 * from here — the map is NOT duplicated.
 *
 * Coverage law: every districtId a shipped ScenarioSpec.map names MUST have an
 * entry — worldNames.test.ts asserts it against SCENARIO_TEMPLATES, so a new
 * district can never silently fall back to „света" across the catalog again.
 * Unknown ids fall back to WORLD_NAME_FALLBACK.
 *
 * Each name is the genitive/definite short form of the district's own authored
 * meta.label (content/world/<id>.json). Real Sofia toponyms are used ONLY where
 * the map models a real place (d2-v1 = Лозенец, district-v1 = Студентски град);
 * every synthetic training map gets a descriptive name, never an invented
 * toponym. Names are collision-checked: no two districts share a display name.
 */

/** Fallback name when a districtId carries no authored display name. */
export const WORLD_NAME_FALLBACK = "света";

export const WORLD_NAME_BG: Record<string, string> = {
  "district-v1": "Студентски град",
  "d2-v1": "Лозенец",
  "poligon-v1": "учебния полигон",
  "lot-perp-v1": "учебния паркинг",
  // Base districts (pre-wave) — the maps that shipped before the named waves
  // below. Alphabetical by districtId (the dominant within-block convention).
  // Each name is the district's own meta.label, shortened to the same
  // genitive/definite form the two copy strings need.
  "ac-aqua-v1": "пътя с локвите",
  "ac-ice-v1": "улицата с лед по моста",
  "ac-night-v1": "нощната улица",
  "ac-rain-v1": "улицата в дъжда",
  "fo-brake-v1": "улицата с внезапното спиране",
  "fo-follow-v1": "улицата за дистанция на следване",
  "hz-obstacle-v1": "улицата с препятствие на платното",
  "ln-v1": "булеварда за смяна на лента",
  "lot-45-v1": "паркинга с косите места",
  "lot-narrow-v1": "паркинга с тясното гнездо",
  "lot-par-v1": "паркинга с успоредното място",
  // The ten parking situations the founder asked for („10 at least which to
  // teach how to park the students"). Each teaches a different thing — a short
  // kerb gap is not a long one, a bay beside a van is not a bay beside a wall —
  // so each gets its own district and its own name here.
  "lot-45rev-v1": "паркинга с косото място на заден ход",
  "lot-double-v1": "паркинга с двата реда гнезда",
  "lot-gap-judge-v1": "паркинга за преценка на мястото",
  "lot-gap-long-v1": "паркинга с дългото място край бордюра",
  "lot-gap-short-v1": "паркинга с късото място край бордюра",
  "lot-left-v1": "паркинга с гнездото отляво",
  "lot-night-v1": "нощния паркинг край неосветения ред",
  "lot-van-v1": "паркинга с гнездото до буса",
  "lot-wall-v1": "паркинга с крайното гнездо до стената",
  "lot-zebra-v1": "паркинга до пешеходната пътека",
  "mw-v1": "магистралата с аварийна лента",
  "ov-ban-v1": "булеварда със знак В24",
  "ov-bus-v1": "булеварда с бус лентата",
  "ov-crossing-v1": "булеварда с пешеходната пътека",
  "ov-keepright-v1": "булеварда за движение вдясно",
  "ov-lane-v1": "улицата за движение в лентата",
  "lc-gantry-v1": "булеварда със сигнален портал над лентите",
  "ov-narrow-v1": "тясната улица",
  "ov-oncoming-v1": "извънградския път с насрещни",
  "ov-oneway-v1": "еднопосочната улица",
  "ov-solid-v1": "улицата с непрекъсната осева линия",
  "pe-bus-v1": "улицата със спрелия автобус",
  "pe-cane-v1": "улицата с пешеходеца с бял бастун",
  "pe-child-v1": "улицата с детето с топката",
  "pe-clear-v1": "улицата с пътеката",
  "pe-dart-v1": "улицата с внезапния пешеходец",
  "pe-jay-v1": "кръстовището с пресичащия неправилно",
  "pe-rain-v1": "пътеката в дъжда",
  "pe-slow-v1": "улицата с бавния пешеходец",
  "pk-ban-v1": "улицата със знак В27",
  "pk-drive-v1": "жилищната улица с алеята",
  "pk-stop-v1": "улицата за плавно спиране",
  "rb-mini-v1": "мини кръговото движение",
  "rx-drop-v1": "прелеза със спускащата се бариера",
  "rx-guarded-v1": "охраняемия жп прелез",
  "rx-tram-island-v1": "трамвайната спирка с остров",
  "rx-unguarded-v1": "неохраняемия жп прелез",
  "sp-creep-v1": "улицата с пълзящото превишаване",
  "sp-creep2-v1": "дългата улица с прехода 50→30",
  "sp-curve-v1": "извънградския завой",
  "sp-danger-v1": "улицата с превишаването",
  "sp-rain-v1": "улицата с дъжд през нощта",
  "sp-trans-v1": "прехода към зона 30",
  "sp-zone30-v1": "улицата в зона 30",
  "sx-v1": "светофарното кръстовище",
  "tj-emerge-v1": "Т-кръстовището с кола по главния",
  "tj-occluded-v1": "Т-кръстовището с ограничена видимост",
  "tj-rhr-v1": "Т-кръстовището с предимство отдясно",
  "tj-stop-v1": "Т-кръстовището със знак Б2",
  "vp-ready-v1": "улицата за подготовка преди тръгване",
  "vu-cyclist-v1": "Т-кръстовището с велосипедиста",
  "vu-door-v1": "улицата със зоната на вратата",
  "vu-pass-v1": "улицата за изпреварване на велосипедист",
  "wb-boulevard-v1": "широкия булевард",
  "zb-v1": "улицата със зебра",
  // Wave 1 districts. Names are the genitive/definite form the two copy
  // strings below need („Зареждане на …" / „Данните за …").
  "jx-equal-v1": "равнозначното кръстовище",
  "jxg-giveway-v1": "улицата с два знака „Пропусни движението“",
  "ln-arrows-v1": "кръстовището с лентови стрелки",
  "pk-banx-v1": "улицата с пътека и кръстовище",
  "pe-school-v1": "улицата пред училището",
  "mw-entry-v1": "входа на магистралата",
  // Wave 2 districts. The five reuse items keep their existing map's name.
  "ln-merge-v1": "улицата със стеснение",
  "pk-busstop-v1": "улицата със спирка",
  "sp-signs-v1": "улицата със знаци за скорост",
  // Wave 3 districts. The five reuse items keep their existing map's name.
  "hz-roadworks-v1": "улицата с пътния ремонт",
  "pk-ban2-v1": "улицата със знаци В27 и В28",
  "sig-wave-v1": "булеварда със зелена вълна",
  // Wave 4 districts. The four reuse items keep their existing map's name.
  "mg-busstop-v1": "улицата с бус лента",
  "ov-crest-v1": "завоя извън населено място",
  "pk-double-v1": "улицата с паркирани коли",
  "rb-2lane-v1": "двулентовото кръгово",
  // Wave 5 districts. The four reuse items keep their existing map's name.
  "mg-property-v1": "изхода от бензиностанцията",
  "ov-solid2-v1": "пътя със затварящ се прозорец за изпреварване",
  // Wave 6 districts. The three reuse items keep their existing map's name.
  "mw-exit-v1": "изхода на магистралата",
  "mv-uturn-v1": "булеварда с остров",
  "rb-ped-v1": "кръговото с пътеки на изходите",
  "hz-debris-v1": "улицата с препятствие в лентата",
  // Wave 7 districts — the wave's four new maps. Its one reuse item
  // (sc-ln-obstacle-meeting on ov-narrow-v1) is now named in the base block.
  "pk-rail-v1": "улицата с жп прелеза",
  "pe-zone-v1": "зоната за живеене",
  "vu-child-v1": "улицата с детето на велосипед",
  "ac-bridge-v1": "заледения мост",
  // Wave 8 districts — the wave's three new maps. Its four reuse items
  // (ln-v1, sx-v1, mw-v1, poligon-v1) are named in the base block / above.
  "vu-bikelane-v1": "улицата с велоалея",
  "rx-tram-stop-v1": "улицата с трамвайна спирка",
  "hz-accident-v1": "улицата с произшествие",
};

/** Resolved BG display name for a district id — the fallback where unknown. */
export function worldNameBg(districtId: string): string {
  return WORLD_NAME_BG[districtId] ?? WORLD_NAME_FALLBACK;
}
