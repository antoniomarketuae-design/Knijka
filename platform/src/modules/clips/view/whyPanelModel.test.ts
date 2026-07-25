/**
 * whyPanelModel — THEO-2 Stage 1: the pure answer → panel-model fold.
 *
 * Battery: wrong/correct framing (headers, lead-in, replay collapse), the
 * ADR-002 guarantees (stored text passes through VERBATIM; a blank stored
 * explanation degrades to the citation-only fallback, never invented copy),
 * the drill deep link, and the display-dedupe of citations.
 */
import { describe, expect, it } from "vitest";
import type { WhyPanelSimRef } from "../whyPanel";
import {
  AVOIDED_MISTAKE_TOGGLE_BG,
  buildWhyPanelModel,
  CORRECT_LEAD_IN_BG,
  mistakeExperienceHref,
  simulatorDrillHref,
  traceUrlForRepoPath,
  WHY_NOT_HEADER_BG,
  WHY_YES_HEADER_BG,
  type WhyPanelSource,
} from "./whyPanelModel";

const SIM: WhyPanelSimRef = {
  templateId: "sc-park-perp-rev",
  level: 1,
  titleBg: "Успоредно паркиране на заден ход",
  mistake: {
    titleBg: "Качване на бордюра",
    whatWentWrongBg: "Волан завъртян твърде късно — задното колело се качи на бордюра.",
    // Repo-relative, exactly as the resolver hands it out.
    tracePath: "content/traces/sc-park-perp-rev/mistake-curb.trace.json",
    districtId: "zx-v1",
  },
  // THEO-3: not wired for this event by default; the experience cases below
  // override it.
  experience: null,
};

function source(overrides: Partial<WhyPanelSource> = {}): WhyPanelSource {
  return {
    correct: false,
    explanationBg: "При заден ход водачът е длъжен да пропусне преминаващите.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 40" }],
    sim: SIM,
    ...overrides,
  };
}

describe("buildWhyPanelModel — wrong answer", () => {
  const model = buildWhyPanelModel(source());

  it("frames as „Защо не“ with the stored text verbatim, no lead-in", () => {
    expect(model.tone).toBe("wrong");
    expect(model.headerBg).toBe(WHY_NOT_HEADER_BG);
    expect(model.leadInBg).toBeNull();
    expect(model.explanationBg).toBe(
      "При заден ход водачът е длъжен да пропусне преминаващите.",
    );
    expect(model.missingExplanation).toBe(false);
  });

  it("plays the replay open (not collapsed) with the stored mistake copy", () => {
    expect(model.replay).not.toBeNull();
    expect(model.replay?.collapsed).toBe(false);
    expect(model.replay?.toggleBg).toBeNull();
    expect(model.replay?.whatWentWrongBg).toBe(SIM.mistake.whatWentWrongBg);
    expect(model.replay?.mistakeTitleBg).toBe(SIM.mistake.titleBg);
    expect(model.replay?.districtId).toBe(SIM.mistake.districtId);
  });

  it("maps the repo-relative trace path to its /public URL for the fetch", () => {
    expect(model.replay?.tracePath).toBe(
      "/traces/sc-park-perp-rev/mistake-curb.trace.json",
    );
  });

  it("links the drill's entry rung on /simulator", () => {
    expect(model.replay?.drillHref).toBe("/simulator?scenario=sc-park-perp-rev&level=1");
  });

  it("carries no experience link when the event is not wired (THEO-3)", () => {
    expect(model.replay?.experienceHref).toBeNull();
    expect(model.replay?.experienceTitleBg).toBeNull();
  });
});

describe("buildWhyPanelModel — THEO-3 „Преживей грешката“", () => {
  it("builds the mistake-experience deep link from the wired seed ref", () => {
    const model = buildWhyPanelModel(
      source({
        sim: {
          ...SIM,
          experience: {
            templateId: "sc-zebra-approach",
            mistakeIndex: 1,
            titleBg: "Непропускане на пешеходец",
          },
        },
      }),
    );
    expect(model.replay?.experienceHref).toBe("/simulator?scenario=sc-zebra-approach&mistake=1");
    expect(model.replay?.experienceTitleBg).toBe("Непропускане на пешеходец");
  });
});

describe("buildWhyPanelModel — correct answer", () => {
  const model = buildWhyPanelModel(source({ correct: true }));

  it("frames as „Защо да“ with the fixed lead-in + the SAME stored text", () => {
    expect(model.tone).toBe("correct");
    expect(model.headerBg).toBe(WHY_YES_HEADER_BG);
    expect(model.leadInBg).toBe(CORRECT_LEAD_IN_BG);
    expect(model.explanationBg).toBe(
      "При заден ход водачът е длъжен да пропусне преминаващите.",
    );
  });

  it("offers the replay collapsed behind the avoided-mistake toggle", () => {
    expect(model.replay?.collapsed).toBe(true);
    expect(model.replay?.toggleBg).toBe(AVOIDED_MISTAKE_TOGGLE_BG);
  });
});

