// -----------------------------------------------------------------------------
// comment-blind.mjs — A COMMENT IS NOT A REPAIR, AND THE GATE MUST NOT BE FOOLED
// BY ONE.
//
// THE CLASS, measured on repair wave 14 (2026-08-30). Twenty lanes ran; eight of
// them wrote 495 lines into product files and not one line of code:
//
//     cabin.ts                 +68   code 0
//     roundabout.ts            +48   code 0
//     catalog.ts               +33   code 0
//     templates-merging.ts     +98   code 0
//     templates-junctions3.ts  +75   code 0
//     templates-conditions2.ts +72   code 0
//     templates-roundabout2.ts +55   code 0
//     templates-junctions2.ts  +46   code 0
//
// The analysis in them is often good, and keeping it beside the code it explains
// is ordinary engineering. The damage is elsewhere: `reclosure.mjs` refuses a
// re-closure when the row's own file is IDENTICAL between the two builds, and it
// asks git. A file carrying an added comment is not identical, so the gate lets
// the closure through — and the gate exists precisely because a judge can quote
// a real frame honestly while the product has not moved. An essay in a source
// file therefore buys a false certificate for every row addressed to that file.
//
// It is the dead-predicate class one level up: there, a repair ships a
// measurement nothing reads; here, a repair ships PROSE nothing executes, and
// the ledger moves anyway.
//
// WHY STRIPPING IS SAFE ENOUGH HERE. This runs on one question — "did the
// executable content of this file change?" — and both answers are conservative
// in the right direction. A comment mis-parsed as code makes the gate think the
// file moved, which is the OLD behaviour: no new closure is admitted that git
// would not already have admitted. Code mis-parsed as a comment could hide a
// real change, so the strip is deliberately dumb: it removes only what is
// unambiguously a comment, and treats anything it cannot classify as code.
//
// STRINGS ARE THE TRAP. `const s = "http://x"` contains `//`, and this file's
// own corpus is full of Bulgarian copy with URLs and slashes. So the scanner is
// a real character walk with string, template and regex-literal states, not a
// line regex — the line regex was tried first and stripped half of
// `templates-*.ts`'s student-facing text.
// -----------------------------------------------------------------------------

/**
 * Remove comments and blank lines from TS/TSX/JS source, leaving executable
 * content only. Quote-, template- and regex-aware.
 */
export function stripComments(src) {
  const s = String(src ?? "");
  let out = "";
  let i = 0;
  // What can legally precede a `/` that opens a REGEX rather than a division.
  const regexOk = () => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const c = out[k];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") continue;
      return !/[A-Za-z0-9_$)\]]/.test(c);
    }
    return true;
  };
  while (i < s.length) {
    const c = s[i];
    const d = s[i + 1];
    if (c === "/" && d === "/") {
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i += 1;
      while (i < s.length) {
        if (s[i] === "\\") {
          out += s[i] + (s[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += s[i];
        if (s[i] === q) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "/" && regexOk()) {
      // A regex literal. Consume to the closing slash, honouring classes.
      out += c;
      i += 1;
      let inClass = false;
      while (i < s.length) {
        if (s[i] === "\\") {
          out += s[i] + (s[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (s[i] === "[") inClass = true;
        else if (s[i] === "]") inClass = false;
        else if (s[i] === "/" && !inClass) {
          out += s[i];
          i += 1;
          break;
        } else if (s[i] === "\n") break; // not a regex after all; bail safely
        out += s[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\n");
}

/** True when two sources differ only in comments and whitespace. */
export function commentOnlyChange(a, b) {
  return stripComments(a) === stripComments(b);
}
