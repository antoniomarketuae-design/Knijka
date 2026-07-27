/**
 * Persistence seam for hazard runs.
 *
 * WHAT A RUN ROW IS FOR. Two things, and only the first is urgent:
 *  1. it is the server's copy of "which clip is this student on and what has
 *     already been judged" — the thing that makes scoring authoritative
 *     instead of advisory. Nothing on the wire can move the cursor;
 *  2. it is the raw material for the safety claim (@/modules/outcomes): once
 *     ДАИ outcomes accrue, "did the students who reacted earlier crash less?"
 *     is answerable only if the reaction record survives the session.
 *
 * WHAT SHIPS TODAY IS IN-PROCESS, and that is a deliberate, bounded choice
 * with the same reasoning @/modules/security rateLimit.ts writes down: the
 * product runs as one `next start` process on one VPS, a run lasts a few
 * minutes, and a restart costing a student their half-finished run is a far
 * smaller harm than a schema change landing in the middle of a batch of
 * concurrent work. The interface below is the whole migration: a Prisma
 * implementation replaces this file's default and nothing else moves.
 *
 * ADR-004: a run row holds a user id, clip ids and media-second numbers. No
 * free text, no device data, no biometrics — a press timestamp is a fact about
 * a video. Runs die with the user (the Prisma model must cascade), and
 * abandoned in-flight runs are swept after RUN_TTL_MS so the process does not
 * accumulate them.
 */

import type { HazardDoor } from "@/components/hazard/types";
import type { HazardRunItemRecord, HazardRunRecord } from "./types";

export interface CreateHazardRunInput {
  userId: string;
  door: HazardDoor;
  engineVersion: string;
  items: HazardRunItemRecord[];
  startedAt?: Date;
}

export interface HazardRunStore {
  createRun(input: CreateHazardRunInput): Promise<HazardRunRecord>;
  getRun(runId: string): Promise<HazardRunRecord | null>;
  /** Overwrite a run wholesale. Callers mutate a copy, never the stored one. */
  saveRun(run: HazardRunRecord): Promise<void>;
  /** Finished runs of one user, newest first. */
  listRuns(userId: string, limit: number): Promise<HazardRunRecord[]>;
}

/**
 * How long an unfinished run stays resumable. Long enough for a phone call or
 * a tunnel, short enough that abandoned runs cannot pile up: a run is a few
 * clips, so anything past half an hour is a closed tab, not a pause.
 */
export const RUN_TTL_MS = 30 * 60 * 1000;

/** Finished runs kept per user in memory (the real store keeps them all). */
const IN_MEMORY_HISTORY_PER_USER = 20;

function cloneRun(run: HazardRunRecord): HazardRunRecord {
  return {
    ...run,
    items: run.items.map((item) => ({
      ...item,
      result: item.result === null ? null : { ...item.result },
    })),
  };
}

export class InMemoryHazardRunStore implements HazardRunStore {
  private readonly runs = new Map<string, HazardRunRecord>();

  async createRun(input: CreateHazardRunInput): Promise<HazardRunRecord> {
    const startedAt = input.startedAt ?? new Date();
    this.sweep(startedAt);
    const run: HazardRunRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      door: input.door,
      engineVersion: input.engineVersion,
      startedAt,
      finishedAt: null,
      cursor: 0,
      items: input.items,
    };
    this.runs.set(run.id, cloneRun(run));
    return cloneRun(run);
  }

  async getRun(runId: string): Promise<HazardRunRecord | null> {
    const run = this.runs.get(runId);
    return run === undefined ? null : cloneRun(run);
  }

  async saveRun(run: HazardRunRecord): Promise<void> {
    this.runs.set(run.id, cloneRun(run));
  }

  async listRuns(userId: string, limit: number): Promise<HazardRunRecord[]> {
    return [...this.runs.values()]
      .filter((r) => r.userId === userId && r.finishedAt !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, Math.max(0, limit))
      .map(cloneRun);
  }

  /**
   * Drop stale in-flight runs and over-long history. Runs on write rather than
   * on a timer: an interval in a Next server process outlives hot reloads and
   * is the classic way a dev machine ends up with forty of them.
   */
  private sweep(now: Date): void {
    const cutoff = now.getTime() - RUN_TTL_MS;
    const finishedByUser = new Map<string, HazardRunRecord[]>();

    for (const run of this.runs.values()) {
      if (run.finishedAt === null) {
        if (run.startedAt.getTime() < cutoff) this.runs.delete(run.id);
        continue;
      }
      const bucket = finishedByUser.get(run.userId);
      if (bucket) bucket.push(run);
      else finishedByUser.set(run.userId, [run]);
    }

    for (const bucket of finishedByUser.values()) {
      if (bucket.length <= IN_MEMORY_HISTORY_PER_USER) continue;
      bucket
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(IN_MEMORY_HISTORY_PER_USER)
        .forEach((run) => this.runs.delete(run.id));
    }
  }
}

let store: HazardRunStore | null = null;

/** Inject a store (tests, and the Prisma implementation when it lands). */
export function setHazardRunStore(next: HazardRunStore | null): void {
  store = next;
}

export function getHazardRunStore(): HazardRunStore {
  if (store === null) store = new InMemoryHazardRunStore();
  return store;
}
