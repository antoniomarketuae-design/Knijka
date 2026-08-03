import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  disabledFeatures,
  FEATURE_OFFLINE_COPY_BG,
  isFeatureDisabled,
  KILLABLE_FEATURES,
  parseDisabledFeatures,
} from "./features";

/**
 * The kill switch itself. The wiring — that the guards and the server actions
 * actually ask it — is asserted in src/app/(dashboard)/killSwitch.test.ts,
 * because a correct parser nobody calls is the exact shape of the bug this
 * feature exists to prevent.
 */

const ORIGINAL = process.env.DISABLED_FEATURES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DISABLED_FEATURES;
  else process.env.DISABLED_FEATURES = ORIGINAL;
});

describe("parseDisabledFeatures", () => {
  it("leaves everything on when the variable is absent or empty", () => {
    for (const raw of [undefined, null, "", "   ", ",", " , , "]) {
      expect(parseDisabledFeatures(raw)).toEqual({ disabled: [], unknown: [] });
    }
  });

  it("accepts the shapes a tired human actually types", () => {
    // Commas, spaces, both, mixed case, stray padding — every one of these is
    // someone editing /etc/cron.d/knijka at 3am, and refusing any of them
    // means the feature stays on.
    for (const raw of [
      "simulator,tutor",
      "simulator, tutor",
      "simulator tutor",
      " Simulator ,  TUTOR ",
      "simulator,,tutor,",
    ]) {
      expect(parseDisabledFeatures(raw).disabled.sort()).toEqual([
        "simulator",
        "tutor",
      ]);
    }
  });

  it("reports a typo instead of silently leaving the feature running", () => {
    // The failure that makes a kill switch worse than none: the operator
    // believes the simulator is off, the students are still driving, and
    // nothing anywhere says so. `unknown` is what /api/health surfaces.
    const parsed = parseDisabledFeatures("simulater");
    expect(parsed.disabled).toEqual([]);
    expect(parsed.unknown).toEqual(["simulater"]);
  });

  it("de-duplicates rather than counting", () => {
    expect(parseDisabledFeatures("tutor,tutor tutor")).toEqual({
      disabled: ["tutor"],
      unknown: [],
    });
  });
});

describe("isFeatureDisabled", () => {
  it("reads the environment at CALL time, not at import time", () => {
    delete process.env.DISABLED_FEATURES;
    expect(isFeatureDisabled("simulator")).toBe(false);

    process.env.DISABLED_FEATURES = "simulator";
    // A module-level constant would still say false here — and the switch
    // would need a rebuild, which is the thing it exists to avoid.
    expect(isFeatureDisabled("simulator")).toBe(true);

    process.env.DISABLED_FEATURES = "";
    expect(isFeatureDisabled("simulator")).toBe(false);
  });

  it("switches off only what was named", () => {
    process.env.DISABLED_FEATURES = "tutor";
    expect(isFeatureDisabled("tutor")).toBe(true);
    expect(isFeatureDisabled("simulator")).toBe(false);
    expect(isFeatureDisabled("hazard")).toBe(false);
    expect(disabledFeatures().disabled).toEqual(["tutor"]);
  });
});

describe("the offline copy", () => {
  it("covers every killable feature", () => {
    for (const feature of KILLABLE_FEATURES) {
      expect(FEATURE_OFFLINE_COPY_BG[feature].title.length).toBeGreaterThan(0);
      expect(FEATURE_OFFLINE_COPY_BG[feature].body.length).toBeGreaterThan(0);
    }
  });

  it("never sells a pack for something we switched off ourselves", () => {
    // A student who paid €21.99 and is shown „купи пакет" because we turned
    // the simulator off is a refund and a one-star review. The paywall and the
    // offline screen are one `if` apart in every guard, so the copy is what
    // makes the mistake visible in review.
    for (const feature of KILLABLE_FEATURES) {
      const copy = `${FEATURE_OFFLINE_COPY_BG[feature].title} ${FEATURE_OFFLINE_COPY_BG[feature].body}`;
      expect(copy).not.toMatch(/пакет|Планове|€|EUR|цена/i);
    }
  });
});

describe("finding the switch when it is needed", () => {
  it("is documented in .env.example, with every name it accepts", () => {
    // A switch nobody can find is not a switch. The one moment it exists for —
    // the simulator melting phones on launch day — is the worst possible time
    // to be grepping the source for the variable's spelling, and .env.example
    // is where anyone configuring this app looks first. tools/deploy/README.md
    // carries the operator's copy (with the pm2 restart); this is the
    // developer's, and it is asserted so a fourth killable feature added
    // without a line here fails in CI instead of at 3am.
    const example = readFileSync(
      path.join(process.cwd(), ".env.example"),
      "utf8",
    );
    expect(example).toMatch(/^DISABLED_FEATURES=/m);
    for (const feature of KILLABLE_FEATURES) {
      expect(example).toContain(feature);
    }
    // It must ship EMPTY. A committed default that disables something is a
    // feature switched off on every machine that copies this file.
    expect(example).toMatch(/^DISABLED_FEATURES=""$/m);
  });
});
