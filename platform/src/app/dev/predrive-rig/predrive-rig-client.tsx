"use client";

/**
 * Client half of the pre-drive tutorial rig (FR-19). See page.tsx for what is
 * real here and what is not.
 *
 * Query params:
 *   ?step=adjust-seat   which of the thirteen steps to open (default: the
 *                       first step that HAS a clip, so the review lands on the
 *                       thing being reviewed rather than on a still)
 *   ?compact=on         force the compact (phone) grammar without a coarse
 *                       pointer, the same way popup-rig does
 *   ?remount=on         put a `key={stepId}` back on the card, so a step change
 *                       DESTROYS the element instead of re-using it
 *   ?advance=on         «Разбрах» moves to the next step with the card still
 *                       open, the way instruction mode does in a real lesson,
 *                       instead of closing the card
 *
 * The strip along the bottom marks which steps carry a clip today, because the
 * point of the review is the DIFFERENCE: a step with a clip renders <video>,
 * every other step renders the inline-SVG still a student sees now.
 *
 * ── WHY THERE IS NO `key` ON THE CARD BY DEFAULT (2026-08-11) ────────────────
 * There was one, and it made this rig EASIER than the product. `key={stepId}`
 * destroys the <video> on every step change, so React's own detach did the
 * teardown and the component's `[stepId]` effect was never the thing under
 * test. `PreDriveChecklist` renders the card with NO key (line ~507), so the
 * real code has to survive a step change on a re-used element — which is
 * precisely the path the „moving on stops the download" claim rests on. A rig
 * that cannot reach the product's hardest path is not a rig, so the faithful
 * shape is now the default and `?remount=on` restores the old, easier one for
 * comparison.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlayAreaStyles } from "@/components/sim/lesson-ui/PlayAreaStyles";
import { PreDriveTutorial } from "@/modules/sim/hud/PreDriveTutorial";
import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_TUTORIAL_CLIPS,
  preDriveTutorialMedia,
  type PreDriveStepId,
} from "@/modules/sim/procedures";

/** Steps the student confirms by reading, not by touching a control. */
const INFO_STEPS = new Set<PreDriveStepId>(["adjust-seat", "check-surroundings", "check-dashboard"]);

export function PredriveRigClient() {
  const params = useSearchParams();
  const compact = params.get("compact") === "on";
  const remount = params.get("remount") === "on";
  const advance = params.get("advance") === "on";

  const order = PRE_DRIVE_STEP_ORDER as readonly PreDriveStepId[];
  const withClip = useMemo(
    () => order.filter((id) => PRE_DRIVE_TUTORIAL_CLIPS[id] !== undefined),
    [order],
  );

  const requested = params.get("step") as PreDriveStepId | null;
  const initial: PreDriveStepId =
    requested && order.includes(requested) ? requested : (withClip[0] ?? order[0]);

  const [stepId, setStepId] = useState<PreDriveStepId>(initial);
  const [closed, setClosed] = useState(false);

  const index = Math.max(0, order.indexOf(stepId));
  const media = preDriveTutorialMedia(stepId);

  return (
    <div
      className="min-h-screen bg-[#3a3f46] text-white"
      data-sim-compact={compact ? "on" : undefined}
    >
      <PlayAreaStyles />

      {/* A flat road-toned backdrop stands in for the 3D scene — see page.tsx. */}
      <div data-sim-stage="" className="relative h-[70vh] w-full overflow-hidden bg-[#4a5058]">
        {!closed && (
          <PreDriveTutorial
            key={remount ? stepId : undefined}
            stepId={stepId}
            stepNumber={index + 1}
            stepTotal={order.length}
            isInfoStep={INFO_STEPS.has(stepId)}
            onContinue={() => {
              // `?advance=on` mirrors instruction mode: confirming a step opens
              // the next one rather than ending the card. The last step still
              // closes, because there is nothing after it.
              if (advance && index + 1 < order.length) setStepId(order[index + 1]);
              else setClosed(true);
            }}
            onClose={() => setClosed(true)}
          />
        )}
        {closed && (
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              onClick={() => setClosed(false)}
              className="rounded-md border border-white/30 px-4 py-2 text-sm"
            >
              Отвори картата отново
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4 text-sm">
        <p className="opacity-80">
          Стъпка {index + 1} от {order.length} · медия:{" "}
          <strong>{media.kind === "clip" ? "ВИДЕО" : "рисунка (SVG)"}</strong>
          {media.kind === "clip" ? ` · ${media.clip.durationSec} s · ${media.clip.src}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {order.map((id) => {
            const hasClip = PRE_DRIVE_TUTORIAL_CLIPS[id] !== undefined;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setStepId(id);
                  setClosed(false);
                }}
                className={`rounded border px-2 py-1 text-xs ${
                  id === stepId ? "border-white bg-white/15" : "border-white/25"
                }`}
              >
                {hasClip ? "🎬 " : "✏️ "}
                {id}
              </button>
            );
          })}
        </div>
        <p className="opacity-60">
          🎬 = има видео · ✏️ = рисунката, която ученикът вижда днес
        </p>
      </div>
    </div>
  );
}
