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
): ScenarioDeepLink | null {
  if (typeof scenarioParam !== "string" || scenarioParam.length === 0) return null;
  const entry = scenarios.find((s) => s.templateId === scenarioParam);
  if (entry === undefined || entry.levels.length === 0) return null;

  const requested =
    typeof levelParam === "string" && /^[1-5]$/.test(levelParam)
      ? (Number(levelParam) as ScenarioLevel)
      : null;
  const rung =
    requested !== null
      ? entry.levels.find((l) => l.level === requested)
      : undefined;
  // Entry rung = the lowest authored level (always open per founder ruling).
  const target =
    rung ?? entry.levels.reduce((min, l) => (l.level < min.level ? l : min));

  return {
    templateId: entry.templateId,
    level: target.level,
    unlocked: target.unlocked,
  };
}
