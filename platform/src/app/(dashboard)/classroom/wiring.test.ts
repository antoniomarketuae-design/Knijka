/**
 * THE CLASSROOM'S TWO WIRING GAPS, NAILED SHUT.
 *
 * 1. NOTHING RECORDED THAT A LESSON WAS WATCHED. A student who closed the tab
 *    restarted at beat 1 of 54 lessons; „урок 21 от 54" could never become
 *    „продължи оттам"; and doc 84's gate U3 — completion per lesson — had
 *    nothing to count, which is what left phases 3 and 4 with no evidence to be
 *    judged on. The row and its rules are unit-tested in
 *    `modules/lesson/__tests__/progress.test.ts`; what is tested HERE is that
 *    the surface actually calls them, because a store nobody writes to is
 *    indistinguishable from a student who never studied.
 *
 * 2. TWO FRONT DOORS TO ONE ENGINE. `/lesson` and `/classroom` shipped on the
 *    same day over the same `@/modules/lesson`, and NEITHER was reachable —
 *    the classroom was in no nav and no ROUTE_STATUS, and `/lesson` was linked
 *    from nowhere at all. Two entries to one feature is two places for every
 *    later fix to have to land.
 *
 * The wiring assertions read the source rather than rendering it: this repo's
 * vitest environment is `node` with no DOM (vitest.config.ts says so in as many
 * words), and the same technique already guards the tick-box call sites in
 * `components/ui/checkControl.test.ts`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/modules/auth";

const requireUser = vi.fn<() => Promise<SessionUser>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));
vi.mock("@/modules/gamification", () => ({ trackActivity: vi.fn() }));

const { saveLessonPosition } = await import("../lesson/actions");
const { allLessons, InMemoryLessonProgressStore, setLessonProgressStore } = await import(
  "@/modules/lesson"
);

const SRC = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

const LESSON = allLessons()[0];

let store: InstanceType<typeof InMemoryLessonProgressStore>;

beforeEach(() => {
  vi.clearAllMocks();
  store = new InMemoryLessonProgressStore();
  setLessonProgressStore(store);
  requireUser.mockResolvedValue({
    id: "student-1",
    email: "s@example.com",
    name: "Стоян",
    isAdmin: false,
  } as SessionUser);
});

afterEach(() => setLessonProgressStore(null));

// ---------------------------------------------------------------------------

describe("saveLessonPosition", () => {
  it("writes the bookmark for the SESSION user, never for a wire-supplied id", async () => {
    await saveLessonPosition(LESSON.id, 2, false);
    const row = await store.getOne("student-1", LESSON.id);
    expect(row?.beatIndex).toBe(2);
    expect(row?.completedAt).toBeNull();
    expect(requireUser).toHaveBeenCalled();
  });

  it("marks the lesson complete — the only input doc 84 gate U3 has", async () => {
    await saveLessonPosition(LESSON.id, 99, true);
    const row = await store.getOne("student-1", LESSON.id);
    expect(row?.completedAt).not.toBeNull();
  });

  it("re-bounds the index against the LESSON, not against the payload", async () => {
    // A server action is a public POST endpoint. An out-of-range cursor would
    // open the room on nothing.
    const last = LESSON.beats.length - 1;
    await saveLessonPosition(LESSON.id, 10_000, false);
    expect((await store.getOne("student-1", LESSON.id))?.beatIndex).toBe(last);
    await saveLessonPosition(LESSON.id, -5, false);
    expect((await store.getOne("student-1", LESSON.id))?.beatIndex).toBe(0);
    await saveLessonPosition(LESSON.id, Number.NaN, false);
    expect((await store.getOne("student-1", LESSON.id))?.beatIndex).toBe(0);
  });

  it("refuses a lesson that does not exist rather than creating a row for it", async () => {
    await expect(saveLessonPosition("l-not-a-lesson", 0, false)).rejects.toThrow();
    await expect(saveLessonPosition("", 0, false)).rejects.toThrow();
    expect(store.rows.size).toBe(0);
  });
});

describe("the room writes the bookmark and opens on it", () => {
  const room = read("app/(dashboard)/classroom/ClassroomRoom.tsx");
  const page = read("app/(dashboard)/classroom/[lessonId]/page.tsx");
  const scene = read("components/classroom/ClassroomScene.tsx");

  it("hands the scene BOTH progress handlers — a written beat and a finished lesson", () => {
    expect(room).toContain("saveLessonPosition");
    expect(room).toMatch(/onBeatComplete/);
    expect(room).toMatch(/onLessonComplete/);
    // Both must reach the scene: `handlers` is the only channel it reads.
    expect(room).toMatch(/handlers\s*=\s*useMemo\([\s\S]*onBeatComplete[\s\S]*onLessonComplete/);
  });

  it("saves the ENGINE beat index, so the row means what the schema says", () => {
    expect(room).toContain("bookmarkAfterRoomBeat");
    // …and never writes the null that means „nothing left to bookmark", which
    // as a 0 would silently rewind the student to the start of the lesson.
    expect(room).toMatch(/at === null/);
  });

  it("resolves the resume point on the SERVER and opens the room on it", () => {
    expect(page).toContain("getLessonProgressStore");
    expect(page).toContain("resumeBeatIndex");
    expect(page).toContain("roomStartIndex");
    expect(page).toContain("startBeatIndex");
    expect(room).toContain("startBeatIndex={startBeatIndex}");
  });

  it("opens on the resumed beat in the FIRST render, not by an effect", () => {
    // A useEffect correction would flash beat 1 past a resuming student.
    expect(scene).toMatch(/useState\(\(\)\s*=>[\s\S]{0,200}startBeatIndex/);
  });

  it("does not let a bookmark failure interrupt a lesson", () => {
    expect(room).toMatch(/saveLessonPosition\([\s\S]{0,80}\)\.catch\(\(\)\s*=>\s*\{\}\)/);
  });
});

describe("one engine, one front door", () => {
  const lessonIndex = read("app/(dashboard)/lesson/page.tsx");
  const lessonById = read("app/(dashboard)/lesson/[lessonId]/page.tsx");
  const routeStatus = read("lib/routeStatus.ts");

  it("redirects /lesson at the classroom instead of rendering a second runner", () => {
    expect(lessonIndex).toContain("permanentRedirect");
    expect(lessonIndex).toContain('"/classroom"');
    expect(lessonIndex).not.toContain("LessonRunner");
  });

  it("redirects /lesson/[lessonId] to the same lesson in the room", () => {
    expect(lessonById).toContain("permanentRedirect");
    expect(lessonById).toContain("/classroom/");
    expect(lessonById).not.toContain("LessonRunner");
  });

  it("resolves the id against the catalogue before putting it in a Location", () => {
    // `params` arrives URL-DECODED, so „../../somewhere" is a reachable value
    // and interpolating it would emit a Location the router resolves elsewhere.
    expect(lessonById).toContain("lessonById");
    expect(lessonById).toMatch(/lesson === undefined \? "\/classroom"/);
  });

  it("keeps /classroom the only lesson entry in ROUTE_STATUS", () => {
    expect(routeStatus).toMatch(/"\/classroom":\s*"live"/);
    // A redirect is not a destination and must never appear in the nav.
    expect(routeStatus).not.toMatch(/"\/lesson"/);
  });
});
