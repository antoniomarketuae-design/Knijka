/**
 * captureSignalDials — the RECORDING's session-start signal pins, resolved
 * for the capture rig (doc 66 R5 world parity; the pilot-v2 CAUSE-4 seam).
 *
 * The scripted recorder (traces/recorder.ts) applies two dials before the
 * first frame: `signalOffsets` (runtime.setSignalClusterOffset) and
 * `signalModes` (runtime.setSignalClusterMode). MODES are template-authored
 * (ScenarioSpec.signalModes → compileScenario → LessonSpec.signalModes), so
 * the capture mount already re-applies them through applySignalModes.
 * OFFSETS have no template channel — they are authored PER RECORDING inside
 * the trace scripts — so a capture that ignores them replays the ghost
 * against lamp phases the recording never saw (a red-run demo under a green
 * lamp is a FALSE artifact, doc 66 R1/R5).
 *
 * This module is the single capture-side registry of those recorder pins,
 * keyed by (templateId, trace file name). Sources, per family:
 *  - scJunctions.ts exports SC_JUNCTION_RECORDINGS with per-trace-name
 *    `signalOffsets` — read directly (no duplication, cannot drift);
 *  - scRxTram.ts pins sc-rx-tram-left's three drives to the SAME exported
 *    constant scJunctions uses for sc-turn-left-oncoming
 *    (SX_PIN_EW_GREEN_WINDOW, not re-exported through the traces barrel) —
 *    derived here from the junction map by identity;
 *  - scSignalHesitation.ts exports SX_PIN_NS_GREEN_HOLD — read directly;
 *  - four scripts keep their pin module-private; the literals are duplicated
 *    here WITH source pins. The captureFeedParity test locks the observable
 *    lamp behavior, so a silent script edit fails a test, not a founder
 *    review:
 *      scJxBlockedExit.ts   SIGNAL_OFFSETS = { "sx-n-c": 0 }
 *      scLnTurnLaneArrows.ts SIGNAL_OFFSETS = { "ln-n-c": 0 }
 *      scPeJaywalker.ts     SIGNAL_OFFSETS = { "sx-n-c": 44 }
 *      scSignalRedYellow.ts SIGNAL_OFFSETS = { "sx-n-c": 30 }
 *      scSpEcoCoast.ts      SIGNAL_OFFSETS = { "sx-n-c": 30 }
 *
 * Every other template records with the map's NATURAL FNV-1a offsets (e.g.
 * sc-ed-d2-city-run — its red at cluster n152073034 is Лозенец's own clock),
 * for which the correct capture behavior is: apply NOTHING.
 */

import { SC_JUNCTION_RECORDINGS, SX_PIN_NS_GREEN_HOLD } from "@/modules/sim/traces";

export type SignalOffsets = Readonly<Record<string, number>>;

/** Trace file name (`<name>.trace.json` basename) from a repo trace path. */
function traceNameOf(tracePath: string): string {
  const base = tracePath.slice(tracePath.lastIndexOf("/") + 1);
  return base.endsWith(".trace.json") ? base.slice(0, -".trace.json".length) : base;
}

/** sc-rx-tram-left's pin — scJunctions' SX_PIN_EW_GREEN_WINDOW by identity
 *  (scRxTram imports exactly that constant for all three of its drives). */
function ewGreenWindowPin(): SignalOffsets {
  const drives = SC_JUNCTION_RECORDINGS["sc-turn-left-oncoming"]?.drives;
  const pin = drives?.["shadow-correct"]?.signalOffsets;
  if (!pin) {
    throw new Error(
      "captureSignalDials: sc-turn-left-oncoming's shadow pin disappeared from SC_JUNCTION_RECORDINGS — re-source sc-rx-tram-left's offsets",
    );
  }
  return pin;
}

/** Whole-template pins (every committed trace of the template records with
 *  the same dial) — the module-private literals, source-pinned above. */
const TEMPLATE_PINS: Record<string, SignalOffsets> = {
  "sc-jx-blocked-exit": { "sx-n-c": 0 },
  "sc-ln-turn-lane-arrows": { "ln-n-c": 0 },
  "sc-pe-jaywalker": { "sx-n-c": 44 },
  "sc-signal-redyellow": { "sx-n-c": 30 },
  "sc-sp-eco-coast": { "sx-n-c": 30 },
  "sc-signal-hesitation": SX_PIN_NS_GREEN_HOLD,
};

/**
 * The signal-cluster offsets THIS recording ran with, or null when the
 * recording used the map's natural offsets (the correct default — never
 * substitute a guess; doc 66 R5). Per-trace-name resolution covers the
 * scJunctions families where the shadow and a mistake pin differently
 * (sc-signal-response's amber gamble records UNPINNED between two pinned
 * siblings).
 */
export function recordedSignalOffsetsFor(
  templateId: string,
  tracePath: string,
): SignalOffsets | null {
  const junction = SC_JUNCTION_RECORDINGS[templateId as keyof typeof SC_JUNCTION_RECORDINGS];
  if (junction) {
    const drive = junction.drives[traceNameOf(tracePath) as keyof typeof junction.drives];
    return drive?.signalOffsets ?? null;
  }
  if (templateId === "sc-rx-tram-left") return ewGreenWindowPin();
  return TEMPLATE_PINS[templateId] ?? null;
}
