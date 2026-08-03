"use client";

/**
 * The board behind the teacher.
 *
 * The founder: *„on the board videos are shown with correct ways and
 * mistake/wrong ways to do things."* Both halves already exist — every one of
 * the 155 scenario templates carries a `shadow-correct.trace.json` next to its
 * mistake traces — so this component's whole job is to show them AS A PAIR,
 * the way a teacher does: *ето така е правилно · а ето какво се обърка*, same
 * road, same junction, same camera. Two unrelated clips would teach nothing;
 * the type (`ClassroomBoard`) refuses to describe a board with only one side.
 *
 * WHAT IT RENDERS, AND WHY IT IS USUALLY NOT VIDEO. Default is
 * `MistakeReplay` — the 2D canvas trace replay, ~134 KB a side, no WebGL
 * context, no decoder. `MistakeMedia` (which prefers the rendered .webm) is
 * mounted only when the manifest actually has a reel for that trace AND the
 * connection is not saveData/2g. That is `boardPolicy.ts`, and it is the
 * inversion doc 84 §1.1 argues for: a pair as traces is ~270 KB, the same pair
 * as video is ~5,1 MB, and only 42 of 155 templates have a reel at all.
 * Nothing in the existing media components is modified — the room just picks.
 *
 * IT FREEZES AS WELL AS DIMS. Doc 84 §5.1 rule 2 asks for both, and for a week
 * this only dimmed: `MistakeReplay` owned its rAF loop and exposed no input,
 * so the car kept driving behind a 42%-opacity veil while the teacher answered
 * a question about the moment that had just gone past — the referent the dim
 * exists to preserve was moving. Both renderers now take `paused`, and
 * `dimmed` is what feeds it: one flag, one meaning („the student's attention
 * is somewhere else"), so the two halves of the rule cannot drift apart.
 *
 * LAYOUT, and the one number that drives it. `MistakeReplay` sizes its canvas
 * from its OWN width (`clamp(140, w × 0.72, 240)`), so on a 844×390 phone in
 * landscape a full-width pane would be 240 px tall inside a ~250 px room and
 * the caption would fall off the bottom. The board therefore measures its own
 * box and caps each pane's width from the height it actually has. Same rule
 * decides the arrangement: both panes side by side when two capped panes fit,
 * one at a time (with the other as a live tab) when they do not. On a phone
 * held upright that is always one — which is correct: 390 px is not a width
 * you can compare two maps across.
 */

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clipForTracePath, fetchClipManifest } from "@/modules/clips/view";
import {
  BOARD_CHROME_DENSE_PX,
  BOARD_CHROME_PX,
  PANE_MIN_W,
  fitBoard,
  type BoardFit,
} from "./boardFit";
import {
  AVG_REEL_KB,
  boardPolicyFor,
  formatMegabytesBg,
  readConnection,
  type ConnectionSnapshot,
} from "./boardPolicy";
import type { BoardSide, ClassroomBoard, ClassroomBoardTake } from "./types";

/** Both renderers are lazy: a lesson beat with no board must not pay for them. */
const MistakeReplay = dynamic(() => import("@/components/theory/MistakeReplay"), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});
const MistakeMedia = dynamic(() => import("@/components/theory/MistakeMedia"), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});

function BoardSkeleton() {
  return (
    <div
      aria-hidden
      className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
    />
  );
}

const SIDE_TINT: Record<BoardSide, string> = {
  correct: "var(--success)",
  mistake: "var(--danger)",
};

const SIDE_MARK: Record<BoardSide, string> = { correct: "✓", mistake: "✕" };

const SIDE_LABEL_BG: Record<BoardSide, string> = {
  correct: "Така е правилно",
  mistake: "Ето какво се обърка",
};

