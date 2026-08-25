/**
 * =============================================================================
 * THE ⚙ SHEET GETS A SOUND ROW — sweep w10, nine rows, 2026-08-25.
 * =============================================================================
 *
 * Nine findings across seven lessons say „no evidence of audio anywhere, and no
 * way to control it". Six photograph the same in-lesson sheet
 * (`sc-vu-emergency/mobile-right/07b-menu.png` + five siblings), whose complete
 * contents are «Съветник · Въпроси · Задача · Карта · Качество · Прекрати урока
 * · ← Всички уроци».
 *
 * The rows' diagnosis — that the product has no audio — is wrong, and the true
 * one is worse: `scene/simAudio.ts` is a full procedural mix, live on every
 * lesson, and the ONLY route to muting it was `CABIN_KEYS.muteAudio`, a
 * keyboard key. On the phone those six frames were taken on, the mix was
 * uncontrollable.
 *
 * WHAT THIS FILE HOLDS, and what it deliberately cannot. jsdom has no layout
 * engine, so „the hint fits two lines at 208 px" is not assertable here — it is
 * a CHARACTER budget, measured once in `qualityChoice.ts` and pinned as a
 * number, exactly as that row's own test pins it. So: the copy is held as pure
 * functions, and the WIRING is held by a source pin, because a copy module
 * nothing renders is the shape this programme keeps paying for.
 *
 * EVERY CASE BELOW WAS MUTATION-PROVED. The mutation is named beside each one.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SOUND_HINT_MAX_CHARS,
  soundAriaLabelBg,
  soundHintBg,
  soundValueBg,
} from "./soundChoice";

/**
 * NORMALISED, AND THAT IS NOT COSMETIC. This repo checks out CRLF on Windows
 * and stores LF in the index, so a source pin written as a multi-line literal
 * is red on one machine and green on the other — and the failure reads like a
 * logic error. Every pin below matches against this string.
 */