describe("buildWhyPanelModel — ADR-002 fallbacks", () => {
  it("blank stored explanation → citation-only fallback, nothing invented", () => {
    const model = buildWhyPanelModel(source({ explanationBg: "   " }));
    expect(model.explanationBg).toBeNull();
    expect(model.missingExplanation).toBe(true);
    // The citations still teach — they must survive the missing text.
    expect(model.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 40" }]);
  });

  it("blank explanation on a CORRECT answer drops the lead-in too (a lead-in over nothing would read as generated copy)", () => {
    const model = buildWhyPanelModel(source({ correct: true, explanationBg: "" }));
    expect(model.leadInBg).toBeNull();
    expect(model.missingExplanation).toBe(true);
  });

  it("no sim ref → no replay section", () => {
    const model = buildWhyPanelModel(source({ sim: null }));
    expect(model.replay).toBeNull();
  });
});

describe("buildWhyPanelModel — THEO Half A picture card", () => {
  it("spotlights the correct sign face on a „which sign?“ grid (sim === null)", () => {
    const model = buildWhyPanelModel(
      source({
        sim: null,
        media: null,
        correctOptionIds: ["b"],
        options: [
          { id: "a", textBg: "Знак А", media: { kind: "sign", signRef: "А1" } },
          { id: "b", textBg: "Спри! Пропусни движението", media: { kind: "sign", signRef: "Б2" } },
          { id: "c", textBg: "Знак В", media: { kind: "sign", signRef: "В1" } },
        ],
      }),
    );
    expect(model.picture).not.toBeNull();
    expect(model.picture?.media).toBeNull();
    expect(model.picture?.correctSign).toEqual({
      signRef: "Б2",
      labelBg: "Спри! Пропусни движението",
    });
  });

  it("redraws the question's scene still (priority/marking question)", () => {
    const media = {
      kind: "sceneStill" as const,
      districtId: "zx-v1",
      focus: { x: 0, y: 0, zoomM: 40 },
      poses: [],
    };
    const model = buildWhyPanelModel(source({ sim: null, media }));
    expect(model.picture?.media).toEqual(media);
    expect(model.picture?.correctSign).toBeNull();
  });

  it("redraws the question's sign face (sign-meaning question)", () => {
    const model = buildWhyPanelModel(
      source({ sim: null, media: { kind: "sign", signRef: "В24" } }),
    );
    expect(model.picture?.media).toEqual({ kind: "sign", signRef: "В24" });
  });

  it("leaves the reel path untouched: no picture card when a sim reel owns the visual", () => {
    const model = buildWhyPanelModel(
      source({ media: { kind: "sign", signRef: "В24" } }), // sim === SIM (non-null)
    );
    expect(model.picture).toBeNull();
    expect(model.replay).not.toBeNull();
  });

  it("no picture for a pure text-knowledge question (no media, no sign options)", () => {
    const model = buildWhyPanelModel(source({ sim: null }));
    expect(model.picture).toBeNull();
  });

  it("ignores the legacy image/video placeholder shape (renders nothing)", () => {
    const model = buildWhyPanelModel(
      source({ sim: null, media: { type: "image", ref: "legacy" } }),
    );
    expect(model.picture).toBeNull();
  });
});

describe("law citations", () => {
  it("dedupes identical act+ref pairs, keeps first-seen order", () => {
    const model = buildWhyPanelModel(
      source({
        lawRefs: [
          { act: "ЗДвП", ref: "чл. 40" },
          { act: "ЗДвП", ref: "чл. 25" },
          { act: "ЗДвП", ref: "чл. 40" },
        ],
      }),
    );
    expect(model.lawRefs).toEqual([
      { act: "ЗДвП", ref: "чл. 40" },
      { act: "ЗДвП", ref: "чл. 25" },
    ]);
  });
});

describe("simulatorDrillHref", () => {
  it("URL-encodes the template id", () => {
    expect(simulatorDrillHref("sc a&b", 3)).toBe("/simulator?scenario=sc%20a%26b&level=3");
  });
});

describe("mistakeExperienceHref", () => {
  it("URL-encodes and targets the mistake param (entry rung — no level)", () => {
    expect(mistakeExperienceHref("sc a&b", 0)).toBe("/simulator?scenario=sc%20a%26b&mistake=0");
  });
});

describe("traceUrlForRepoPath", () => {
  it("strips the leading content/ (the publish mapping)", () => {
    expect(traceUrlForRepoPath("content/traces/sc-x/m.trace.json")).toBe(
      "/traces/sc-x/m.trace.json",
    );
  });

  it("passes through already-public paths unchanged", () => {
    expect(traceUrlForRepoPath("/traces/sc-x/m.trace.json")).toBe(
      "/traces/sc-x/m.trace.json",
    );
    expect(traceUrlForRepoPath("traces/sc-x/m.trace.json")).toBe(
      "/traces/sc-x/m.trace.json",
    );
  });
});
