// Continuity hook (SessionEnd): the AUTOMATIC guarantee — copies the full raw
// session transcript into the recaps folder every time a session ends. No LLM,
// no dependence on Claude remembering. Even if the curated recap never gets
// written, the complete record is always here. Plus a reminder to curate it.
const fs = require("fs");
const path = require("path");

let stdin = "";
try {
  stdin = fs.readFileSync(0, "utf8");
} catch (e) {}
let data = {};
try {
  data = JSON.parse(stdin);
} catch (e) {}

let snapshotted = null;
try {
  const tp = data.transcript_path;
  if (tp && fs.existsSync(tp)) {
    const rawDir = "E:/ai-driver-recaps/raw";
    fs.mkdirSync(rawDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const sid = String(data.session_id || "session").slice(0, 8);
    const dest = path.join(rawDir, `${day}-${sid}.jsonl`);
    fs.copyFileSync(tp, dest);
    snapshotted = dest;
  }
} catch (e) {}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionEnd",
      additionalContext:
        "SESSION ENDED. Raw transcript auto-snapshot: " +
        (snapshotted ? snapshotted : "(no transcript_path in stdin — snapshot skipped)") +
        ". A curated recap (E:/ai-driver-recaps/<date>.md) + a Product Map status update should be written from it — the raw file above is the lossless backstop if not.",
    },
  }),
);
