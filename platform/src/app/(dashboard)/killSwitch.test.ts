/**
 * The DISABLED_FEATURES kill switch, WIRED.
 *
 * src/lib/features.test.ts proves the parser. This file proves the part that
 * actually protects students on launch day: that flipping the variable takes
 * the feature away at the SERVER ACTION, not only on the page.
 *
 * "A page guard alone leaves the POST endpoints live" is not theoretical here.
 * Every one of these three features routes both its page and its actions
 * through one access function (the C-3 pattern), so the assertions below are
 * on those functions — they are the thing both call sites share, and a fourth
 * call site added tomorrow inherits the switch by construction.
 *
 * Every case uses an ADMIN user, or a free door, i.e. an input that needs no
 * database and would return "allowed" on its own. That is deliberate: it makes
 * each assertion about the switch and nothing else, and it pins the ordering
 * decision — the switch runs BEFORE the admin bypass, because a feature that
 * is melting phones is melting the founder's phone too.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/modules/auth";
import { canDriveSimulator } from "./simulator/access";
import { canOpenHazardDoor } from "./hazard/access";
import { getTutorAccess } from "./tutor/trial";

const ADMIN: SessionUser = {
  id: "u-admin",
  email: "founder@example.com",
  name: "Founder",
  isAdmin: true,
};

const ORIGINAL = process.env.DISABLED_FEATURES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DISABLED_FEATURES;
  else process.env.DISABLED_FEATURES = ORIGINAL;
});

describe("simulator", () => {
  it("drives when nothing is switched off", async () => {
    delete process.env.DISABLED_FEATURES;
    expect(await canDriveSimulator(ADMIN)).toBe(true);
  });

  it("refuses at the gate every call site shares — page AND actions", async () => {
    process.env.DISABLED_FEATURES = "simulator";
    // finishLessonAction, micro-quiz-actions and calibration-actions all call
    // this. Without the switch here they stay live behind a dark page.
    expect(await canDriveSimulator(ADMIN)).toBe(false);
  });

  it("is unaffected by an unrelated feature being off", async () => {
    process.env.DISABLED_FEATURES = "tutor";
    expect(await canDriveSimulator(ADMIN)).toBe(true);
  });
});

describe("hazard", () => {
  it("opens the free doors when nothing is switched off", async () => {
    delete process.env.DISABLED_FEATURES;
    expect(await canOpenHazardDoor(ADMIN, "simulator")).toBe(true);
  });

  it("closes even the FREE doors when switched off", async () => {
    // hazardDoorRequiresPack("simulator") is false, so this door returns true
    // before any entitlement is read. A switch placed after that early return
    // would leave the interstitial running inside every lesson.
    process.env.DISABLED_FEATURES = "hazard";
    expect(await canOpenHazardDoor(ADMIN, "simulator")).toBe(false);
    expect(await canOpenHazardDoor(ADMIN, "section")).toBe(false);
  });
});

describe("tutor", () => {
  it("is unlimited for an admin when nothing is switched off", async () => {
    delete process.env.DISABLED_FEATURES;
    const access = await getTutorAccess(ADMIN, []);
    expect(access.allowed).toBe(true);
  });

  it("refuses before any model spend when switched off", async () => {
    // askTutorAction checks `allowed` before calling askTutor(), so this is
    // what stops an already-open tab from spending tokens after the switch.
    process.env.DISABLED_FEATURES = "tutor";
    const access = await getTutorAccess(ADMIN, []);
    expect(access.allowed).toBe(false);
    expect(access.remaining).toBe(0);
    expect(access.unlimited).toBe(false);
  });
});
