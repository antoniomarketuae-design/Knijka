/**
 * THE GATE THAT MAKES THE DEFAULT HONEST — every law-implied no-stopping span
 * must SAY which rule bans it, and the map must reach the tick saying so.
 *
 * `SimTick.noStopBasis` defaults to absent, and absent resolves to the pooled
 * В27 card. That default is the conservative one — six shipped districts really
 * do post a plate (d2-v1, hz-accident-v1, pe-clear-v1, pe-slow-v1, pk-ban-v1,
 * pk-ban2-v1), so defaulting the other way would print the same miscitation
 * inverted, on more maps than it fixes.
 *
 * BUT A SAFE DEFAULT IS ONLY SAFE WHILE EVERY LAW SPAN DECLARES ITSELF. A
 * future чл. 98 map authored without `basis` would silently charge a
 * seventeen-year-old under the law for obeying a В27 plate that is not there —
 * the exact defect this slice repaired, shipped again in silence. So the
 * default is paired with this gate, and the gate is the load-bearing half:
 * it turns a silent miscitation into a red build.
 *
 * `signRef` IS READ HERE AND NOWHERE ELSE, deliberately. It is documented
 * free-text provenance (`runtime/district.ts`: "the runtime grades off `kind`
 * alone"), so a legal citation must never rest on it — but it is a perfectly
 * good HEURISTIC for a build gate, where being wrong costs a failing test
 * rather than a wrong article on a student's card.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NO_STOP_BASIS_COPY } from "../../rules";
import type { NoStopBasis } from "../../rules";

function worldDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const d of candidates) if (fs.existsSync(d)) return d;
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
}

interface Zone {
  id: string;
  kind: string;
  signRef?: string;
  basis?: string;
}

function noStopSpans(): { district: string; zone: Zone }[] {
  const dir = worldDir();
  const out: { district: string; zone: Zone }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let doc: { zones?: Zone[] };
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { zones?: Zone[] };
    } catch {
      continue;
    }
    for (const z of doc.zones ?? []) {
      if (z.kind === "noStopping") out.push({ district: file.replace(/\.json$/, ""), zone: z });
    }
  }
  return out;
}

/**
 * THE ONE DOCUMENTED EXCEPTION, and it is named here rather than skipped so it
 * cannot quietly become two.
 *
 * pk-busstop-v1 authors two `noStopping` (ПРЕСТОЙ) spans citing «ЗДвП чл. 98,
 * ал. 1». Against the retrieved text, ал. 1 is a closed list of eight places
 * and NONE of them is a bus stop; the only spirka clause in the act is ал. 2,
 * т. 3, and ал. 2 opens «Освен в посочените в ал. 1 случаи ПАРКИРАНЕТО е
 * забранено» — it bans parking, not престой. So as authored the map may be
 * convicting a legal престой, and there is no чл. 98 клауза to re-cite it to.
 *
 * What really bans престой at a spirka is the ЗИГЗАГ МАРКИРОВКА, binding
 * through чл. 6, т. 1 — but this district ships `markings: null`, so nothing is
 * painted for the student to have read, and citing an invisible marking is the
 * same defect one layer over. That is a CONTENT-TRUTH RULING for the founder
 * (re-cite to the marking and paint it, or re-author the spans as `noParking`,
 * which convicts nothing today), not an engineering choice — so the map keeps
 * the pooled row until it is made, and this list is the reminder.
 */
const AWAITING_FOUNDER_RULING = new Set(["pkbs-z-stop-marking", "pkbs-z-stop-pocket"]);

