/**
 * =============================================================================
 * THE TEACH CARD'S BODY ROW FINISHES ITS SENTENCE — sc-merge-from-property:
 * 6715b581 (major), re-judged STILL on the w41 re-drive.
 *
 * THE FRAME the row is filed on:
 * `.audit-frames/w41/frames/sc-merge-from-property__mobile-right/04-t093s.png`
 * — the only teach beat of that leg, iPhone 16 landscape. The card reads
 * «⏸ УЧЕБЕН МОМЕНТ / Излизане от платното за движение / Излезе с колата извън /
 * [ЗАЩО ↓39] [РАЗБРАХ]»: a two-line title, a body that stops on its preposition
 * with its object missing, and thirty-nine more lines behind the counter.
 *
 * THE MECHANISM the product already had: `rules/catalog.ts` authors `peekBg` —
 * a complete one-line summary — on 87 rows, and `hud/overlayQueue
 * .overlayPeekBodyBg` prints it in preference to `detailBg` on any item that
 * carries one. The violation TOAST has passed it since sc-pk-driveway:fa602d10.
 * The compact TEACH item is assembled by hand in `LessonPlayShell` and never
 * did, so the peek fell through to a 750-character paragraph and clamped it.
 *
 * THIS FILE IS THE DEAD-PREDICATE GATE for that repair: a `peekBg` computed and
 * wired to nothing is the 51-of-82 class this programme measured, so the
 * function, the CALL SITE and the CONSUMER are each asserted here.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The deep path, as `queueTaskEcho.test.ts` already does for `itemEchoesLine`:
// this predicate is the overlay module's own and is not on the barrel.
import { overlayPeekBodyBg } from "@/modules/sim/hud/overlayQueue";
import { type SimOverlayItem } from "@/modules/sim/hud";
import { VIOLATIONS } from "@/modules/sim/rules";

import { teachMomentPeekBg } from "../LessonPlayShell";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
/** Code only — a source assertion that cannot tell code from the paragraph
 *  describing it is a ban on writing the reason down. */
const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("teachMomentPeekBg · the summary the peek can finish", () => {
  it("hands back the catalogue's own one-liner for the row in the frame", () => {
    // Retrieved from the catalogue, never typed here (ADR-002 discipline
    // applied to copy: one home for the sentence).
    const authored = VIOLATIONS.OFF_CARRIAGEWAY.peekBg;
    expect(typeof authored).toBe("string");
    expect(teachMomentPeekBg("OFF_CARRIAGEWAY")).toBe(authored);
  });

  it("…and what it hands back is a line, not a paragraph", () => {
    // The window this row prints into is one line of a compact peek. The point
    // of the repair is that the sentence ENDS inside it — a summary that is
    // itself clamped would be the same defect with a different string.
    const peek = teachMomentPeekBg("OFF_CARRIAGEWAY");
    expect(peek).not.toBeNull();
    expect(peek!.length).toBeLessThanOrEqual(80);
    expect(peek!.trim()).toMatch(/[.!?…]$/);
    // …and it is not simply the head of the paragraph the card was clamping.
    expect(VIOLATIONS.OFF_CARRIAGEWAY.explanationBg.startsWith(peek!)).toBe(false);
  });

  it("a code this catalogue has not got prints today's card, and does not throw", () => {
    // `TeachMoment.code` is typed `string` (lessons/types.ts) and
    // `violationPeekBg` indexes VIOLATIONS unguarded. `null` means „leave the
    // body exactly as it was", which is the direction that cannot cost a
    // student a sentence.
    expect(teachMomentPeekBg("NOT_A_CODE")).toBeNull();
    expect(teachMomentPeekBg("")).toBeNull();
    // Prototype keys are not codes either.
    expect(teachMomentPeekBg("toString")).toBeNull();
    expect(teachMomentPeekBg("constructor")).toBeNull();
  });

  it("every row that authors a peek reaches this surface through it", () => {
    // The pooled row is what this surface can reach: `TeachMoment` carries no
    // `detail`, so the act-split summaries (the four COLLISION bodies) resolve
    // to their pooled one. Asserted as a sweep rather than on one code so a row
    // whose peek is deleted later fails here instead of going quiet on the
    // glass.
    const codes = Object.keys(VIOLATIONS) as Array<keyof typeof VIOLATIONS>;
    const authored = codes.filter((c) => {
      const p = VIOLATIONS[c].peekBg;
      return typeof p === "string" && p.trim().length > 0;
    });
    expect(authored.length).toBeGreaterThan(50);
    for (const c of authored) {
      expect(teachMomentPeekBg(c), `${c} lost its peek on the teach card`).toBe(
        VIOLATIONS[c].peekBg,
      );
    }
  });
});

describe("…and it is WIRED — the call site and the consumer", () => {
  it("the compact teach item passes it", () => {
    // The item is assembled inline in a 10 000-line component, which is exactly
    // how the field went missing for as long as it did: there was nothing to
    // assert against. Anchored on the item's own id expression so the slice
    // cannot drift onto a neighbouring card.
    const at = CODE.indexOf("id: `teach:${teachQueue[0].code}:${teachQueue[0].t}`");
    expect(at, "the compact teach item moved — re-anchor").toBeGreaterThan(-1);
    const item = CODE.slice(at, at + 1600);
    expect(item).toContain("peekBg: teachMomentPeekBg(teachQueue[0].code)");
    // …and `detailBg` stays WHOLE, because it is what «ЗАЩО» opens. A repair
    // that had shortened the paragraph instead would have deleted teaching.
    expect(item).toContain("teachQueue[0].explanationBg");
  });

  it("the consumer prints the summary in preference to the paragraph", () => {
    // `overlayPeekBodyBg` is the line on the glass (SimOverlay's row 2b). If
    // this ever stops preferring `peekBg`, the field above becomes a dead
    // predicate and this test is where it dies.
    const paragraph = VIOLATIONS.OFF_CARRIAGEWAY.explanationBg;
    const peek = teachMomentPeekBg("OFF_CARRIAGEWAY");
    const withPeek = {
      id: "teach:OFF_CARRIAGEWAY:12",
      kind: "teach",
      tone: "teach",
      lineBg: VIOLATIONS.OFF_CARRIAGEWAY.titleBg,
      detailBg: paragraph,
      peekBg: peek,
    } as unknown as SimOverlayItem;
    expect(overlayPeekBodyBg(withPeek)).toBe(peek);

    // …and the card of a code with no summary is byte-identical to today's.
    const without = { ...withPeek, peekBg: null } as SimOverlayItem;
    expect(overlayPeekBodyBg(without)).toBe(paragraph);
  });
});
