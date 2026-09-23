/**
 * =============================================================================
 * THE CLIENT HALF OF THE HYDRATION FIX — lane D, round 2, 2026-09-22.
 * =============================================================================
 *
 * `hintInputHydration.test.tsx` proves the SERVER half: the server (and so the
 * hydration render) prints the keyboard vocabulary and the default choices. On
 * its own that half is satisfied by a hook that NEVER leaves the server value —
 * a phone that stays on „Изкл. I", keyboard toasts and a «Space» key cap all
 * session, or a returning student whose minimap never comes back. The round-1
 * verifier refuted lane D on exactly that gap.
 *
 * WHY REACT IS MOCKED HERE, AND ONLY HERE. This repo's vitest runs in plain
 * Node — no jsdom, no happy-dom (not installed, and this lane may not install
 * anything) — so `hydrateRoot` cannot run. What React does with a
 * `useSyncExternalStore` during hydration is its documented contract: the
 * hydration render uses `getServerSnapshot`, and after hydration React reads
 * `getSnapshot` and re-renders if it differs. This file replaces ONLY that one
 * export with a two-phase emulation of that contract («hydrating» → server
 * snapshot, «client» → client snapshot) and renders the REAL hooks and the
 * REAL `TeachMomentOverlay` through `react-dom/server` in each phase. Every
 * other hook is React's own.
 *
 * So what is executed is the production code's choice of WHICH function is the
 * client snapshot and WHICH is the server snapshot, plus everything those
 * functions do. Forcing the client snapshot to the server value turns the
 * «client» assertions below red (mutation-checked, see the lane report).
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonSpec, QuizFrequency, TeachMoment } from "@/modules/sim/lessons";
import {
  advisorOnFromStored,
  DEFAULT_QUIZ_FREQUENCY,
  MINIMAP_STORAGE_KEY,
  readStoredChoice,
  resetStoredChoicesForTests,
  useAdvisorChoice,
  useMinimapChoice,
  useQuizFrequency,
  writeStoredChoice,
} from "../storedChoices";
import { MICRO_QUIZ_STORAGE_KEY } from "../types";
import { TeachMomentOverlay } from "../TeachMomentOverlay";
import { resetClientHintInputForTests, useHintInput } from "../useHintInput";

type Phase = "hydrating" | "client";
const phase = vi.hoisted(() => ({ current: "client" as "hydrating" | "client" }));
const subscribers = vi.hoisted(() => [] as Array<(notify: () => void) => () => void>);

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  function useSyncExternalStore<T>(
    subscribe: (notify: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T {
    subscribers.push(subscribe);
    if (phase.current === "hydrating") {
      if (getServerSnapshot === undefined) throw new Error("hydration needs a server snapshot");
      return getServerSnapshot();
    }
    return getSnapshot();
  }
  return { ...actual, default: { ...actual, useSyncExternalStore }, useSyncExternalStore };
});

function fakeStorage(initial: Record<string, string> = {}, opts: { throwOnSet?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
  };
}

function stubBrowser(opts: { touch: boolean; storage?: ReturnType<typeof fakeStorage> }): void {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: opts.touch && q.includes("coarse"), media: q }),
    localStorage: opts.storage ?? fakeStorage(),
  });
  vi.stubGlobal("navigator", { maxTouchPoints: opts.touch ? 5 : 0 });
}

function renderIn(p: Phase, el: ReactElement): string {
  phase.current = p;
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  subscribers.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetClientHintInputForTests();
  resetStoredChoicesForTests();
  phase.current = "client";
});

// ---------------------------------------------------------------------------
// 1 · The hint vocabulary: keyboard while hydrating, the device's afterwards.
// ---------------------------------------------------------------------------

function VocabularyProbe() {
  return <i data-input={useHintInput()} />;
}

describe("useHintInput — the post-hydration switch actually happens", () => {
  it("a phone hydrates as keyboard, then renders touch", () => {
    stubBrowser({ touch: true });
    expect(renderIn("hydrating", <VocabularyProbe />)).toContain('data-input="keyboard"');
    expect(renderIn("client", <VocabularyProbe />)).toContain('data-input="touch"');
  });

  it("a desktop stays keyboard after hydration (the switch is the device, not a constant)", () => {
    stubBrowser({ touch: false });
    expect(renderIn("client", <VocabularyProbe />)).toContain('data-input="keyboard"');
  });
});

// ---------------------------------------------------------------------------
// 2 · TeachMomentOverlay: the «Space» key cap is keyboard-only AFTER hydration.
// ---------------------------------------------------------------------------

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

describe("TeachMomentOverlay — the phone gets the tap wording once hydrated", () => {
  const roomy = <TeachMomentOverlay moment={MOMENT} remaining={0} onAcknowledge={() => {}} />;
  const compact = (
    <TeachMomentOverlay moment={MOMENT} remaining={0} onAcknowledge={() => {}} compact />
  );

  it("roomy: hydrates with the server's keyboard line, then says «Докосни»", () => {
    stubBrowser({ touch: true });
    const hydrating = renderIn("hydrating", roomy);
    expect(hydrating).toContain("или натисни Space / Enter");
    const client = renderIn("client", roomy);
    expect(client).toContain("Докосни, за да продължиш");
    expect(client).not.toContain("Space");
  });

  it("compact: the «Space» key cap on «Разбрах» is gone after hydration on a phone", () => {
    stubBrowser({ touch: true });
    expect(renderIn("hydrating", compact)).toContain("Space");
    expect(renderIn("client", compact)).not.toContain("Space");
  });

  it("a desktop keeps the key cap after hydration", () => {
    stubBrowser({ touch: false });
    expect(renderIn("client", roomy)).toContain("или натисни Space / Enter");
  });
});

// ---------------------------------------------------------------------------
// 3 · The remembered choices: default while hydrating, stored afterwards.
// ---------------------------------------------------------------------------

function MinimapProbe() {
  const [on] = useMinimapChoice();
  return <i data-minimap={on ? "on" : "off"} />;
}
function QuizProbe() {
  const [f] = useQuizFrequency();
  return <i data-quiz={f} />;
}
function AdvisorProbe({ lesson }: { lesson: LessonSpec }) {
  const [on] = useAdvisorChoice(lesson);
  return <i data-advisor={on ? "on" : "off"} />;
}
/** Beginner rung (order 1 ≤ ADVISOR_DEFAULT_ON_MAX_LEVEL): default ON. */
const BEGINNER = { id: "lesson-fixture-beginner", order: 1 } as unknown as LessonSpec;
/** Hands the hook's toggle out through a prop (no outside variable reassigned in render). */
function MinimapToggleProbe({ onToggle }: { onToggle: (t: () => void) => void }) {
  onToggle(useMinimapChoice()[1]);
  return null;
}
function AdvisorToggleProbe({
  lesson,
  onToggle,
}: {
  lesson: LessonSpec;
  onToggle: (t: () => void) => void;
}) {
  onToggle(useAdvisorChoice(lesson)[1]);
  return null;
}
/** Hands out the frequency selector's setter — the WRITE half of the hook. */
function QuizUpdateProbe({ onUpdate }: { onUpdate: (u: (f: QuizFrequency) => void) => void }) {
  const [f, update] = useQuizFrequency();
  onUpdate(update);
  return <i data-quiz={f} />;
}

