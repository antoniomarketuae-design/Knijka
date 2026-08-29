/**
 * No-spoiler caption gate — the sc-zebra-approach:8dda834f class, swept
 * corpus-wide (audit sweep161, 2026-08-24).
 *
 * THE DEFECT: the demonstration deck caption (`annotation.textBg`, rendered by
 * TraceTimeline's data-hud="deck-caption" box) can surface OUT OF PHASE with
 * the student's world — the demo clock autoplays, so the frame-verified
 * arrival screen of «Пешеходна пътека» already showed «Пътеката е свободна —
 * премини спокойно.» on the one lesson whose whole point is a pedestrian
 * stepping onto that crossing. A coach line must therefore NEVER assert the
 * staged hazard's outcome as fact and then command motion; it must put the
 * condition on the student's own verification («едва когато …»), the voice the
 * ratified templates already use (templates-pe.ts «Премини спокойно едва
 * когато пътеката е свободна.»).
 *
 * THE CLASS, precisely — flagged if, inside one annotation text:
 *   1. a clearance assertion appears («… е свободна/свободно/чист/чиста/
 *      чисто …» or «слезе напълно …»), AND
 *   2. a second-person motion imperative (премини/продължи/потегли/довърши/
 *      тръгни) appears AFTER it, AND
 *   3. no conditional guard (едва/само/чак + когато/щом, or «увери се»/
 *      «убеди се») appears before that imperative.
 * First-person demo narration («пътят е чист — завиваме/потегляме») is NOT the
 * class: it describes the shadow's own act and is the phase problem of the
 * demo clock, owned by the caption/clock surfaces, not by the text.
 *
 * Scans every committed trace JSON (content/traces AND the byte-identical
 * platform/public copies), which the per-family gates keep equal to the
 * recording scripts — so this fails whenever a script reintroduces the class
 * and gets re-recorded. Mutation-proven on the pre-fix corpus: 18 captions in
 * 18 recordings flagged before the 2026-08-24 re-record.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const ROOTS = [
  path.join(REPO_ROOT, "content", "traces"),
  path.join(REPO_ROOT, "platform", "public", "traces"),
];

// Cyrillic-safe boundaries: JS \b is ASCII-only, so Cyrillic words need
// explicit lookarounds on the Cyrillic block.
const CYR = "\\u0400-\\u04FF";
/**
 * «… е свободна/чист(а/о) …» as a bare assertion, or «слезе напълно …», or
 * «… са/е вдигнат(и/а) …».
 *
 * THE THIRD ALTERNATIVE IS THE GENERAL FORM, AND IT COST A FALSE REFUSAL.
 * `.audit-frames/w10-3/frames/sc-rx-guarded__pc-right/04-t074s.png` carries
 * «Бариерите са вдигнати напълно. Бърз оглед и премини решително — без спиране
 * върху релсите.» on the deck-caption box, with the red-and-white boom lying
 * flat across the carriageway in the same frame and the −10 «Влизане на прелез
 * при спусната бариера» six seconds later. This gate's first two alternatives
 * are the ZEBRA's vocabulary; a raised-arm claim is the identical shape (assert
 * the hazard is clear, then command motion) in the rail family's vocabulary,
 * and it was not caught. A rule with one enforced instance is a convention:
 * widening it flagged sc-rx-barrier-drop's shadow caption too — the same
 * sentence, character for character, on a barrier with its own 90 s timetable.
 * (Corrected: the round that widened this predicate recorded that sibling as
 * „a lesson no frame in this sweep had reached". It is not.
 * `.audit-frames/w10-1/frames/sc-rx-barrier-drop__pc-right/` holds 43 frames,
 * `run.log:215` carries the caption on the deck, and `04-t027s.png` shows it at
 * 9 км/ч. Believing there was no frame is why nobody looked — and the frame
 * also bills «Влизане на прелез при спусната бариера −10» on that CORRECT leg,
 * which no caption can repair. See scRxBarrierDrop.ts for the routed owner.)
 *
 * MEASURED over the whole corpus (503 content recordings, 1,870 captions):
 * before the re-record the widened predicate flags EXACTLY those two captions
 * and nothing else. The nearby raised-arm sentences stay silent because they
 * command nothing — «Бариерата е вдигната, но колоната още стои» (queue-clear),
 * «Бариерата е вдигната и прелезът е охраняем — не сме длъжни да спираме»
 * (pk-rail-ban), «Палката е вдигната, групата е стъпила» (school-patrol) — which
 * is the discipline this gate has had since it shipped: the offence is the
 * COMMAND resting on the claim, not the claim.
 */
const ASSERTION = new RegExp(
  `(?<![${CYR}])е\\s+(свободн|чист)|(?<![${CYR}])слезе\\s+напълно|(?<![${CYR}])(са|е)\\s+вдигнат`,
  "iu",
);
/** Second-person motion imperatives — the "go" half of the spoiler shape. */
const IMPERATIVE = new RegExp(
  `(?<![${CYR}])(премини|продължи|потегли|довърши|тръгни)(?![${CYR}])`,
  "iu",
);
/** A conditional that hangs the command on the student's own verification. */
const GUARD = /(едва|само|чак)\s+(когато|щом)|увери се|убеди се/iu;

