// Shared Playwright entrypoint. Points the browser registry at E: (the dev
// box's C: drive is chronically near-full — doc: dev-machine-health), then
// loads Playwright so its Chromium resolves from E:\ms-playwright. Import this
// instead of "playwright" directly. PLAYWRIGHT_BROWSERS_PATH set in the shell
// wins (`||=`), so a machine with browsers elsewhere still works.
import { mkdirSync } from "node:fs";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= "E:\\ms-playwright";
// The dev box's C: is chronically near-full (doc: dev-machine-health). Chromium
// drops a temp user-data profile in the OS temp dir (C:) by default — point it
// at E: so an offline render never eats the last of C:.
try {
  mkdirSync("E:\\tmp", { recursive: true });
  process.env.TEMP = "E:\\tmp";
  process.env.TMP = "E:\\tmp";
} catch {}
export const { chromium } = await import("playwright");