/** One pane: the replay, its stored caption, and the honest data note. */
function BoardPane({
  take,
  side,
  districtId,
  conn,
  active,
  replayNonce,
  maxWidthPx,
  dense,
  hasReel,
  pairSymmetric,
  paused,
}: {
  take: ClassroomBoardTake;
  side: BoardSide;
  districtId: string;
  conn: ConnectionSnapshot | null;
  active: boolean;
  /** Bumped by „Покажи го пак" — remounts the replay from its first frame. */
  replayNonce: number;
  maxWidthPx: number;
  /** The board is frozen (a hand is up). Both renderers hold their frame. */
  paused: boolean;
  /** Text stripped; the caption is shown by the transcript column instead. */
  dense: boolean;
  /** The manifest has a rendered reel for THIS take. */
  hasReel: boolean;
  /** …and for the other half too. See boardPolicy: a pair is shown alike. */
  pairSymmetric: boolean;
}) {
  // A new take is a new decision: neither the reel opt-in nor an expanded
  // caption may carry over from the side the student just left. Keyed by the
  // trace rather than reset in an effect, so the correct value is what the
  // FIRST render of the new take already shows.
  const [ui, setUi] = useState({ trace: take.tracePath, optIn: false, expanded: false });
  const current = ui.trace === take.tracePath;
  const optIn = current && ui.optIn;
  const expanded = current && ui.expanded;

  const policy = boardPolicyFor(hasReel, conn, optIn, pairSymmetric);
  const tint = SIDE_TINT[side];

  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1.5" style={{ maxWidth: maxWidthPx }}>
      {/* No title row: the tab above already names this side, and a short room
          cannot afford the same words twice. `aria-label` keeps it for anyone
          reading the figure rather than looking at it. */}
      <div
        aria-label={`${SIDE_MARK[side]} ${take.titleBg}`}
        className="relative shrink-0 rounded-xl border p-1"
        style={{
          borderColor: active ? tint : "var(--border)",
          background: "color-mix(in srgb, var(--surface-2) 55%, transparent)",
        }}
      >
        {policy.renderer === "video" ? (
          <MistakeMedia
            key={`v-${take.tracePath}-${replayNonce}`}
            tracePath={take.tracePath}
            districtId={districtId}
            paused={paused}
          />
        ) : (
          <MistakeReplay
            key={`t-${take.tracePath}-${replayNonce}`}
            tracePath={take.tracePath}
            districtId={districtId}
            paused={paused}
          />
        )}

        {/* The reel offer rides ON the diagram, pinned, because it must not
            consume layout height: `boardFit` budgets the pane down to the
            pixel and a row that appears only sometimes would push the caption
            out of the room exactly when the student is being told something.
            The reason lives in the title/aria — the number is on the face. */}
        {policy.videoAvailableButHeld && (
          <button
            type="button"
            onClick={() => setUi({ trace: take.tracePath, optIn: true, expanded })}
            title={policy.noticeBg ?? undefined}
            aria-label={`Пусни видеозаписа, около ${formatMegabytesBg(AVG_REEL_KB)}. ${policy.noticeBg ?? ""}`}
            className="absolute right-2 top-2 rounded-full border border-border-strong bg-surface/90 px-2 py-0.5 text-[10px] font-bold text-accent-soft backdrop-blur-sm"
          >
            ▶ видео · ~{formatMegabytesBg(AVG_REEL_KB)}
          </button>
        )}
      </div>

      {/* The stored caption, verbatim — this is the sentence that teaches, so
          it gets RESERVED height rather than whatever the flex column has left
          over. Clamped rather than scrolled: the full text is also spoken by
          the teacher and printed in the transcript, so the board's copy is a
          label, and a label that grows is a label that pushes the diagram off
          the screen. */}
      {!dense && (
        // Clamped to three lines so the diagram keeps its height — but a
        // TAP opens the rest. Stored teaching copy may be folded away; it may
        // never be unreachable.
        <button
          type="button"
          onClick={() => setUi({ trace: take.tracePath, optIn, expanded: !expanded })}
          aria-expanded={expanded}
          className={`shrink-0 text-left text-[12px] leading-snug text-foreground/90 ${
            expanded ? "max-h-[9em] overflow-y-auto" : "cl-clamp-3"
          }`}
        >
          {take.captionBg}
        </button>
      )}

    </figure>
  );
}

