/**
 * В23 IN THE SIGN KIT — the post the world places must wear the В23 FACE
 * (sc-mv-uturn-ban:e98407b1).
 *
 * `builders/zoneSigns.ts` places a `uTurnBan` post where mv-uturn-v1 declares
 * its В23, and `world/__tests__/mv-uturn-districts.test.ts` proves the
 * placement. A placement is not a sign. `uTurnBan` has no GLB of its own: it
 * RIDES `sign_speed_limit_50.glb` — the body whose BAKED face is the «50» — and
 * is turned into a В23 only by its row in `WorldProps.tsx SIGN_FACE_OVERRIDE`,
 * which swaps in the bank's own v23.svg at load time. Lose that one row and the
 * world posts a round «50» at the first metre of the U-turn ban, at 1.5× scale,
 * on the lesson named after the sign — doc 86 T4 (a plate that states the wrong
 * thing is worse than no plate) restaged for a different face.
 *
 * `WorldProps.tsx` is a client module (three + R3F at import) and cannot be
 * loaded under vitest's node environment, so the two tables are read from its
 * SOURCE. A source matcher that cannot find what it is looking for must FAIL,
 * not pass: each reader below throws on an unreadable table, and §0 proves the
 * readers can read rows that are known to be there.
 *
 * WHAT IS PINNED:
 *  1. `uTurnBan` maps to a GLB that exists on disk, and that GLB is the В26
 *     body;
 *  2. it has a face override, and the override's art is `v23`;
 *  3. the override is NECESSARY and SUFFICIENT for a truthful plate: the body's
 *     plate ring in v23.svg is byte-identical to v26.svg's (so the swapped face
 *     sits on the plate it was drawn for), and the faces differ (so without the
 *     swap the plate would read «50»);
 *  4. the served art is the bank's art, and the bank calls it В23.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SIGN_KINDS } from "../../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "../../../../../..");
const WORLD_PROPS = path.resolve(HERE, "../WorldProps.tsx");
const SIGN_FACES = path.resolve(HERE, "../signFaces.ts");
const SIGN_DIR = path.join(PLATFORM, "public/sim/signs");
const FACE_DIR = path.join(SIGN_DIR, "faces");
const CONTENT = path.resolve(PLATFORM, "../content");

const source = fs.readFileSync(WORLD_PROPS, "utf8");

/** The body of `const <name>… = { … };` in WorldProps.tsx. Throws if absent. */
function tableBody(name: string): string {
  const open = new RegExp(`const ${name}\\b[^=]*=\\s*\\{`).exec(source);
  if (!open) throw new Error(`WorldProps.tsx: cannot find the ${name} table`);
  const from = open.index + open[0].length;
  const close = source.indexOf("\n};", from);
  if (close < 0) throw new Error(`WorldProps.tsx: ${name} table is unterminated`);
  return source.slice(from, close);
}

/** `kind: "file"` rows of SIGN_GLB. */
function glbFor(kind: string): string | null {
  const m = new RegExp(`^\\s*${kind}:\\s*"([^"]+)"`, "m").exec(tableBody("SIGN_GLB"));
  return m ? m[1]! : null;
}

/** `kind: { art: "x" … }` rows of SIGN_FACE_OVERRIDE. */
function faceArtFor(kind: string): string | null {
  const m = new RegExp(`^\\s*${kind}:\\s*\\{\\s*art:\\s*"([^"]+)"`, "m").exec(
    tableBody("SIGN_FACE_OVERRIDE"),
  );
  return m ? m[1]! : null;
}

const plateOf = (svg: string): string[] => svg.match(/<[^>]*data-plate="true"[^>]*>/g) ?? [];

describe("§0 the readers can read (a matcher that cannot must not pass)", () => {
  it("reads rows that are known to be in both tables", () => {
    expect(glbFor("limit50")).toBe("sign_speed_limit_50");
    expect(glbFor("noParking")).toBe("sign_no_stopping");
    expect(faceArtFor("noParking")).toBe("v28");
    expect(faceArtFor("limit50")).toBeNull(); // the one kind that KEEPS the baked face
  });

  it("every SignKind has a SIGN_GLB row the reader can find", () => {
    const unread = SIGN_KINDS.filter((k) => glbFor(k) === null);
    expect(unread).toEqual([]);
  });
});

describe("the В23 post wears the В23 face", () => {
  it("uTurnBan is a SignKind", () => {
    expect(SIGN_KINDS as readonly string[]).toContain("uTurnBan");
  });

  it("rides a GLB that exists — the В26 body", () => {
    const glb = glbFor("uTurnBan");
    expect(glb).toBe("sign_speed_limit_50");
    expect(fs.existsSync(path.join(SIGN_DIR, `${glb}.glb`))).toBe(true);
  });

  it("has a face override, and it is the v23 art — without it the plate would read «50»", () => {
    // The body's baked face is the «50»: `limit50` is the one kind on this GLB
    // that deliberately keeps it. Any other kind on the body with NO override
    // shows that same «50».
    expect(glbFor("limit50")).toBe(glbFor("uTurnBan"));
    expect(faceArtFor("uTurnBan")).toBe("v23");
  });

  it("signFaces.ts can be asked for v23 (the SignFaceArt union carries it)", () => {
    const union = /export type SignFaceArt =([^;]+);/.exec(fs.readFileSync(SIGN_FACES, "utf8"));
    expect(union, "cannot find the SignFaceArt union").not.toBeNull();
    expect(union![1]).toContain('"v23"');
  });

  it("the swap sits on the plate it was drawn for: v23's plate ring is byte-identical to v26's", () => {
    const v23 = fs.readFileSync(path.join(FACE_DIR, "v23.svg"), "utf8");
    const v26 = fs.readFileSync(path.join(FACE_DIR, "v26.svg"), "utf8");
    expect(plateOf(v23)).toHaveLength(1);
    expect(plateOf(v23)).toEqual(plateOf(v26));
    // …and the faces are NOT the same face: v26 states a number, v23 none.
    expect(/<text\b/.test(v26)).toBe(true);
    expect(/<text\b/.test(v23)).toBe(false);
  });

  it("the served art is the bank's own, and the bank calls it В23 with its ordinance reference", () => {
    const served = fs.readFileSync(path.join(FACE_DIR, "v23.svg"));
    const bank = fs.readFileSync(path.join(CONTENT, "signs/svg/v23.svg"));
    expect(served.equals(bank)).toBe(true);
    const signs = JSON.parse(fs.readFileSync(path.join(CONTENT, "signs/signs.json"), "utf8")) as {
      id: string;
      code: string;
      nameBg: string;
      svgFile: string;
      lawRefs: { act: string; ref: string }[];
    }[];
    const entry = signs.find((x) => x.id === "sign-v23");
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("В23");
    expect(entry!.nameBg).toBe("Забранено е завиването в обратна посока");
    expect(entry!.svgFile).toBe("signs/svg/v23.svg");
    expect(entry!.lawRefs).toEqual([{ act: "Наредба № РД-02-21-1/23.11.2023", ref: "прил. № 3, знак В23" }]);
    expect(bank.toString("utf8")).toContain("В23 — Забранено е завиването в обратна посока");
  });
});
