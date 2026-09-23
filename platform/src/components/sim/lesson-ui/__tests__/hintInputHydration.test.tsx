/**
 * =============================================================================
 * THE PHONE MUST HYDRATE THE HTML THE SERVER WROTE — lane D, 2026-09-22.
 * =============================================================================
 *
 * Every mobile audit leg since at least sweep w47 carried a Next.js overlay at
 * lesson arrival: „Hydration failed because the server rendered text didn't
 * match the client". Captured on the live dev server (HEAD 2c6d3cb,
 * iphone16-portrait, WebKit and Chromium), the diff React printed was:
 *
 *   <StatusDashboard …> <div aria-label="Двигател…" title="Двигател (I)">
 *     <span className="flex h-6 …" style={{color:"var(--danger)"}}>
 *   +   Изкл.        ← client (touch vocabulary)
 *   -   Изкл. I      ← server (keyboard vocabulary)
 *
 * Cause: `LessonPlayShell` chose its hint vocabulary with a lazy
 * `useState(() => hintInputFor(hasTouchScreen()))`, believing the shell never
 * server-renders. It does, on every `/simulator?scenario=…` deep link. The
 * server's `hasTouchScreen()` is false by design, the phone's is true, and
 * React threw the subtree away and regenerated it on the phone.
 *
 * THESE TESTS EXECUTE THE HOOK. The first render — the server's AND the
 * hydration render, which React feeds the same server snapshot — must say
 * "keyboard" even in an environment that is plainly a touch device. The old
 * lazy `useState` answers "touch" there, which is exactly the mismatch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardStatus, StatusDashboard, type DashboardStatus } from "@/modules/sim/hud";
import type { LessonSpec, TeachMoment } from "@/modules/sim/lessons";
import {
  MINIMAP_STORAGE_KEY,
  readStoredChoice,
  resetStoredChoicesForTests,
  useAdvisorChoice,
  useMinimapChoice,
  useQuizFrequency,
} from "../storedChoices";
import { TeachMomentOverlay } from "../TeachMomentOverlay";
import {
  readClientHintInput,
  resetClientHintInputForTests,
  SERVER_HINT_INPUT,
  useHintInput,
} from "../useHintInput";

/** A browser that is unmistakably a phone: touch points AND a coarse pointer. */
function stubTouchDevice(): void {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: q.includes("coarse"), media: q }),
  });
  vi.stubGlobal("navigator", { maxTouchPoints: 5 });
}

/** A desktop: no touch points, fine pointer only. */
function stubDesktop(): void {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: false, media: q }),
  });
  vi.stubGlobal("navigator", { maxTouchPoints: 0 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetClientHintInputForTests();
  resetStoredChoicesForTests();
});

function VocabularyProbe() {
  return <i data-input={useHintInput()} />;
}

function DashboardProbe() {
  const statusRef = useRef<DashboardStatus>(createDashboardStatus());
  return <StatusDashboard statusRef={statusRef} limitKmh={50} input={useHintInput()} />;
}

describe("useHintInput — the first render is the server's vocabulary", () => {
  it("renders the server value on a touch device (the hydration render sees the same)", () => {
    stubTouchDevice();
    // Precondition, so the assertion below cannot be vacuous: this environment
    // DOES read as touch to the client-side predicate.
    expect(readClientHintInput()).toBe("touch");
    resetClientHintInputForTests();

    expect(SERVER_HINT_INPUT).toBe("keyboard");
    expect(renderToString(<VocabularyProbe />)).toContain('data-input="keyboard"');
  });

  it("the dashboard engine cell is the exact text the server wrote (Изкл. I, not Изкл.)", () => {
    stubTouchDevice();
    const html = renderToString(<DashboardProbe />);
    expect(html).toContain("Изкл. I");
  });

  it("the vocabulary really does change that cell (so the check above can fail)", () => {
    const statusRef = { current: createDashboardStatus() };
    const touch = renderToString(<StatusDashboard statusRef={statusRef} limitKmh={50} input="touch" />);
    const keys = renderToString(<StatusDashboard statusRef={statusRef} limitKmh={50} input="keyboard" />);
    expect(keys).toContain("Изкл. I");
    expect(touch).not.toContain("Изкл. I");
    expect(touch).toContain("Изкл.");
  });
});

describe("readClientHintInput — the device's vocabulary, sampled once", () => {
  it("follows hasTouchScreen() on the client", () => {
    stubTouchDevice();
    expect(readClientHintInput()).toBe("touch");
    resetClientHintInputForTests();
    stubDesktop();
    expect(readClientHintInput()).toBe("keyboard");
  });

  it("does not change mid-page when a media query flips (no card rewords mid-lesson)", () => {
    stubTouchDevice();
    expect(readClientHintInput()).toBe("touch");
    stubDesktop();
    expect(readClientHintInput()).toBe("touch");
  });
});

