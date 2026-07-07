import { describe, expect, it } from "vitest";
import {
  addDays,
  DAY_MS,
  INITIAL_SCHEDULE,
  isDue,
  REVIEW_INTERVALS_DAYS,
  schedule,
  type ScheduleState,
} from "./scheduler";

const NOW = new Date("2026-07-07T12:00:00.000Z");

describe("spaced-repetition scheduler (SM-2-lite)", () => {
  it("uses the interval ladder [1, 3, 7, 16, 35] days", () => {
    expect([...REVIEW_INTERVALS_DAYS]).toEqual([1, 3, 7, 16, 35]);
  });

  it("first correct answer on a new concept schedules review in 1 day", () => {
    const next = schedule(INITIAL_SCHEDULE, true, NOW);
    expect(next.reps).toBe(1);
    expect(next.dueAt).toEqual(addDays(NOW, 1));
  });

  it("advances the ladder on correct-when-due: 1 → 3 → 7 → 16 → 35 → 35", () => {
    let state: ScheduleState = INITIAL_SCHEDULE;
    let now = NOW;
    const expectedIntervals = [1, 3, 7, 16, 35, 35, 35];
    for (const days of expectedIntervals) {
      state = schedule(state, true, now);
      expect(state.dueAt).toEqual(addDays(now, days));
      now = state.dueAt!; // answer again exactly when due
    }
    expect(state.reps).toBe(expectedIntervals.length);
  });

  it("correct answer BEFORE the review is due leaves the schedule unchanged", () => {
    const state: ScheduleState = { reps: 2, dueAt: addDays(NOW, 3) };
    const next = schedule(state, true, NOW);
    expect(next).toEqual(state);
  });

  it("wrong answer resets to 1 day and reps to 0, whenever it happens", () => {
    const mature: ScheduleState = { reps: 4, dueAt: addDays(NOW, -2) };
    const next = schedule(mature, false, NOW);
    expect(next.reps).toBe(0);
    expect(next.dueAt).toEqual(addDays(NOW, 1));

    const early: ScheduleState = { reps: 3, dueAt: addDays(NOW, 10) };
    const nextEarly = schedule(early, false, NOW);
    expect(nextEarly.reps).toBe(0);
    expect(nextEarly.dueAt).toEqual(addDays(NOW, 1));
  });

  it("after a lapse the ladder restarts from 1 day", () => {
    let state: ScheduleState = { reps: 4, dueAt: NOW };
    state = schedule(state, false, NOW); // lapse
    state = schedule(state, true, addDays(NOW, 1)); // due again, correct
    expect(state.reps).toBe(1);
    expect(state.dueAt).toEqual(addDays(addDays(NOW, 1), 1));
  });

  it("isDue: null dueAt is never due; past/exact dueAt is due; future is not", () => {
    expect(isDue(INITIAL_SCHEDULE, NOW)).toBe(false);
    expect(isDue({ reps: 1, dueAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(true);
    expect(isDue({ reps: 1, dueAt: NOW }, NOW)).toBe(true);
    expect(isDue({ reps: 1, dueAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
  });

  it("addDays does plain millisecond arithmetic", () => {
    expect(addDays(NOW, 3).getTime()).toBe(NOW.getTime() + 3 * DAY_MS);
  });
});
