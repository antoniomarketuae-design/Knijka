/**
 * ROOM BEATS ↔ ENGINE BEATS — the two indexes that both call themselves
 * „beat", and the conversion that keeps the saved one honest.
 *
 * The engine's beat is a unit of TEACHING: one board, one quiz, one idea.
 * The room's beat is a unit of SPEAKING: one sentence, one pause point, one
 * pip in the header (`lessonToRoom.ts` splits one into N of the other). The
 * database stores the engine's index, because that is what `LessonProgress`
 * documents and what the plain outline uses — and because a row that recorded
 * „sentence 7" would be a database column owned by one renderer's typography.
 *
 * So the surface converts, in both directions, here — client-safe, pure, and
 * tested, rather than inline in a page where an off-by-one shows up as a
 * student being sent back a paragraph every time they reopen a lesson.
 */

/**
 * Which engine beat a room beat belongs to.
 *
 * Returns -1 for a room beat with no mapping, which the caller must treat as
 * „do not save" rather than as beat 0: writing 0 for an unknown beat would
 * quietly rewind the student to the start of the lesson.
 */
export function engineIndexOfRoomBeat(
  roomBeatId: string,
  beatSource: Readonly<Record<string, string>>,
  engineBeatIds: readonly string[],
): number {
  const engineBeatId = beatSource[roomBeatId];
  if (engineBeatId === undefined) return -1;
  return engineBeatIds.indexOf(engineBeatId);
}

/**
 * The bookmark to write once the student has finished room beat `finishedIndex`
 * — or null when there is nothing left to bookmark (the lesson is ending, and
 * completion is a different write).
 *
 * IT IS THE ENGINE BEAT OF THE NEXT SENTENCE, and the two obvious alternatives
 * are both wrong in a way a student feels:
 *
 *   „the beat that just finished"      → replays a whole idea they heard to
 *                                        the end, every single time they come
 *                                        back.
 *   „the beat that just finished + 1"  → skips the rest of an idea when they
 *                                        stopped halfway through it, because
 *                                        one idea is several sentences.
 *
 * Reading the next sentence's own beat gets both cases right at once: stop
 * mid-idea and it is still that idea; finish it and it is the next one.
 */
export function bookmarkAfterRoomBeat(
  roomBeatIds: readonly string[],
  beatSource: Readonly<Record<string, string>>,
  engineBeatIds: readonly string[],
  finishedIndex: number,
): number | null {
  const next = roomBeatIds[finishedIndex + 1];
  if (next === undefined) return null;
  const at = engineIndexOfRoomBeat(next, beatSource, engineBeatIds);
  return at < 0 ? null : at;
}

/**
 * Where the room should open, given a saved ENGINE beat index.
 *
 * The FIRST room beat of that engine beat — the start of the idea the student
 * was on, not the middle of it. A saved index past the end of what resolves
 * today (a template whose trace went `pending` drops a beat) falls back to the
 * start of the lesson rather than to a blank room.
 */
export function roomStartIndex(
  roomBeatIds: readonly string[],
  beatSource: Readonly<Record<string, string>>,
  engineBeatIds: readonly string[],
  engineBeatIndex: number,
): number {
  if (!Number.isFinite(engineBeatIndex) || engineBeatIndex <= 0) return 0;
  const target = Math.floor(engineBeatIndex);
  for (let i = 0; i < roomBeatIds.length; i++) {
    const at = engineIndexOfRoomBeat(roomBeatIds[i], beatSource, engineBeatIds);
    if (at >= target) return i;
  }
  return 0;
}
