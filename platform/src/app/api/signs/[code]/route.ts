/**
 * Sign artwork endpoint (THEO-1): GET /api/signs/<official code, e.g. В24>
 * streams the project's OWN sign svg from /content/signs/svg — the artwork
 * referenced by signs.json, validated to exist at content load. Client
 * components (<SignFace>) render it as a plain <img>, so the same markup
 * serves practice, exams and any future surface with zero duplication.
 *
 * Not auth-gated (sign artwork is not sensitive; the proxy matcher covers
 * only the authed page areas). The path read here comes from the validated,
 * frozen content repo — never from user input — so no traversal surface.
 */
import fs from "node:fs";
import path from "node:path";
import "@/lib/content/loader";
import { resolveContentDir } from "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  // Robust to either raw or percent-encoded Cyrillic in the param.
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    // malformed escape — fall through with the raw value
  }

  const sign = getContentRepo()
    .signs()
    .find((s) => s.code === decoded || s.code === code);
  if (!sign) {
    return new Response("Unknown sign code", { status: 404 });
  }

  let svg: string;
  try {
    svg = await fs.promises.readFile(path.join(resolveContentDir(), sign.svgFile), "utf8");
  } catch {
    // Loader validated existence at boot; a race here is a server problem.
    return new Response("Sign artwork unavailable", { status: 500 });
  }

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
