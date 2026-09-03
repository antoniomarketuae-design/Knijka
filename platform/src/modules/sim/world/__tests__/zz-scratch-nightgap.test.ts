import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict } from "../types";

function load(id: string): unknown {
  const c = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const f of c) if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  throw new Error("missing " + id);
}

describe("scratch", () => {
  it("counts", () => {
    const d = assertDistrict(load("ov-oncoming-v1"));
    const w = buildWorldGeometry(d, { seed: 7 }) as unknown as Record<string, unknown>;
    const out: string[] = [];
    out.push("keys=" + Object.keys(w).join(","));
    for (const k of Object.keys(w)) {
      const v = w[k];
      if (Array.isArray(v)) out.push(k + " len=" + v.length);
    }
    out.push("streetlights=" + JSON.stringify((w.streetlights as unknown[]).slice(0, 4)));
    fs.writeFileSync("E:/AI driver/platform/zz-scratch-out.txt", out.join("\n"));
    expect(true).toBe(true);
  });
});
