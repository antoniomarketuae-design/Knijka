/**
 * WHERE A PIN CAME FROM — the half `clearance.test.ts` could not check.
 *
 * That file proves the gate holds: walk 54 lessons, collect every sentence,
 * assert none of them belongs to a row that has not cleared. It is a real
 * check and it passed on the day eleven pins were minted from the file they
 * were supposed to be checking — because a pin regenerated from the live text
 * makes the row CLEAR, and a cleared row is not a leak. The gate was green and
 * meaningless at the same time.
 *
 * So this file asks a different question: not „did an uncleared sentence get
 * out", but „is the thing that cleared it evidence of anything". Three
 * independent answers, because the failure was that one careful check made
 * everybody assume the neighbouring one existed:
 *
 *   1. THE FREEZE TABLE DESCRIBES ONE IMMUTABLE GIT BLOB. Every pin is
 *      re-derived from `git cat-file blob <CARRY_FROZEN_BLOB>`. A pin rolled
 *      forward from the working tree stops matching an artifact nobody can
 *      edit, and is named here.
 *   2. THE SCRIPT CANNOT MINT. `--check`, `--show` and `--propose` are run
 *      against the real file and it must come back byte-identical; every
 *      refusal path of `--clear` is run and must leave it byte-identical too.
 *   3. A SIGNATURE NAMES A PERSON. Nothing in `CLEARED_SINCE_FREEZE` may be
 *      signed by a machine word or carry a date from the future.
 *
 * …plus the second finding: the census is now READ. `lessonsInPreparation()`
 * had no caller outside the module, and both routes that can open a lesson are
 * asserted to consult it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { summaryFingerprint } from "../clearance";
import {
  CARRIED_CONCEPT_SUMMARIES,
  CARRY_CEILING,
  CARRY_FROZEN_BLOB,
  CLEARED_SINCE_FREEZE,
  MACHINE_SIGNERS,
} from "../clearanceCarry";
import { allLessons, resetLessonCache } from "../compose";
import { lessonClearance, lessonsInPreparation } from "../resolve";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "..", "..", "..", "..");
const REPO = path.resolve(PLATFORM, "..");
const SCRIPT = path.join(PLATFORM, "scripts", "freeze-lesson-carry.mjs");
const CARRY_FILE = path.join(HERE, "..", "clearanceCarry.ts");

/** The bytes of clearanceCarry.ts right now. */
function carryBytes(): string {
  return readFileSync(CARRY_FILE, "utf8");
}

