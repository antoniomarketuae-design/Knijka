/**
 * S1/THEO-2 seam — the /simulator?scenario=<templateId>&level=<n> deep link.
 *
 * Scenario rungs are client state on /simulator (simulator-client.tsx), not
 * routes; the theory why-panel's „Опитай в симулатора" link needs a URL that
 * lands in a drill. This pure resolver turns the query params + the
 * server-computed catalog progression into one instruction for the client:
 * auto-start the rung when it is unlocked, otherwise anchor the catalog at
 * the template's card (never bypass the soft gate — the server refuses a
 * locked level's session anyway).
 *
 * Pure and node-testable; page.tsx calls it server-side.
 */

import type { ScenarioLevel } from "@/modules/sim/lessons";

export interface ScenarioDeepLink {
  templateId: string;
  level: ScenarioLevel;
  /** false → the client only focuses the catalog card (locked rung). */
  unlocked: boolean;
  /**
   * THEO-3 (?mistake=<i>): launch the template's MISTAKE-EXPERIENCE sandbox
   * instead of a graded rung. The mode always compiles the ENTRY rung
   * (always open per founder ruling), so `level` is the entry level here and
   * any ?level param is ignored. Client-side compile validates the index.
   */
  mistakeIndex?: number;
}

/** The slice of ScenarioCatalogEntry the resolver needs (structural). */
interface CatalogEntryLike {
  templateId: string;
  levels: ReadonlyArray<{ level: ScenarioLevel; unlocked: boolean }>;
}

/**
 * Resolve the deep-link params against the catalog. Unknown template → null
 * (the page renders normally). A missing/garbage/unauthored level falls back
 * to the template's entry rung — the link keeps working even if authored
 * ladders change under old links.
 */
export function resolveScenarioDeepLink(
  scenarioParam: string | string[] | undefined,
  levelParam: string | string[] | undefined,
  scenarios: readonly CatalogEntryLike[],
  mistakeParam?: string | string[] | undefined,
): ScenarioDeepLink | null {
  if (typeof scenarioParam !== "string" || scenarioParam.length === 0) return null;
  const entry = scenarios.find((s) => s.templateId === scenarioParam);
  if (entry === undefined || entry.levels.length === 0) return null;

  // Entry rung = the lowest authored level (always open per founder ruling).
  const entryRung = entry.levels.reduce((min, l) => (l.level < min.level ? l : min));

  // THEO-3 mistake-experience link: the mode plays the ENTRY rung only —
  // ?level is ignored, garbage indexes are ignored (normal link semantics).
  const mistakeIndex =
    typeof mistakeParam === "string" && /^\d{1,2}$/.test(mistakeParam)
      ? Number(mistakeParam)
      : null;
  if (mistakeIndex !== null) {
    return {
      templateId: entry.templateId,
      level: entryRung.level,
      unlocked: entryRung.unlocked,
      mistakeIndex,
    };
  }

  const requested =
    typeof levelParam === "string" && /^[1-5]$/.test(levelParam)
      ? (Number(levelParam) as ScenarioLevel)
      : null;
  const rung =
    requested !== null
      ? entry.levels.find((l) => l.level === requested)
      : undefined;
  const target = rung ?? entryRung;

  return {
    templateId: entry.templateId,
    level: target.level,
    unlocked: target.unlocked,
  };
}