const SHELL = readFileSync(resolve(__dirname, "./LessonPlayShell.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/**
 * COMMENT-PROOF. Every pin below matches against the source with comment lines
 * REMOVED, so commenting a guarded line out cannot satisfy one — the failure
 * mode wave 2 found twice (a regex over raw text that a commented-out interval
 * still satisfied, 43 tests green while the card froze). Indentation is
 * preserved, because one of the pins reads it.
 */
const LIVE = SHELL.split("\n")
  .filter((l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("the «Звук» row's words", () => {
  /**
   * MUTATION: return the same string from both branches. Red — which is the
   * point of the case: a row whose word does not move is a row that cannot tell
   * the student which state he is in.
   */
  it("says which state the sound is in, in the sheet's own register", () => {
    expect(soundValueBg(false)).toBe("вкл.");
    expect(soundValueBg(true)).toBe("изкл.");
    // The two sibling toggles in this sheet («Съветник», «Карта») say вкл./изкл.
    // A row that states its state in a third register is one the student has to
    // stop and decode mid-drive.
    expect(soundValueBg(true)).not.toBe(soundValueBg(false));
  });

  /**
   * THEO-4, and this is the case that earns the row its second line.
   *
   * MUTATION: shorten either hint to «Звукът е изключен.» — a true, bare state
   * sentence with no reason in it. Red on the „names a reason" assertion.
   */
  it("never ships a bare state word — each state names what it costs", () => {
    for (const muted of [false, true]) {
      const hint = soundHintBg(muted);
      expect(hint.length).toBeGreaterThan(0);
      // The reason is always the same fact — sound is half of how fast the car
      // feels — said from the side the student is standing on. Both lines must
      // carry it; neither may be a restatement of the value word.
      expect(hint).not.toBe(soundValueBg(muted));
      expect(/скорост|бързо/.test(hint)).toBe(true);
    }
    // The two lines are different sentences: the muted one also names the way
    // back, because it is the only choice that can make the lesson teach the
    // wrong thing.
    expect(soundHintBg(true)).not.toBe(soundHintBg(false));
    expect(soundHintBg(true)).toContain("Включи");
  });

  /**
   * THE BUDGET IS THE QUALITY ROW'S, MEASURED THERE AND INHERITED HERE: 208 px
   * of column, two lines of 10 px type, a third line costs 12.5 px the sheet
   * does not have on the tightest ladder profile.
   *
   * MUTATION: append „ — виж настройките за звука в менюто." to either line
   * (total 88 / 93). Red.
   */
  it("fits the sheet's two-line hint budget in both states", () => {
    for (const muted of [false, true]) {
      expect(soundHintBg(muted).length).toBeLessThanOrEqual(SOUND_HINT_MAX_CHARS);
    }
  });

  /**
   * MUTATION: drop the `soundHintBg(...)` term from the template. Red — a
   * screen-reader user would get the label and a bare state word, which is the
   * same THEO-4 failure the visible row was just fixed for.
   */
  it("gives the row one accessible name carrying label, state and reason", () => {
    for (const muted of [false, true]) {
      const aria = soundAriaLabelBg(muted);
      expect(aria).toContain("Звук");
      expect(aria).toContain(soundValueBg(muted));
      expect(aria).toContain(soundHintBg(muted));
    }
  });

  /**
   * THE FIVE POINT SCALES MUST NEVER BE CONFLATED, and the cheapest way to
   * conflate them is a bare «точки» in new copy. This row's copy has no
   * business mentioning any of them.
   *
   * MUTATION: add „ — иначе губиш точки." to a hint. Red.
   */
  it("names no point scale, because it grades nothing", () => {
    for (const s of [soundHintBg(false), soundHintBg(true), soundAriaLabelBg(false)]) {
      expect(/точк/i.test(s)).toBe(false);
    }
  });
});

describe("…AND THE SHEET ACTUALLY RENDERS IT", () => {
  /**
   * THE CASE THIS FILE EXISTS FOR.
   *
   * Six predicates shipped in this programme's last week were gated, correct,
   * and read by NOTHING — `districtWorldEdge`, `worldEdgeClearanceM`,
   * `touchHintShouldHide`, `whyIsReachable`, `itemEchoesLine`, and a
   * commendation `explanationBg` that `toHudEvents` drops before the HUD sees
   * it. A copy module with a green unit test and no consumer is that shape
   * exactly, and the four cases above would all pass with the row deleted.
   *
   * MUTATION RUN: the whole `key: "sound"` item was commented out of the
   * PlayMenu array. This case went red; all four above stayed green. That gap
   * is the entire reason this block is here.
   *
   * COMMENT-PROOF: the pin requires the row's terms on lines that are not
   * comments (see `LIVE` above), so commenting the item out cannot satisfy it.
   */
  it("mounts a «Звук» row in the in-lesson menu", () => {
    expect(LIVE).toContain('key: "sound"');
    expect(LIVE).toContain('labelBg: "Звук"');
  });

  it("wires the row to the store that owns the bit, not to a local field", () => {
    // The toggle the row calls is the store's, so the M key and this row are
    // the same act — `SimAudio.toggleMute()` writes the same door.
    expect(LIVE).toContain("onSelect: toggleSimAudioMuted");
    // …and the word it shows is read from the same store, so the row cannot
    // display a state the mix is not in.
    expect(LIVE).toContain("useSimAudioMuted()");
    expect(LIVE).toContain("soundValueBg(soundMuted)");
  });

  it("carries the reason and the accessible name onto the row", () => {
    expect(LIVE).toContain("hintBg: soundHintBg(soundMuted)");
    expect(LIVE).toContain("ariaLabelBg: soundAriaLabelBg(soundMuted)");
  });

  /**
   * THE EXAM CLAUSE, held because it is a decision and not an accident.
   *
   * The row sits in the array's unconditional tail, beside «Карта» — NOT inside
   * the `!examMode && !mistakeMode` block that guards «Съветник» and «Въпроси».
   * That is deliberate: muting is no advantage, and an exam whose stimulus is a
   * чл. 91 siren is unpassable to a student who muted three lessons ago and has
   * no control to undo it with.
   *
   * ⚠ THE FIRST VERSION OF THIS CASE GUARDED NOTHING, and it is worth the
   * paragraph because the shape is this programme's most expensive one. It
   * asserted `indexOf('key: "sound"') > indexOf('key: "quiz"')` — a SOURCE
   * ORDINAL, not a condition. The docblock's named mutation (move the item into
   * the coaching group) went red only because moving TEXT moves the offset. A
   * verifier then wrapped the item WHERE IT STOOD:
   *
   *     ...(!examMode ? [{ key: "sound", … }] : []),
   *
   * — semantically identical to the mutation, the row gone from every exam, and
   * ALL NINE CASES STAYED GREEN. So this reads the BRANCH instead of the offset:
   * the span of source the row lives in may not mention a mode at all.
   *
   * MUTATION RUN (the verifier's, in place): red on the span assertion.
   * MUTATION RUN (move the item into the `!examMode && !mistakeMode` group,
   * prettier-reindented as a real edit would be): red on the depth assertion —
   * which is the half that survives someone wrapping «Карта» and «Звук»
   * together, where the span between them would stay clean.
   */
  it("is present in the exam too — no mode gates the row out", () => {
    const minimap = LIVE.indexOf('key: "minimap"');
    const sound = LIVE.indexOf('key: "sound"');
    const quality = LIVE.indexOf('key: "quality"');
    expect(minimap).toBeGreaterThan(-1);
    expect(quality).toBeGreaterThan(minimap);
    expect(sound).toBeGreaterThan(minimap);
    expect(sound).toBeLessThan(quality);

    // THE CONDITION. «Карта» is unconditional and «Качество» is guarded by
    // `onQualityChange` (a capability, not a mode), so everything the row lives
    // among is mode-free. A guard put on this item — before it as a spread head
    // or after it as the ternary's tail — lands inside this span.
    const span = LIVE.slice(minimap, quality);
    expect(span).not.toContain("examMode");
    expect(span).not.toContain("mistakeMode");

    // …AND AT THE ARRAY'S OWN DEPTH. Every conditional group in this array is a
    // spread of an array literal, which costs two indent steps: «Качество» sits
    // at 16 where «Карта» and «Звук» sit at 10. Pinned against the tail row
    // «← Всички уроци», which is unconditional by construction, so this cannot
    // drift with a whole-file reformat.
    const depthOf = (needle: string): number => {
      const line = LIVE.split("\n").find((l) => l.includes(needle));
      if (line === undefined) throw new Error(`no live line contains ${needle}`);
      return line.length - line.trimStart().length;
    };
    const arrayDepth = depthOf('{ key: "exit"');
    expect(depthOf('key: "sound"')).toBe(arrayDepth + 2);
    expect(depthOf('key: "minimap"')).toBe(arrayDepth + 2);
    expect(depthOf('key: "quality"')).toBeGreaterThan(arrayDepth + 2);
  });
});

/**
 * …AND THE SHEET ABSORBS THE EIGHTH ROW — the cost side of this patch.
 *
 * `PlayMenu`'s own footprint block exists because a row here is not free: on the
 * deployed build the portrait sheet cleared the first thumb station by 3 px, and
 * in landscape the seventh row had already fallen below the fold once. This
 * lane added a HINT-BEARING row (56.5 px, not 43.5), so the portrait sheet grows
 * past that clearance — the arithmetic is written into that block.
 *
 * TWO MECHANISMS MAKE THAT A PRICE RATHER THAN A REGRESSION, and only one of
 * them was gated: §W3 (the sheet pauses the scene, so a covered station is inert
 * rather than dead) is held by `shellViewportContract.test.ts`; the pair that
 * turns growth into SCROLLING was held by nothing. A verifier deleted
 * `overflow-y-auto` from this element and 724 tests stayed green.
 *
 * WHAT THIS CANNOT DO: jsdom has no layout engine, so „the sheet fits" is not
 * assertable here and this file does not pretend to. It pins the two properties
 * whose absence would make the next added row fall off the stage — which is the
 * defect this sheet has already shipped once.
 */
describe("the ⚙ sheet can absorb the row it was just given", () => {
  // The `role="menu"` element's own opening tag and nothing else — bounded at
  // the tag close, so a neighbour that happens to scroll cannot satisfy a pin
  // written about this one.
  const menuTagStart = LIVE.indexOf('role="menu"');
  const menuTagEnd = LIVE.indexOf("\n        >", menuTagStart);
  // Not decoration: `indexOf` returning -1 would make `slice` run to the end of
  // the file and both pins below could then be satisfied by some other
  // element's className — a gate that passes for the wrong reason is worse than
  // one that fails.
  it("…and this file is reading the sheet's own tag", () => {
    expect(menuTagStart).toBeGreaterThan(-1);
    expect(menuTagEnd).toBeGreaterThan(menuTagStart);
  });
  const sheet = menuTagEnd > menuTagStart ? LIVE.slice(menuTagStart, menuTagEnd) : "";

  /**
   * MUTATION: delete `overflow-y-auto` from the `role="menu"` className. Red.
   * (A token mid-template cannot be commented out; the neighbouring case takes
   * the comment-out mutation.)
   */
  it("scrolls its own rows rather than growing off the stage", () => {
    expect(sheet).toContain("overflow-y-auto");
    // `min-h-0` is the half that actually lets it shrink: a flex child defaults
    // to `min-height: auto` and would push the wrapper past its cap instead of
    // scrolling inside it.
    expect(sheet).toContain("min-h-0");
  });

  /**
   * MUTATION: comment the `maxHeight` line out of the wrapper's style object —
   * `// maxHeight: "calc(100% - 1rem)",`. Red, because the pin runs against the
   * comment-filtered source.
   */
  it("caps at the stage, so the cap is what the scroll happens inside", () => {
    const menu = LIVE.slice(LIVE.indexOf("function PlayMenu("));
    expect(menu.slice(0, menu.indexOf('role="menu"'))).toContain(
      'maxHeight: "calc(100% - 1rem)"',
    );
  });
});
