/**
 * The clip-capture sink /api/dev/clips (audit 2026-07-24, H-13).
 *
 * This handler writes binaries into public/ and rewrites the committed clip
 * manifest, and its ONLY protection is the `NODE_ENV === "production"` 404 —
 * there is no session check, by design (the rig is a founder tool that never
 * ships). That makes the 404 load-bearing on its own, so it gets a test that
 * proves it fires before any parsing, and the R0/R1 machine gates get tests
 * that prove an uncertifiable artifact cannot enter the manifest.
 *
 * Nothing here touches the filesystem: every case is rejected before the
 * writes, which is exactly the property being asserted.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

/** A multipart body with only the fields a case needs. */
function form(fields: Record<string, string | Blob>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/dev/clips", { method: "POST", body: fd });
}

afterEach(() => vi.unstubAllEnvs());

describe("production is a hard 404 — the rig is unreachable in the shipped app", () => {
  it("GET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET()).status).toBe(404);
  });

  it("POST — before the body is even parsed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // A body that would otherwise blow up in formData(): the 404 must come
    // first, so a malformed production request cannot reach the parser.
    const res = await POST(
      new Request("http://localhost/api/dev/clips", { method: "POST", body: "not multipart" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("the id is the traversal guard (it names files on disk)", () => {
  it("rejects an id that is not <templateId>__m<index>", async () => {
    for (const id of ["../../etc/passwd", "sc-x/m0", "sc-x__m", ""]) {
      const res = await POST(form({ id, templateId: "sc-x", mistakeIndex: "0" }));
      expect(res.status, id).toBe(400);
      expect((await res.json()).error, id).toBe("bad_id");
    }
  });

  it("rejects an id that disagrees with templateId/mistakeIndex", async () => {
    const res = await POST(
      form({ id: "sc-other__m0", templateId: "sc-follow-distance", mistakeIndex: "0" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_id");
  });
});

describe("R0/R1 machine gates — an uncertifiable artifact never enters the manifest", () => {
  const base = {
    id: "sc-follow-distance__m0",
    templateId: "sc-follow-distance",
    mistakeIndex: "0",
    tracePath: "content/traces/sc-follow-distance/mistake-tailgate.trace.json",
    titleBg: "Твърде близо",
    durationSec: "8",
  };

  it("rejects a trace path outside content/traces/", async () => {
    const res = await POST(
      form({ ...base, tracePath: "../secrets/x.trace.json", file: new Blob(["v"]) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_fields");
  });

  it("rejects an empty or missing clip file", async () => {
    expect((await POST(form({ ...base }))).status).toBe(400);
    const res = await POST(form({ ...base, file: new Blob([]) }));
    expect((await res.json()).error).toBe("bad_file");
  });

  it("rejects a clip with no plan card — no card, no clip (R0)", async () => {
    const res = await POST(
      form({
        ...base,
        id: "sc-follow-distance__m7",
        mistakeIndex: "7",
        file: new Blob(["video"]),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_plan");
  });

  it("422s when a required actor did not stage — R1 cannot be certified", async () => {
    // sc-follow-distance__m0's card requires the lead vehicle; the checklist
    // says it never appeared, so the clip is FALSE by R1.
    const res = await POST(
      form({
        ...base,
        file: new Blob(["video"]),
        actors: JSON.stringify([{ kind: "vehicle", label: "Колата отпред", present: false }]),
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("r1_actor_missing");
  });

  it("rejects a malformed actor checklist rather than ignoring it", async () => {
    const res = await POST(
      form({ ...base, file: new Blob(["video"]), actors: '[{"kind":1}]' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_actors");
  });
});
