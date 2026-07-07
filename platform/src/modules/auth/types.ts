/**
 * Minimal user shape exposed to the rest of the app.
 * GDPR (minors): never widen this with more PII than screens actually need.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};
