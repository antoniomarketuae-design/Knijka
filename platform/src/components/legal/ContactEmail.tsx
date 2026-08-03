/**
 * The support address, as something a student can actually CLICK.
 *
 * Audit finding: `CONTACT_EMAIL` was interpolated as bare text in five places —
 * the Terms, the Privacy Policy, the operator card, the Contact page and, worst
 * of all, the recovery instruction inside the checkout consent gate. On a phone
 * (which is where 17-year-olds buy this) a plain string is not a channel: it is
 * something you have to select, copy and paste into another app, from a page
 * you were mid-purchase on. The one place the product tells a locked-out or
 * refund-seeking student "write to us" was the one place writing to us took the
 * most work.
 *
 * Two states, one component:
 *  - address still a founder placeholder → inert text, exactly as before. A
 *    `mailto:[ИМЕЙЛ ЗА КОНТАКТ]` would be worse than no link: it opens a
 *    compose window addressed to a bracket and the student thinks she has
 *    written to someone.
 *  - address real → a `mailto:` anchor, everywhere, with no further edit. The
 *    switch is `contactEmailHref()` in lib/legal/identity.ts, so filling in one
 *    constant arms all five call sites at once.
 *
 * NOT a client component and it must not become one: it is rendered inside the
 * `"use client"` checkout island as well as inside four server components, and
 * it holds no state. React-free-ness of `lib/legal/identity` is what lets the
 * payments layer import the same constants without dragging React along; this
 * file is the React side of that split and stays a leaf.
 */

import { CONTACT_EMAIL, contactEmailHref } from "@/lib/legal/identity";

export function ContactEmail({
  className,
  /**
   * Override, for tests only — it is what lets both branches be rendered
   * without mocking a module constant. Every call site in the product omits it
   * so `CONTACT_EMAIL` stays the single source.
   */
  address = CONTACT_EMAIL,
}: {
  className?: string;
  address?: string;
}) {
  const href = contactEmailHref(address);

  if (!href) {
    // Placeholder: render the bracket text so the omission stays VISIBLE on the
    // page (that visibility is what makes the launch checklist self-enforcing),
    // but never as a link.
    return <span className={className}>{address}</span>;
  }

  return (
    <a
      href={href}
      className={
        className ??
        "font-semibold text-accent underline-offset-4 hover:underline"
      }
    >
      {address}
    </a>
  );
}
