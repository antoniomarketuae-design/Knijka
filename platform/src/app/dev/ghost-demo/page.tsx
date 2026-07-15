import { notFound } from "next/navigation";
import { GhostDemoClient } from "./ghost-demo-client";

/**
 * S0-View dev harness (doc 76 §10 P0 proof-of-form) — DEV BUILDS ONLY.
 *
 * Mounts полигон free drive with the `?ghost=demo` Shadow Car demo without
 * the authed /simulator shell, so the ghost + timeline + top-down mode can
 * be eyeballed in one click. The founder-facing path stays the real one:
 * /simulator → „Полигон — свободно каране" with ?ghost=demo on the URL.
 * In production this route 404s (no new public surface, GDPR-neutral).
 */
export default function GhostDemoDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GhostDemoClient />;
}