describe("storedChoices — the returning student's choice comes back after hydration", () => {
  it("minimap: hydrates OFF (the server's default), then shows the stored ON", () => {
    stubBrowser({ touch: false, storage: fakeStorage({ [MINIMAP_STORAGE_KEY]: "on" }) });
    expect(renderIn("hydrating", <MinimapProbe />)).toContain('data-minimap="off"');
    expect(renderIn("client", <MinimapProbe />)).toContain('data-minimap="on"');
  });

  it("minimap: nothing stored stays OFF after hydration (the founder's default)", () => {
    stubBrowser({ touch: false });
    expect(renderIn("client", <MinimapProbe />)).toContain('data-minimap="off"');
  });

  it("quiz frequency: hydrates the default, then the stored value; junk stays default", () => {
    stubBrowser({ touch: false, storage: fakeStorage({ "sim.quizFrequency": "frequent" }) });
    expect(renderIn("hydrating", <QuizProbe />)).toContain('data-quiz="occasional"');
    expect(renderIn("client", <QuizProbe />)).toContain('data-quiz="frequent"');
    resetStoredChoicesForTests();
    stubBrowser({ touch: false, storage: fakeStorage({ "sim.quizFrequency": "always" }) });
    expect(renderIn("client", <QuizProbe />)).toContain('data-quiz="occasional"');
  });

  // The round-2 verifier's surviving mutation: drop „off" from the accepted
  // set and the case above still passes, because it stores „frequent". A
  // student who turned the micro-quiz OFF is the one who most notices being
  // overruled, so the OFF choice gets its own trip through the real hook.
  it("quiz frequency: a stored „off“ survives hydration and is not re-defaulted", () => {
    stubBrowser({ touch: false, storage: fakeStorage({ [MICRO_QUIZ_STORAGE_KEY]: "off" }) });
    expect(renderIn("hydrating", <QuizProbe />)).toContain(
      `data-quiz="${DEFAULT_QUIZ_FREQUENCY}"`,
    );
    const client = renderIn("client", <QuizProbe />);
    expect(client).toContain('data-quiz="off"');
    expect(client).not.toContain(`data-quiz="${DEFAULT_QUIZ_FREQUENCY}"`);
  });

  it("advisor: hydrates the LESSON default, then the stored choice that overrides it", () => {
    expect(advisorOnFromStored(null, BEGINNER)).toBe(true); // precondition: default ON
    stubBrowser({ touch: false, storage: fakeStorage({ "aidrive.sim.advisor.v1": "off" }) });
    expect(renderIn("hydrating", <AdvisorProbe lesson={BEGINNER} />)).toContain(
      'data-advisor="on"',
    );
    expect(renderIn("client", <AdvisorProbe lesson={BEGINNER} />)).toContain(
      'data-advisor="off"',
    );
  });
});

