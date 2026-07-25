/**
 * GET /api/signs/<code> — the only unauthenticated route that reads a file
 * from a path derived from a URL parameter (audit 2026-07-24, H-13).
 *
 * The traversal defence is indirect and therefore worth pinning: the param is
 * never used to build a path. It is looked up in the frozen content repo, and
 * only the repo's OWN `svgFile` is read. A code that does not resolve to a
 * sign is a 404 and touches nothing — so "../../.env" is simply an unknown
 * sign, not a path.
 */

import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { GET } from "./route";

function get(code: string) {
  return GET(new Request(`http://localhost/api/signs/${code}`), {
    params: Promise.resolve({ code }),
  });
}

/** A real sign from the content bank — the route is tested against the same
 *  data the app serves, never a fixture. */
const sample = getContentRepo().signs()[0];

describe("GET /api/signs/[code]", () => {
  it("streams the project's own SVG for a known code", async () => {
    const res = await get(sample.code);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(await res.text()).toContain("<svg");
  });

  it("accepts the percent-encoded Cyrillic a browser actually sends", async () => {
    const res = await get(encodeURIComponent(sample.code));
    expect(res.status).toBe(200);
  });

  it("is cacheable — sign artwork is static and public", async () => {
    expect((await get(sample.code)).headers.get("Cache-Control")).toContain("max-age");
  });

  it("404s on an unknown code instead of reading anything", async () => {
    expect((await get("НЯМА-ТАКЪВ")).status).toBe(404);
  });

  it("TRAVERSAL: a path-shaped code is just an unknown sign", async () => {
    for (const code of ["../../.env", "..%2F..%2F.env", "/etc/passwd", "%2e%2e%2f%2e%2e%2f.env"]) {
      const res = await get(code);
      expect(res.status, code).toBe(404);
      expect(await res.text(), code).toBe("Unknown sign code");
    }
  });

  it("survives a malformed percent-escape without throwing", async () => {
    expect((await get("%E0%A4%A")).status).toBe(404);
  });
});