describe("every law-implied no-stopping span declares WHICH rule bans it", () => {
  it("the walk found the corpus — an empty scan would pass everything", () => {
    const spans = noStopSpans();
    expect(spans.length).toBeGreaterThanOrEqual(11);
    expect(spans.map((s) => s.district)).toContain("pk-double-v1");
    expect(spans.map((s) => s.district)).toContain("lot-zebra-v1");
  });

  it("a span whose signRef is not a В-plate carries an explicit basis", () => {
    const undeclared = noStopSpans()
      .filter(({ zone }) => !(zone.signRef ?? "").startsWith("В"))
      .filter(({ zone }) => zone.basis === undefined)
      .filter(({ zone }) => !AWAITING_FOUNDER_RULING.has(zone.id))
      .map(({ district, zone }) => `${district}/${zone.id} (signRef "${zone.signRef}")`);
    expect(
      undeclared,
      `law-implied spans that would print the В27 card: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("every declared basis is one the catalogue can actually resolve", () => {
    const unknown = noStopSpans()
      .filter(({ zone }) => zone.basis !== undefined)
      .filter(({ zone }) => !(zone.basis! in NO_STOP_BASIS_COPY))
      .map(({ district, zone }) => `${district}/${zone.id}: "${zone.basis}"`);
    expect(unknown).toEqual([]);
  });

  it("the four law districts declare the точка their geometry is built from", () => {
    const byZone = new Map(noStopSpans().map(({ zone }) => [zone.id, zone.basis]));
    // чл. 98, ал. 1, т. 2 — до престояващо или паркирано ППС.
    expect(byZone.get("pkd-z-second-line")).toBe("law-alongside");
    // т. 6 — на кръстовище и на по-малко от 5 метра от тях.
    expect(byZone.get("pkx-z-jx-before")).toBe("law-junction");
    expect(byZone.get("pkx-z-jx-after")).toBe("law-junction");
    // т. 5 — на пешеходни пътеки и на разстояние, по-малко от 5 метра преди тях.
    expect(byZone.get("pkx-z-zebra")).toBe("law-crossing");
    expect(byZone.get("lotzb-z-zebra")).toBe("law-crossing");
    // т. 4 — върху/в такава близост до релсите.
    expect(byZone.get("pkr-z-ban-before")).toBe("law-rail");
    expect(byZone.get("pkr-z-ban-after")).toBe("law-rail");
  });

  it("the В27-plate districts declare NOTHING, so their card is byte-identical", () => {
    // THE OTHER DIRECTION, and it is the one a careless repair breaks: swapping
    // every ban zone onto чл. 98 would be the same miscitation mirrored.
    const plated = noStopSpans().filter(({ zone }) => (zone.signRef ?? "").startsWith("В"));
    expect(plated.length).toBeGreaterThanOrEqual(6);
    for (const { district, zone } of plated) {
      expect(zone.basis, `${district}/${zone.id} must keep the pooled В27 row`).toBeUndefined();
    }
    expect(new Set(plated.map((p) => p.district))).toEqual(
      new Set([
        "d2-v1",
        "hz-accident-v1",
        "pe-clear-v1",
        "pe-slow-v1",
        "pk-ban-v1",
        "pk-ban2-v1",
      ]),
    );
  });

  it("the founder-ruling exception is still exactly one district", () => {
    // If pk-busstop is ever re-authored, this fails and the list gets cleaned
    // up rather than quietly growing a second permanent exemption.
    const stillUndeclared = noStopSpans()
      .filter(({ zone }) => AWAITING_FOUNDER_RULING.has(zone.id))
      .filter(({ zone }) => zone.basis === undefined);
    expect(stillUndeclared.map(({ district }) => district)).toEqual([
      "pk-busstop-v1",
      "pk-busstop-v1",
    ]);
  });

  it("the catalogue's law rows cite чл. 98, ал. 1 and the sign row does not", () => {
    for (const basis of Object.keys(NO_STOP_BASIS_COPY) as NoStopBasis[]) {
      const ref = NO_STOP_BASIS_COPY[basis].lawRef;
      if (basis === "sign") expect(ref).toContain("чл. 6, т. 1");
      else expect(ref).toMatch(/^ЗДвП чл\. 98, ал\. 1, т\. \d$/);
    }
  });
});