describe("storedChoices — writes reach subscribers and survive a throwing store", () => {
  it("a write notifies the subscription React holds, and the next read sees it", () => {
    const storage = fakeStorage();
    stubBrowser({ touch: false, storage });
    renderIn("client", <MinimapProbe />);
    const notify = vi.fn();
    const unsubscribe = subscribers[subscribers.length - 1](notify);
    writeStoredChoice(MINIMAP_STORAGE_KEY, "on");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(storage.data.get(MINIMAP_STORAGE_KEY)).toBe("on");
    expect(renderIn("client", <MinimapProbe />)).toContain('data-minimap="on"');
    unsubscribe();
    writeStoredChoice(MINIMAP_STORAGE_KEY, "off");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("the toggle flips from the STORE (P key and button share it) and persists", () => {
    const storage = fakeStorage({ [MINIMAP_STORAGE_KEY]: "on" });
    stubBrowser({ touch: false, storage });
    const got: Array<() => void> = [];
    renderIn("client", <MinimapToggleProbe onToggle={(t) => got.push(t)} />);
    const toggle = got[0];
    toggle();
    expect(storage.data.get(MINIMAP_STORAGE_KEY)).toBe("off");
    toggle();
    expect(storage.data.get(MINIMAP_STORAGE_KEY)).toBe("on");
  });

  it("the advisor toggle flips the EFFECTIVE value (the lesson default when nothing is stored)", () => {
    const storage = fakeStorage();
    stubBrowser({ touch: false, storage });
    const got: Array<() => void> = [];
    renderIn("client", <AdvisorToggleProbe lesson={BEGINNER} onToggle={(t) => got.push(t)} />);
    const toggle = got[0];
    toggle(); // default ON → OFF
    expect(storage.data.get("aidrive.sim.advisor.v1")).toBe("off");
  });

  // The second mutation the round-2 verifier left alive: `useQuizFrequency`'s
  // setter wrote a key nothing read. Nothing executed that setter, so any key
  // at all passed — and the selector would look right for the rest of the
  // session (React re-renders from the click) while the choice was lost the
  // moment the student came back. The assertion is a ROUND TRIP through the
  // real hook: write with the product's setter, read with the product's hook.
  it("the frequency selector's setter writes the key the hook reads back", () => {
    const storage = fakeStorage();
    stubBrowser({ touch: false, storage });
    const got: Array<(f: QuizFrequency) => void> = [];
    renderIn("client", <QuizUpdateProbe onUpdate={(u) => got.push(u)} />);
    got[0]("off");
    // The browser really holds it, under the key the shell has always used.
    expect(storage.data.get(MICRO_QUIZ_STORAGE_KEY)).toBe("off");
    expect(MICRO_QUIZ_STORAGE_KEY).toBe("sim.quizFrequency");
    // …and a fresh page (nothing in memory, only what the browser kept) reads
    // that choice back — this is the half a wrong key breaks.
    resetStoredChoicesForTests();
    expect(renderIn("client", <QuizProbe />)).toContain('data-quiz="off"');
  });

  it("the frequency setter round-trips every segment the selector offers", () => {
    const storage = fakeStorage();
    stubBrowser({ touch: false, storage });
    const got: Array<(f: QuizFrequency) => void> = [];
    renderIn("client", <QuizUpdateProbe onUpdate={(u) => got.push(u)} />);
    for (const f of ["frequent", "off", "occasional"] as QuizFrequency[]) {
      got[0](f);
      expect(storage.data.get(MICRO_QUIZ_STORAGE_KEY)).toBe(f);
      resetStoredChoicesForTests();
      expect(renderIn("client", <QuizProbe />)).toContain(`data-quiz="${f}"`);
    }
  });

  it("private mode (setItem throws): the choice still holds for the session", () => {
    stubBrowser({ touch: false, storage: fakeStorage({}, { throwOnSet: true }) });
    writeStoredChoice(MINIMAP_STORAGE_KEY, "on");
    expect(readStoredChoice(MINIMAP_STORAGE_KEY)).toBe("on");
    expect(renderIn("client", <MinimapProbe />)).toContain('data-minimap="on"');
  });
});
