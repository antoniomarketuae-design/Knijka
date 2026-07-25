/**
 * Published versions of the legal documents — the string a stored consent
 * points at (audit 2026-07-24, M-24).
 *
 * WHY A VERSION AND NOT JUST A TIMESTAMP: GDPR Art. 7(1) puts the burden on us
 * to demonstrate WHAT the user agreed to, not merely that they clicked. A bare
 * `consentAt` becomes unprovable the first time the Terms are reworded — every
 * consent then silently claims agreement to text the user never saw. Pinning a
 * version at the moment of consent (and storing the wording verbatim next to
 * it, see ConsentEvent.textBg) keeps every old consent readable forever.
 *
 * HOUSE RULE: bump the matching constant in the SAME commit that changes the
 * wording of /terms or /privacy. Dates are ISO (YYYY-MM-DD) so they sort, and
 * they are deliberately hand-written rather than derived from LAST_UPDATED in
 * identity.ts — that one is a founder placeholder for display, this one is a
 * data key that must never silently change.
 */

/** Version of /terms (Общи условия) currently served to users. */
export const TERMS_VERSION = "2026-07-24";

/** Version of /privacy (Политика за поверителност) currently served. */
export const PRIVACY_VERSION = "2026-07-24";
