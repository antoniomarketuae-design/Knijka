// Continuity hook: fires right BEFORE compaction — the moment state gets lost.
// Reminds Claude to persist everything durably before the context window is summarized.
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreCompact",
      additionalContext:
        "⚠️ COMPACTION IMMINENT — persist state NOW, before context is summarized away:\n" +
        "1) Update docs/00_PRODUCT_MAP.md statuses for anything that changed this session.\n" +
        "2) Update the auto-memory files for the active thread.\n" +
        "3) Write a dated recap to E:/ai-driver-recaps/<YYYY-MM-DD>.md — what we did, decisions made, open threads, and the exact next steps — so the next context starts from the full picture, not a lossy summary.",
    },
  }),
);
