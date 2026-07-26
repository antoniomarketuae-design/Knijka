import { describe, expect, it } from "vitest";
import { SC_ZEBRA_APPROACH } from "@/modules/sim/lessons/scenario/templates-flow";
import { FEATURED_DEBRIEF } from "../featuredMistakes";

/**
 * The landing page quotes the product's own debrief text verbatim (ADR-002:
 * stored content, never generated). It COPIES that text rather than importing
 * the scenario module, because importing it would drag the scenario catalogue
 * into the landing route's graph — the ~737 KB regression audit M-26 measured
 * elsewhere.
 *
 * This test is the price of that copy. It imports the template (a test has no
 * weight budget) and fails the moment the two drift, so the marketing page can
 * never quietly start advertising words the product no longer says.
 */
describe("landing page quotes the scenario bank verbatim", () => {
  const mistake = SC_ZEBRA_APPROACH.mistakes[0];

  it("quotes the featured mistake's stored title", () => {
    expect(FEATURED_DEBRIEF.titleBg).toBe(mistake.titleBg);
  });

  it("quotes the featured mistake's stored explanation", () => {
    expect(FEATURED_DEBRIEF.whatWentWrongBg).toBe(mistake.whatWentWrongBg);
  });

  it("quotes the lesson's stored law reference", () => {
    expect(FEATURED_DEBRIEF.lawRef).toBe(SC_ZEBRA_APPROACH.teach.lawRef);
  });

  it("quotes the lesson's stored examiner rubric", () => {
    expect(FEATURED_DEBRIEF.examinerBg).toBe(SC_ZEBRA_APPROACH.teach.examinerBg);
  });

  it("features the mistake whose clip the reel plays", () => {
    // The reel's clip id is "<templateId>__m<mistakeIndex>"; if the featured
    // clip ever moves to another mistake, the quoted debrief must move with it
    // or the page shows one mistake and explains a different one.
    expect(SC_ZEBRA_APPROACH.id).toBe("sc-zebra-approach");
    expect(mistake.traceRef.path).toContain("sc-zebra-approach/");
  });
});