export function LessonBoard({
  board,
  side,
  onSideChange,
  dimmed,
  replayNonce,
  dense = false,
  className,
}: {
  board: ClassroomBoard;
  side: BoardSide;
  onSideChange: (side: BoardSide) => void;
  /** The student interrupted: dim, but never clear — doc 84 §5.1 rule 2. */
  dimmed: boolean;
  replayNonce: number;
  /** Short room (a phone held sideways): tabs + canvas, text lives elsewhere. */
  dense?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<BoardFit>({ wide: false, paneMaxWidthPx: PANE_MIN_W, scale: 1 });

  // The board is laid out from the box it was given, in both axes — see the
  // header note. `useLayoutEffect` so the first paint is already correct.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chrome = dense ? BOARD_CHROME_DENSE_PX : BOARD_CHROME_PX;
    const measure = () => setFit(fitBoard(el.clientWidth, el.clientHeight, chrome));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [dense]);

  // Read once per mount: `navigator.connection` is a hint, not a live feed, and
  // re-deciding the renderer mid-beat would swap the board under the student.
  const conn = useMemo(() => readConnection(), []);

  // Which halves have a rendered reel. Resolved HERE rather than inside each
  // pane, because the answer for one half changes what the other half may do
  // (boardPolicy: a pair is shown alike). One tiny cached fetch per page
  // lifetime; any failure reads as "no reels", which is the safe default the
  // whole board is designed around anyway.
  const [reels, setReels] = useState<{ correct: boolean; mistake: boolean }>({
    correct: false,
    mistake: false,
  });
  useEffect(() => {
    let alive = true;
    fetchClipManifest()
      .then((clips) => {
        if (!alive) return;
        setReels({
          correct: clipForTracePath(clips, board.correct.tracePath) !== null,
          mistake: clipForTracePath(clips, board.mistake.tracePath) !== null,
        });
      })
      .catch(() => {
        if (alive) setReels({ correct: false, mistake: false });
      });
    return () => {
      alive = false;
    };
  }, [board.correct.tracePath, board.mistake.tracePath]);

  const pairSymmetric = reels.correct && reels.mistake;

  return (
    <section
      ref={boxRef}
      aria-label="Дъската на учителя"
      className={`flex min-h-0 min-w-0 flex-col gap-2 ${className ?? ""}`}
      style={{
        opacity: dimmed ? 0.42 : 1,
        filter: dimmed ? "saturate(0.6)" : undefined,
        transition: "opacity 240ms ease, filter 240ms ease",
      }}
    >
      {/* The pair, always named, always in the teacher's order: right, then
          wrong. In wide layouts these are labels over two live panes; in
          narrow ones they are the tabs you step between. */}
      <div
        role={fit.wide ? undefined : "tablist"}
        aria-label={fit.wide ? undefined : "Правилно или грешка"}
        className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface/70 p-1"
      >
        {(["correct", "mistake"] as const).map((s) => {
          const on = fit.wide || side === s;
          return (
            <button
              key={s}
              type="button"
              role={fit.wide ? undefined : "tab"}
              aria-selected={fit.wide ? undefined : side === s}
              onClick={() => onSideChange(s)}
              className={`min-w-0 flex-1 rounded-lg px-2 text-left text-[11px] font-bold leading-tight transition-colors ${dense ? "py-1" : "py-1.5"}`}
              style={{
                background: on
                  ? `color-mix(in srgb, ${SIDE_TINT[s]} 16%, transparent)`
                  : "transparent",
                color: on ? SIDE_TINT[s] : "var(--muted)",
              }}
            >
              <span aria-hidden className="mr-1">
                {SIDE_MARK[s]}
              </span>
              {SIDE_LABEL_BG[s]}
            </button>
          );
        })}
      </div>

      {/* The last-resort fit: when even a minimum-size canvas plus its own
          controls will not fit the height, the whole board scales instead of
          having its bottom sentence cropped off. A projector does the same
          thing. `scale` is 1 in every layout that fits. */}
      <div
        className="flex min-h-0 origin-top justify-center gap-3"
        style={fit.scale === 1 ? undefined : { transform: `scale(${fit.scale})` }}
      >
        {fit.wide ? (
          <>
            <BoardPane
              take={board.correct}
              side="correct"
              districtId={board.districtId}
              conn={conn}
              active={side === "correct"}
              replayNonce={replayNonce}
              maxWidthPx={fit.paneMaxWidthPx}
              dense={dense}
              hasReel={reels.correct}
              pairSymmetric={pairSymmetric}
              paused={dimmed}
            />
            <BoardPane
              take={board.mistake}
              side="mistake"
              districtId={board.districtId}
              conn={conn}
              active={side === "mistake"}
              replayNonce={replayNonce}
              maxWidthPx={fit.paneMaxWidthPx}
              dense={dense}
              hasReel={reels.mistake}
              pairSymmetric={pairSymmetric}
              paused={dimmed}
            />
          </>
        ) : (
          <BoardPane
            take={side === "correct" ? board.correct : board.mistake}
            side={side}
            districtId={board.districtId}
            conn={conn}
            active
            replayNonce={replayNonce}
            maxWidthPx={fit.paneMaxWidthPx}
            dense={dense}
            hasReel={side === "correct" ? reels.correct : reels.mistake}
            pairSymmetric={pairSymmetric}
            paused={dimmed}
          />
        )}
      </div>

    </section>
  );
}

export default LessonBoard;