/** True when the text asserts clearance and then commands motion, unguarded. */
export function isSpoilerCaption(text: string): boolean {
  const assertion = ASSERTION.exec(text);
  if (!assertion) return false;
  const after = text.slice(assertion.index + assertion[0].length);
  const imperative = IMPERATIVE.exec(after);
  if (!imperative) return false;
  const imperativeIndex = assertion.index + assertion[0].length + imperative.index;
  const guard = GUARD.exec(text);
  return !(guard && guard.index < imperativeIndex);
}

function traceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry);
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith(".trace.json")) out.push(path.join(p, f));
    } else if (entry.endsWith(".trace.json")) out.push(p);
  }
  return out;
}

describe("no-spoiler captions (sc-zebra-approach:8dda834f class)", () => {
  // The predicate itself, pinned on both sides so neither direction drifts:
  it("flags the assertion-then-command shape and only that shape", () => {
    // The frame-verified original — must flag.
    expect(isSpoilerCaption("Пътеката е свободна — премини спокойно.")).toBe(true);
    expect(isSpoilerCaption("Слезе напълно от платното — премини спокойно.")).toBe(true);
    expect(isSpoilerCaption("Палката е свалена, пътеката е чиста — потегли плавно.")).toBe(true);
    // The rail family's vocabulary — the sc-rx-guarded:e0c40055 frame, verbatim,
    // and the sibling the widening found in sc-rx-barrier-drop.
    expect(
      isSpoilerCaption(
        "Бариерите са вдигнати напълно. Бърз оглед и премини решително — без спиране върху релсите.",
      ),
    ).toBe(true);
    expect(
      isSpoilerCaption(
        "Бариерата е вдигната напълно. Бърз оглед и премини решително — без спиране върху релсите.",
      ),
    ).toBe(true);
    // …and its repair: the condition, never the state, so the sentence is true
    // at every phase of a 90 s barrier cycle and every offset of the replay clock.
    expect(
      isSpoilerCaption(
        "Премини решително едва когато лостът се вдигне ДОКРАЙ — бърз оглед наляво и надясно, без спиране върху релсите.",
      ),
    ).toBe(false);
    // A raised arm that commands NOTHING is not this gate's business — the three
    // live corpus sentences that sit closest to the new alternative.
    expect(isSpoilerCaption("Бариерата е вдигната, но колоната още стои — вдигната бариера не значи „влез“.")).toBe(
      false,
    );
    expect(
      isSpoilerCaption("Бариерата е вдигната и прелезът е охраняем — не сме длъжни да спираме. Не спираме и „за всеки случай“."),
    ).toBe(false);
    expect(isSpoilerCaption("Палката е вдигната, групата е стъпила — а колата продължава…")).toBe(false);
    // The repaired voice — condition before/around the command — must pass.
    expect(isSpoilerCaption("Премини спокойно едва когато пътеката е свободна.")).toBe(false);
    expect(
      isSpoilerCaption("Едва когато платното е чисто — продължи със същите 20 до края на зоната."),
    ).toBe(false);
    // First-person demo narration is the clock's problem, not this gate's.
    expect(isSpoilerCaption("Колата с предимство премина, пътят е чист — потегляме.")).toBe(false);
    expect(isSpoilerCaption("Пътят е чист — завиваме наляво уверено.")).toBe(false);
    // An explicit self-check before the command is a guard, not a spoiler.
    expect(
      isSpoilerCaption("Готовност: намали леко, увери се, че напред е чисто — и премини, без да спираш излишно."),
    ).toBe(false);
  });

  it("no committed trace caption asserts the staged outcome before commanding motion", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of ROOTS) {
      for (const file of traceFiles(root)) {
        const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
          events?: { kind?: string; textBg?: string }[];
        };
        for (const e of parsed.events ?? []) {
          if (typeof e.textBg !== "string") continue;
          scanned += 1;
          if (isSpoilerCaption(e.textBg)) {
            offenders.push(`${path.relative(REPO_ROOT, file)}: «${e.textBg}»`);
          }
        }
      }
    }
    // The corpus is large; an empty scan means the roots moved, not that all is well.
    expect(scanned).toBeGreaterThan(500);
    expect(offenders, offenders.join("\n")).toEqual([]);
    // 1,006 trace JSONs / 3,740 captions, MEASURED at 1,729 ms warm on this
    // box (7200 rpm HDD). Vitest default 5 s is under that as soon as the page
    // cache is cold or a sibling suite competes for the spindle, so this gate
    // failed on TIMEOUT, never on an offender. The whole-corpus scan is the
    // point of the gate; give it room rather than narrowing what it reads.
    //
    // RAISED AGAIN 2026-08-30, same cause one load-level up. Measured: 1.71 s
    // run alone, 88.3 s inside the full suite at --maxWorkers=2, where the
    // other workers are competing for the same spindle. 60 s was calibrated
    // against a lighter suite. It failed the commit gate while passing every
    // time it was run on its own, and a gate that fails at random teaches
    // people to re-run until green — which is how a real regression gets
    // waved through.
  }, 240_000);
});
