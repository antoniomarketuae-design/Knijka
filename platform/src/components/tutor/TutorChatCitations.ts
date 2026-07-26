/**
 * The UI half of the ADR-002 citation contract (doc 81 §1.4, D1).
 *
 * The tutor module validates every bracketed marker the model emits against
 * the lawRefs it actually injected into that prompt, and drops the rest. The
 * chat then rendered EVERY „[...]" substring as an accent-coloured law chip and
 * never read the validated list — so an invented „[ЗДвП чл. 999]" looked
 * pixel-identical to a verified „[ЗДвП чл. 47]", and a student could type a
 * fake reference into the composer and watch their own message render one. The
 * strongest structural guarantee in the repo was enforced in the module and
 * thrown away in the component.
 *
 * splitTutorMessage is the gate: a marker becomes a chip ONLY if the server
 * put its reference on this message's allow-list. Everything else stays
 * literal text, brackets and all — nothing is hidden from the student, it just
 * stops wearing the uniform of a law citation.
 *
 * This file is deliberately free of React and of any @/modules import: it is a
 * client component's dependency (no deep imports across module boundaries,
 * docs/architecture/05) and it must be unit-testable with no DOM.
 */

export interface TutorCitationRef {
  act: string;
  ref: string;
}

export type TutorMessagePart =
  | { kind: "text"; text: string }
  | { kind: "citation"; label: string };

/** Splits "[ЗДвП чл. 47]" markers out of the text, keeping the delimiters. */
const MARKER_SPLIT_RE = /(\[[^\][]+\])/g;

/**
 * Mirrors normalizeMarker() in @/modules/tutor prompt.ts — the same folding the
 * server used when it decided the marker was legitimate.
 *
 * It is restated rather than imported because the module's internals are not
 * public API. The rule that keeps that safe: this normalization must never be
 * LOOSER than the server's. Identical, and a citation the server approved
 * renders as a chip. Stricter, and it renders as plain text — a citation lost,
 * which is a cosmetic bug. Looser, and a marker the server REFUSED could match
 * an approved one, which is the defect this file exists to close.
 */
function normalizeCitationLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Break a reply into renderable parts, promoting to a citation chip only those
 * markers backed by `citations` (the server-validated list for THIS message).
 *
 * `citations` is optional on purpose: user messages never carry one, and so do
 * assistant messages persisted before the tutor started storing them. Both
 * cases mean "nothing here is a verified citation", and the absence of the
 * list must render as no chips rather than as all chips.
 *
 * Consecutive text runs are merged so a rejected marker reads as ordinary
 * prose. The concatenated parts always reconstruct `content` exactly — the
 * gate changes how text is dressed, never what the student is shown.
 */
export function splitTutorMessage(
  content: string,
  citations?: TutorCitationRef[],
): TutorMessagePart[] {
  const allowed = new Set(
    (citations ?? []).map((c) => normalizeCitationLabel(`${c.act} ${c.ref}`)),
  );

  const parts: TutorMessagePart[] = [];
  const pushText = (text: string): void => {
    if (text.length === 0) return;
    const last = parts.at(-1);
    if (last?.kind === "text") last.text += text;
    else parts.push({ kind: "text", text });
  };

  for (const chunk of content.split(MARKER_SPLIT_RE)) {
    const isMarker = chunk.startsWith("[") && chunk.endsWith("]");
    const label = isMarker ? chunk.slice(1, -1) : "";
    if (isMarker && allowed.has(normalizeCitationLabel(label))) {
      parts.push({ kind: "citation", label });
    } else {
      pushText(chunk);
    }
  }
  return parts;
}
