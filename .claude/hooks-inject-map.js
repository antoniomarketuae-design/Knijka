// Continuity hook: inject the Product Map into context so the FULL product
// vision is present every session AND after every compaction — the fix for
// "task-memory tracked the reels but forgot Theory Half A" (2026-07-21).
// Usage (from settings.local.json hooks): node <thisfile> <SessionStart|PostCompact>
const fs = require("fs");
const path = require("path");
const event = process.argv[2] || "SessionStart";
try {
  const mapPath = path.join(__dirname, "..", "docs", "00_PRODUCT_MAP.md");
  const map = fs.readFileSync(mapPath, "utf8");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext:
          "=== PRODUCT MAP (auto-injected — the full product vision) ===\n" +
          "Before diving into any task, scan this. If a real component isn't listed, ADD it. " +
          "Do NOT lose sight of anything here (especially Theory Half A = ~500 sign/picture why-wrongs, and Half B = the 45 driving reels). " +
          "Update a component's status here whenever you touch it.\n\n" +
          map,
      },
    }),
  );
} catch (e) {
  // Map not found (e.g. a different machine / different checkout) — inject nothing, never error.
}
