/**
 * ONE ACT, ONE NAME — ON THE THIRD SURFACE TOO (w10-4,
 * `sc-merge-accel-lane:93685d58`, 2026-08-25).
 *
 * `.audit-frames/w10-4/frames/sc-merge-accel-lane__mobile-wrong/
 * 08-debrief-p6.png`: six cards reading «Движение в обратна посока по
 * ЕДНОПОСОЧНА УЛИЦА» on a drive whose district (`mw-entry-v1`) contains no
 * street and no В2. The repair gives WRONG_WAY a per-road row in
 * `rules/catalog.ts WRONG_WAY_ROAD_COPY`, carried as the event's `detail` so
 * `lessons/wire.ts` can hand the server the same discriminator the client used.
 *
 * THIS FILE IS THE THIRD SURFACE. «Грешки» reads the client's own events;
 * «Разбор» reads the server's rebuild; „История на сесиите" reads the STORED
 * events off the row, and it was keying its groups on the code alone — so a
 * repair that made the first two agree would have left the list still filing
 * the drive under the street's name. `debrief.ts groupMistakes` already keys on
 * (code, act), and it says why in its own words: the 2026-08-18 sheet that
 * printed «Удар в друго превозно средство ×2» for a drive that struck a car and
 * then a person, with «пешеходец» nowhere in it.
 *
 * The negative half matters as much: a `detail` that names no authored act —
 * a speeding row's «v57/l50» measurement — must NOT split one continuing
 * offence into five rows, and a forged one must land on the pooled row.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS, WRONG_WAY_ROAD_COPY, WRONG_WAY_ROAD_MOTORWAY } from "@/modules/sim/rules";
import { historyMistakeGroups } from "./historyMistakes";

/** A stored wire event, exactly the shape `serializeRuleEvents` writes. */
const ev = (code: string, t: number, detail?: string) => ({
  kind: "violation",
  code,
  t,
  ...(detail !== undefined ? { detail } : {}),
});

describe("the session history groups a stored drive by act, not only by code", () => {
  it("a motorway wrong-way drive is filed under the motorway's name", () => {
    const rows = historyMistakeGroups([
      ev("WRONG_WAY", 12, WRONG_WAY_ROAD_MOTORWAY),
      ev("WRONG_WAY", 17, WRONG_WAY_ROAD_MOTORWAY),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.titleBg).toBe(WRONG_WAY_ROAD_COPY[WRONG_WAY_ROAD_MOTORWAY]!.titleBg);
    expect(rows[0]!.titleBg).toContain("автомагистрала");
    expect(rows[0]!.titleBg).not.toContain("еднопосочна улица");
    // The two bills still collapse into ONE row with a count — the act is the
    // key, not the timestamp.
    expect(rows[0]!.count).toBe(2);
  });

  it("a street wrong-way drive keeps the shipped catalogue row", () => {
    const rows = historyMistakeGroups([ev("WRONG_WAY", 9)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(rows[0]!.lawRef).toBe(VIOLATIONS.WRONG_WAY.lawRef);
    expect(rows[0]!.correctiveBg).toBe(VIOLATIONS.WRONG_WAY.correctiveBg);
  });

  it("two roads in one payload are two rows, never one name over both", () => {
    // The «Удар в друго превозно средство ×2» shape, in this list's terms.
    const rows = historyMistakeGroups([
      ev("WRONG_WAY", 4),
      ev("WRONG_WAY", 12, WRONG_WAY_ROAD_MOTORWAY),
    ]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.titleBg)).size).toBe(2);
  });

  it("a detail that names no authored act does NOT split the row", () => {
    // Speeding carries its measurement in `detail` (`consequences.ts`
    // encodeSpeedMeasurement, «v57/l50»). Keying on the raw string would print
    // one continuing offence five times; `actCopy` answering null is what stops
    // it, and that is the same answer `debrief.ts groupMistakes` relies on.
    const rows = historyMistakeGroups([
      ev("SPEEDING_OVER_LIMIT", 3, "v57/l50"),
      ev("SPEEDING_OVER_LIMIT", 5, "v59/l50"),
      ev("SPEEDING_OVER_LIMIT", 7, "v61/l50"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
    expect(rows[0]!.titleBg).toBe(VIOLATIONS.SPEEDING_OVER_LIMIT.titleBg);
  });

  it("a forged or unknown detail lands on the pooled row, never on silence", () => {
    const rows = historyMistakeGroups([ev("WRONG_WAY", 6, "не-съществуващ-път")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(rows[0]!.points).toBe(VIOLATIONS.WRONG_WAY.points);
    expect(rows[0]!.severityClass).toBe(VIOLATIONS.WRONG_WAY.severityClass);
  });

  it("the defensive parse still holds: junk, unknown codes and nulls are skipped", () => {
    expect(historyMistakeGroups(null)).toEqual([]);
    expect(historyMistakeGroups(undefined)).toEqual([]);
    expect(
      historyMistakeGroups([
        null,
        "не е обект",
        { kind: "commendation", code: "YIELDED_TO_PRIORITY", t: 1 },
        { kind: "violation", code: "НЯМА_ТАКЪВ_КОД", t: 2 },
        { kind: "violation", code: 17, t: 3 },
      ]),
    ).toEqual([]);
  });

  it("gravest first — the sort the list prints in", () => {
    const rows = historyMistakeGroups([
      ev("SPEEDING_OVER_LIMIT", 3, "v57/l50"),
      ev("WRONG_WAY", 12, WRONG_WAY_ROAD_MOTORWAY),
    ]);
    expect(rows.map((r) => r.severityClass)).toEqual(["opasna", "vtorostepenna"]);
  });
});
