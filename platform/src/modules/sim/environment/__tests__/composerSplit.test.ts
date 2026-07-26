/**
 * The composer code-split (doc 82 §2.3 fix 3) is a BUNDLING property, so this
 * is a source-level test — the only kind that can fail deterministically in
 * Node without standing up a bundler.
 *
 * What it defends: `postprocessing` + `@react-three/postprocessing` are
 * 330,491 B of minified JS. SimEnvironment is statically imported by
 * LessonScene, so any static import of those packages from SimEnvironment puts
 * that parse cost (≈400–660 ms of mid-range Android CPU, §2.1) on the critical
 * path to the first frame at tier `low`, where the composer never mounts. The
 * regression is invisible — the app still works, it is just slow to boot on
 * exactly the device the product is aimed at — which is why it needs a test
 * and not a comment.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ENV_DIR = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(ENV_DIR, file), "utf8");

/** Static `import … from "pkg"` lines only — dynamic import() is the point. */
function staticImportSources(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

const POSTPROCESSING_PACKAGES = ["postprocessing", "@react-three/postprocessing"];

describe("SimEnvironment", () => {
  const source = read("SimEnvironment.tsx");

  it("never statically imports the postprocessing packages", () => {
    const imports = staticImportSources(source);
    for (const pkg of POSTPROCESSING_PACKAGES) {
      expect(imports).not.toContain(pkg);
    }
  });

  it("reaches the composer through next/dynamic", () => {
    expect(staticImportSources(source)).toContain("next/dynamic");
    expect(source).toContain('import("./SimComposer")');
  });

  it("keeps the tier gate: the composer only mounts when the preset asks", () => {
    // If this ever became an unconditional mount, `low` would pay for the
    // chunk fetch AND the parse it was split out to avoid.
    expect(source).toContain("qp.postprocessing && (");
  });
});

describe("SimComposer", () => {
  const source = read("SimComposer.tsx");

  it("owns the postprocessing imports (they have to live somewhere)", () => {
    const imports = staticImportSources(source);
    for (const pkg of POSTPROCESSING_PACKAGES) {
      expect(imports).toContain(pkg);
    }
  });

  it("keeps the per-level remount semantics the composer relies on", () => {
    // doc 82 §2.3 names this explicitly: a quality switch must rebuild the
    // pass chain, and the chain is keyed by level to do it.
    expect(source).toContain("key={`fx-${level}`}");
  });

  it("keeps the load-bearing effect order (grade AFTER the tone map)", () => {
    // doc 62 #4/#24: HueSaturation before AgX drives saturated channels
    // negative → NaN → black pixels. The order is a correctness fix, not taste,
    // and moving the chain into a new file is exactly when it could be lost.
    const at = (needle: string) => source.indexOf(needle);
    expect(at('key="ao"')).toBeLessThan(at('key="bloom"'));
    expect(at('key="bloom"')).toBeLessThan(at('key="smaa"'));
    expect(at('key="smaa"')).toBeLessThan(at('key="tonemap"'));
    expect(at('key="tonemap"')).toBeLessThan(at('key="grade"'));
    expect(at('key="grade"')).toBeLessThan(at('key="contrast"'));
    expect(at('key="contrast"')).toBeLessThan(at('key="vignette"'));
  });
});

describe("toneMapping", () => {
  it("is the single switch both chunks read", () => {
    // The renderer fallback and the composer effect must never disagree; they
    // now live in different chunks, so the constant lives in a third module
    // that costs nothing to import from either.
    const shared = read("toneMapping.ts");
    expect(shared).toContain('const SIM_TONE_MAPPING = "agx"');
    expect(staticImportSources(read("SimEnvironment.tsx"))).toContain("./toneMapping");
    expect(staticImportSources(read("SimComposer.tsx"))).toContain("./toneMapping");
  });
});
