/**
 * The support address has to be CLICKABLE.
 *
 * `CONTACT_EMAIL` was interpolated as bare text in five places — the Terms, the
 * Privacy Policy, the operator card, the Contact page, and the recovery
 * instruction inside the checkout consent gate. On a phone, which is where
 * seventeen-year-olds buy this, a plain string is not a channel: it has to be
 * selected, copied and pasted into another app, from a page you are mid-purchase
 * on. The one place the product says "write to us" was the one place writing to
 * us took the most work.
 *
 * Two properties are pinned here, and the second is the one that keeps this
 * fixed after everyone forgets: no page may go back to interpolating the
 * constant directly.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactEmail } from "../ContactEmail";
import { CONTACT_EMAIL, contactEmailHref, isPlaceholder } from "@/lib/legal/identity";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Every .ts/.tsx under `dir`, recursively — fanned out rather than serial. This
 * box runs the tree on a 7200rpm HDD with several agents on it, and a serial
 * walk of src/app + src/components has already blown a 5s budget once.
 */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    }),
  );
  return nested.flat();
}

describe("contactEmailHref — the switch that arms every call site at once", () => {
  it("is null while the founder has not filled the constant in", () => {
    // `mailto:[ИМЕЙЛ ЗА КОНТАКТ]` is worse than no link: it opens a compose
    // window addressed to a bracket and the student believes she has written
    // to someone.
    expect(contactEmailHref("[ИМЕЙЛ ЗА КОНТАКТ]")).toBeNull();
  });

  it("becomes a real mailto the moment a real address is set", () => {
    expect(contactEmailHref("help@knijka.ai")).toBe("mailto:help@knijka.ai");
  });

  it("tracks the live constant — today still a placeholder", () => {
    expect(contactEmailHref()).toBe(
      isPlaceholder(CONTACT_EMAIL) ? null : `mailto:${CONTACT_EMAIL}`,
    );
  });
});

describe("<ContactEmail/>", () => {
  it("renders inert text — never a dead mailto — while it is a placeholder", () => {
    const html = renderToStaticMarkup(
      <ContactEmail address="[ИМЕЙЛ ЗА КОНТАКТ]" />,
    );
    expect(html).toContain("[ИМЕЙЛ ЗА КОНТАКТ]");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("<a ");
  });

  it("renders a mailto anchor the moment the address is real", () => {
    const html = renderToStaticMarkup(<ContactEmail address="help@knijka.ai" />);
    expect(html).toContain('href="mailto:help@knijka.ai"');
    expect(html).toContain("help@knijka.ai");
  });

  it("keeps the caller's styling when one is given (the Contact page hero)", () => {
    const html = renderToStaticMarkup(
      <ContactEmail address="help@knijka.ai" className="underline" />,
    );
    expect(html).toContain('class="underline"');
  });
});

describe("no page may interpolate the address as plain text again", () => {
  it("has zero `{CONTACT_EMAIL}` interpolations left under src/app and src/components", async () => {
    const files = [
      ...(await walk(path.join(SRC, "app"))),
      ...(await walk(path.join(SRC, "components"))),
    ].filter((f) => !f.endsWith("ContactEmail.tsx") && !/[\\/]__tests__[\\/]/.test(f));

    const offenders = (
      await Promise.all(
        files.map(async (file) => {
          const source = await readFile(file, "utf8");
          // JSX interpolation of the bare constant — what every one of the five
          // call sites used to do.
          return /\{\s*CONTACT_EMAIL\s*\}/.test(source)
            ? path.relative(SRC, file)
            : null;
        }),
      )
    ).filter((f): f is string => f !== null);

    expect(offenders, "render these through <ContactEmail/> instead").toEqual([]);
    // 30s, not the 5s default: this walks src/app + src/components on a 7200rpm
    // HDD that several agents share. It has already timed out here once, and a
    // flaky guard is a guard people delete.
  }, 30_000);

  it("still shows the address on all five surfaces — via the component", async () => {
    const surfaces = [
      "app/(legal)/terms/page.tsx",
      "app/(legal)/privacy/page.tsx",
      "app/(legal)/contact/page.tsx",
      "app/(legal)/legal-ui.tsx",
      // The checkout consent gate's recovery instruction: the one place a buyer
      // reads it with a card in her hand.
      "app/(dashboard)/checkout/consent-gate.tsx",
    ];
    for (const rel of surfaces) {
      const source = await readFile(path.join(SRC, rel), "utf8");
      expect(source, rel).toContain("<ContactEmail");
    }
  });
});