describe("the shell takes its vocabulary from the hook, never from a render-time device read", () => {
  const SHELL = readFileSync(
    join(process.cwd(), "src/components/sim/lesson-ui/LessonPlayShell.tsx"),
    "utf8",
  );
  const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("declares hintInput from useHintInput()", () => {
    expect(CODE).toMatch(/const hintInput = useHintInput\(\);/);
  });

  it("calls neither hasTouchScreen() nor hintInputFor() itself", () => {
    // Either call in this server-rendered component is a device read during
    // render — the defect this file exists for. The only legitimate reader is
    // `useHintInput`'s client snapshot.
    expect(CODE).not.toMatch(/\bhasTouchScreen\s*\(/);
    expect(CODE).not.toMatch(/\bhintInputFor\s*\(/);
  });
});

// ===========================================================================
// ROUND 2 — the same false belief, two more places (lane D, 2026-09-22).
// ===========================================================================
//
// The server half of each. The client half (the post-hydration switch really
// happens) is in `hydrationClientSnapshot.test.tsx`, which needs React's
// `useSyncExternalStore` emulated and so lives in its own file.

/** A phone that has also been here before: every choice stored non-default. */
function stubReturningPhone(): void {
  const data = new Map<string, string>([
    [MINIMAP_STORAGE_KEY, "on"],
    ["sim.quizFrequency", "frequent"],
    ["aidrive.sim.advisor.v1", "off"],
  ]);
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: q.includes("coarse"), media: q }),
    localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: () => {} },
  });
  vi.stubGlobal("navigator", { maxTouchPoints: 5 });
}

const MOMENT: TeachMoment = {
  code: "SPEEDING_DANGEROUS",
  scenarioId: null,
  titleBg: "Превишена скорост",
  explanationBg: "Превиши разрешената скорост с повече от 10 km/h.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  severity: "opasna",
  points: 10,
  t: 22,
};

describe("TeachMomentOverlay — the server HTML is what the phone hydrates", () => {
  it("on a touch device the server/hydration render still carries the keyboard line", () => {
    stubReturningPhone();
    // Precondition: the client-side predicate DOES say touch here, so the old
    // `useState(isTouchDevice)` would have printed «Докосни» in this render.
    expect(readClientHintInput()).toBe("touch");
    resetClientHintInputForTests();
    const html = renderToString(
      <TeachMomentOverlay moment={MOMENT} remaining={0} onAcknowledge={() => {}} />,
    );
    expect(html).toContain("или натисни Space / Enter");
    expect(html).not.toContain("Докосни");
  });
});

function ChoicesProbe({ lesson }: { lesson: LessonSpec }) {
  const [minimap] = useMinimapChoice();
  const [quiz] = useQuizFrequency();
  const [advisor] = useAdvisorChoice(lesson);
  return <i data-minimap={String(minimap)} data-quiz={quiz} data-advisor={String(advisor)} />;
}
const BEGINNER = { id: "lesson-fixture-beginner", order: 1 } as unknown as LessonSpec;

describe("storedChoices — the server snapshot is the default, never the stored value", () => {
  it("a returning student's stored choices do not leak into the server/hydration render", () => {
    stubReturningPhone();
    // Precondition: the store DOES see the stored values client-side.
    expect(readStoredChoice(MINIMAP_STORAGE_KEY)).toBe("on");
    const html = renderToString(<ChoicesProbe lesson={BEGINNER} />);
    expect(html).toContain('data-minimap="false"');
    expect(html).toContain('data-quiz="occasional"');
    expect(html).toContain('data-advisor="true"'); // the lesson's default, not the stored "off"
  });
});

describe("no render-time device or storage read is left in the two components", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const SHELL = strip(
    readFileSync(join(process.cwd(), "src/components/sim/lesson-ui/LessonPlayShell.tsx"), "utf8"),
  );
  const OVERLAY = strip(
    readFileSync(join(process.cwd(), "src/components/sim/lesson-ui/TeachMomentOverlay.tsx"), "utf8"),
  );

  it("the shell takes minimap / advisor / quiz from the hydration-safe store", () => {
    expect(SHELL).toMatch(/const \[minimapOn, toggleMinimap\] = useMinimapChoice\(\);/);
    expect(SHELL).toMatch(/const \[advisorOn, toggleAdvisor\] = useAdvisorChoice\(lesson\);/);
    expect(SHELL).toMatch(/const \[quizFreq, setQuizFreq\] = useQuizFrequency\(\);/);
    expect(SHELL).not.toMatch(/localStorage\.getItem/);
    expect(SHELL).not.toMatch(/readStored(MinimapOn|QuizFrequency|AdvisorOn)/);
  });

  it("the overlay reads its vocabulary from useHintInput, not the device", () => {
    expect(OVERLAY).toMatch(/const touch = useHintInput\(\) === "touch";/);
    expect(OVERLAY).not.toMatch(/matchMedia|maxTouchPoints|hasTouchScreen|isTouchDevice/);
  });
});