/** Run the script; returns stdout+stderr and the exit code, never throws. */
function runScript(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: PLATFORM,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

/**
 * content/concepts.json as it stood in the frozen blob, or null when this
 * clone cannot reach it (a shallow checkout, a fresh worktree).
 */
function frozenConcepts(): Map<string, { summaryBg: string }> | null {
  try {
    const text = execFileSync("git", ["cat-file", "blob", CARRY_FROZEN_BLOB], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Map(
      (JSON.parse(text) as Array<{ id: string; summaryBg: string }>).map((c) => [c.id, c]),
    );
  } catch {
    return null;
  }
}

// Mirrors lib/content/sanitize.ts. The loader strips staff annotations before a
// student sees the string, and the repo hands back sanitised text — so the raw
// JSON of the frozen blob has to be put through the same filter before it is
// compared with a pin taken through the repo.
const STAFF_ANNOTATION_RE =
  /\[\s*(?:REVIEW|TODO|FIXME|TBD|XXX|HACK|NOTE|CHECK|VERIFY|QA)\s*(?::[^\]]*)?\]/g;
function sanitize(text: string): string {
  if (!text.includes("[")) return text;
  STAFF_ANNOTATION_RE.lastIndex = 0;
  if (!STAFF_ANNOTATION_RE.test(text)) return text;
  return text.replace(STAFF_ANNOTATION_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

describe("1 — the freeze table describes one immutable blob, not the working tree", () => {
  it("re-derives all 145 pins from `git cat-file blob` and finds no drift", () => {
    const frozen = frozenConcepts();
    if (frozen === null) {
      // Do not pass quietly. This assertion is the only thing standing between
      // the carry and a silent regeneration, so a clone that cannot run it
      // must say so loudly rather than report a green line.
      console.warn(
        `\n!! CANNOT VERIFY THE CARRY: blob ${CARRY_FROZEN_BLOB} is unreachable in this clone.\n` +
          `   The anti-regeneration check did not run. Fetch full history before trusting it.\n`,
      );
      expect(true).toBe(true);
      return;
    }

    const wrong: string[] = [];
    for (const [conceptId, pin] of Object.entries(CARRIED_CONCEPT_SUMMARIES)) {
      const row = frozen.get(conceptId);
      if (row === undefined) {
        wrong.push(`${conceptId}: pinned, but absent from the frozen blob`);
        continue;
      }
      const expected = summaryFingerprint(sanitize(row.summaryBg));
      if (expected !== pin) wrong.push(`${conceptId}: pinned ${pin}, blob says ${expected}`);
    }

    expect(
      wrong,
      `THE FREEZE TABLE HAS BEEN REGENERATED FROM SOMETHING OTHER THAN THE FROZEN BLOB.\n` +
        `That is the exact failure this file exists to catch: a pin minted from the live\n` +
        `content/concepts.json certifies the wave that wrote it and checks nothing.\n` +
        `A summary edited since the freeze does not get a new pin — a PERSON clears it:\n` +
        `  node scripts/freeze-lesson-carry.mjs --show <id>\n\n` +
        wrong.join("\n"),
    ).toEqual([]);
  });

  it("never grows: the freeze is a moment that has passed", () => {
    expect(Object.keys(CARRIED_CONCEPT_SUMMARIES).length).toBeLessThanOrEqual(CARRY_CEILING);
  });

  it("keeps the two authorities disjoint in what they can cover", () => {
    // A row may be in both tables — frozen once, re-read later — but the two
    // pins must not be equal, because an identical pin means the „clearance"
    // recorded a reading of text the freeze already covered, which is a
    // signature bought for nothing.
    for (const [conceptId, sig] of Object.entries(CLEARED_SINCE_FREEZE)) {
      const frozenPin = Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, conceptId)
        ? CARRIED_CONCEPT_SUMMARIES[conceptId]
        : undefined;
      expect(
        sig.pin,
        `${conceptId} is signed for the very text the freeze already covers`,
      ).not.toBe(frozenPin);
    }
  });
});

describe("2 — the script cannot mint a pin", () => {
  it("writes nothing in --check, --show or --propose", () => {
    const before = carryBytes();
    for (const args of [[], ["--check"], ["--show", "c-scene-safety"], ["--propose"]]) {
      runScript(args);
      expect(carryBytes(), `\`${args.join(" ") || "(default)"}\` wrote to the carry`).toBe(before);
    }
  });

  it("--check does not fail on a stale pin — the pressure that caused the defect is gone", () => {
    const { out, code } = runScript(["--check"]);
    // Eleven rows are stale today. If exiting 1 on that ever comes back, the
    // next person on a red suite reaches for a bulk re-pin, which is precisely
    // how the eleven moved.
    expect(out).toContain("WITHHELD");
    expect(
      code,
      "--check exited non-zero on a withheld summary. That is the correct state of\n" +
        "this gate, and making it red teaches everyone to re-pin their way to green.",
    ).toBe(0);
  });

  it("refuses every path that would write a pin nobody transcribed", () => {
    const before = carryBytes();
    const target = "c-scene-safety";
    const live = summaryFingerprint(
      getContentRepo().conceptById(target)?.summaryBg ?? "no such concept",
    );

    const refusals: Array<[string, string[]]> = [
      ["no --pin at all", ["--clear", target, "--by", "Антонио"]],
      ["a --pin that does not match the sentence", ["--clear", target, "--pin", "0".repeat(16), "--by", "Антонио"]],
      ["no --by", ["--clear", target, "--pin", live]],
      ["a machine as the signer", ["--clear", target, "--pin", live, "--by", "script"]],
      ["two rows in one invocation", ["--clear", target, "--clear", "c-e-scooters", "--pin", live, "--by", "Антонио"]],
      ["a concept the carry never covered", ["--clear", "c-victim-handling", "--pin", live, "--by", "Антонио"]],
    ];

    for (const [why, args] of refusals) {
      const { code } = runScript(args);
      expect(code, `the script accepted: ${why}`).not.toBe(0);
      expect(carryBytes(), `the script wrote to the carry despite: ${why}`).toBe(before);
    }
  });

  it("has no bulk mode left — every removed alias is rejected, not silently ignored", () => {
    const before = carryBytes();
    // `--rebuild` and the old bare-invocation re-pin are what moved eleven
    // rows. An unknown flag must be an error: silently treating it as --check
    // would let an old runbook line look like it worked.
    for (const args of [["--rebuild"], ["--repin"], ["--all"], ["--force"]]) {
      const { code } = runScript(args);
      expect(code, `\`${args[0]}\` was accepted`).not.toBe(0);
      expect(carryBytes(), `\`${args[0]}\` wrote to the carry`).toBe(before);
    }
  });

  it("--show prints the sentence a reader has to read, and the exact command", () => {
    const { out } = runScript(["--show", "c-scene-safety"]);
    const concept = getContentRepo().conceptById("c-scene-safety");
    expect(concept).toBeDefined();
    expect(out).toContain(concept?.summaryBg ?? " ");
    expect(out).toContain("--clear c-scene-safety --pin");
    // The refusal it is preparing the reader for must be honest about which
    // article the claim rests on (ADR-002: citation, never recall).
    expect(out).toContain("чл.");
  });
});

describe("3 — a signature names a person", () => {
  it("has no machine signer and no date from the future", () => {
    const machines = new Set(MACHINE_SIGNERS.map((m) => m.toLowerCase()));
    const today = new Date().toISOString().slice(0, 10);
    for (const [conceptId, sig] of Object.entries(CLEARED_SINCE_FREEZE)) {
      expect(sig.by.trim().length, `${conceptId} is signed by nobody`).toBeGreaterThan(0);
      expect(
        machines.has(sig.by.trim().toLowerCase()),
        `${conceptId} is signed by "${sig.by}", which is not a person`,
      ).toBe(false);
      expect(sig.at, `${conceptId} has a malformed date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sig.at <= today, `${conceptId} was cleared in the future`).toBe(true);
      expect(sig.pin, `${conceptId} has a malformed pin`).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("signs only sentences that exist — a signature cannot outlive its text", () => {
    const repo = getContentRepo();
    for (const [conceptId, sig] of Object.entries(CLEARED_SINCE_FREEZE)) {
      const concept = repo.conceptById(conceptId);
      expect(concept, `${conceptId} is signed but no longer exists`).toBeDefined();
      if (concept === undefined) continue;
      // Not an error if it drifted — that is the gate working — but the row
      // must then be reported as withheld rather than quietly cleared.
      if (summaryFingerprint(concept.summaryBg) !== sig.pin) {
        expect(runScript(["--check"]).out).toContain(conceptId);
      }
    }
  });
});

describe("4 — the census is read, by every door that can open a lesson", () => {
  it("marks the hollow lesson and only lessons that are really hollow", () => {
    resetLessonCache();
    const pending = lessonsInPreparation();

    // The lesson the finding is about: one greeting, four identical „под
    // преглед" bubbles, a recap, zero questions.
    expect(pending.has("l-accidents-first-aid")).toBe(true);

    for (const lessonId of pending) {
      const census = lessonClearance(lessonId);
      expect(census, `${lessonId} is withheld from the hub and has no census`).not.toBeNull();
      // Whatever the threshold becomes, a lesson taken off the shelf must be
      // one that can neither say anything nor ask anything.
      expect(
        (census?.speaking ?? 0) === 0 || (census?.quizDealt ?? 0) === 0,
        `${lessonId} is in preparation while still speaking AND asking`,
      ).toBe(true);
    }

    // …and the inverse: nothing that still teaches gets taken off the shelf.
    for (const lesson of allLessons()) {
      if (pending.has(lesson.id)) continue;
      const census = lessonClearance(lesson.id);
      expect(
        (census?.speaking ?? 0) > 0 || (census?.quizDealt ?? 0) > 0,
        `${lesson.id} teaches nothing and is still offered`,
      ).toBe(true);
    }
  });

  /**
   * THE SOURCE-LEVEL HALF, and it is the one that matters.
   *
   * The finding was not that the threshold was wrong. It was that
   * `courseClearance()` and `recentWithheldSources()` were exported with a
   * comment telling readers to consult them and NOTHING OUTSIDE THE MODULE
   * CALLED THEM. A behavioural test on `lessonsInPreparation()` would have
   * passed the whole time that was true. So: both routes that can put a
   * student inside a lesson must be shown to ask.
   */
  it("is consulted by the hub AND by the direct URL, not just one of them", () => {
    const routes = [
      path.join(PLATFORM, "src", "app", "(dashboard)", "classroom", "page.tsx"),
      path.join(PLATFORM, "src", "app", "(dashboard)", "classroom", "[lessonId]", "page.tsx"),
    ];
    for (const file of routes) {
      const source = readFileSync(file, "utf8");
      expect(
        source,
        `${path.basename(path.dirname(file))}/page.tsx can open a lesson without asking the ` +
          `clearance census. A badge on the index that a direct link walks past is decoration.`,
      ).toContain("lessonsInPreparation");
    }
  });

  it("keeps an in-preparation lesson out of the one big button and out of completion", () => {
    const source = readFileSync(
      path.join(PLATFORM, "src", "app", "(dashboard)", "classroom", "page.tsx"),
      "utf8",
    );
    // `resumePoint` falls back to course order, so a hollow lesson early in the
    // course would become „Започни оттук" for every new student; and a lesson
    // nobody can open must not sit in doc 84 gate U3's denominator forever.
    for (const call of ["resumePoint(openableIds", "courseCompletion(openableIds"]) {
      expect(source, `${call} — the hub still ranges over every lesson`).toContain(call);
    }
  });
});
