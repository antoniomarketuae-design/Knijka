/**
 * =============================================================================
 * THE LAST HOP — READING A CALL SITE AS A TREE INSTEAD OF AS TEXT
 * =============================================================================
 *
 * WHY THIS EXISTS, and it is one sentence: **a substring catches DELETION and
 * not NEUTRALISATION.** That sentence has now survived being answered twice in
 * this lane. Round 11 asserted the render's wiring with `toContain`; appending
 * `|| true` to the condition it guarded left four suites green. Round 12 moved
 * every decision into a pure function and drove it — twelve interior mutations
 * went red — and the neutralisation simply moved one line up, into the ARGUMENT
 * LIST, where the guard was three `toContain` substrings again. Eight mutations
 * survived there; all eight were re-measured on this tree on 2026-08-20 before
 * this module was written, and every one was `tsc --noEmit` clean and left
 * `queueTaskEcho` + `taskCapThread` + `overlay-queue-moment` + `notify-column`
 * green at 4 files / 88 tests.
 *
 * THE MECHANISM THEY ALL USED: you do not DROP a required field, you PIN it.
 * `advisorOn,` → `advisorOn: true,` type-checks (the field is still `boolean`,
 * still present) and still contains every substring anyone wrote over it.
 *
 * SO THE FILE IS PARSED. `callSitesOf` returns, for a named callee, the exact
 * source text of each argument and — for object-literal arguments — the exact
 * initializer of every property, with a shorthand property reported as its own
 * name. A test then asserts that map with `toEqual`, which fails on a field
 * ADDED, a field REMOVED and a field PINNED in one assertion. `advisorOn: true`
 * reads as `"true"`, and so does `advisorOn: advisorOn || true` read as
 * `"advisorOn || true"` — the two neutralisations a substring accepted.
 *
 * ── WHAT THIS CANNOT DO, stated here rather than discovered later ───────────
 *
 * It does not execute anything. If the component deletes the call outright the
 * `count` assertion fires, but a component that stops rendering the queue
 * altogether is invisible to it, and so is any defect that needs React to run.
 * That residual is structural and shared: the vitest environment for this
 * package is `node`, there is no DOM, and `useFreshKey`/`useCompactHud` both
 * resolve in effects — so even an SSR pass over `LessonPlayShell` returns a
 * roomy stage with `taskFresh === false` and never builds a queue row at all.
 * `hud/__tests__/dashboard-publication.test.ts` records the same residual for
 * the same reason and in the same words.
 *
 * WHAT CLOSES THE REST is not this module: it is that the decisions AND the
 * argument construction now live in `lessonQueueBinding` / `hudPollUpdate`,
 * which the sibling test files drive with snapshots taken off real compiled
 * sessions. This holds only the last hop — component to binding — and the
 * callers self-check it by re-applying the eight mutations to the real file's
 * own text and failing if any is accepted.
 */

import ts from "typescript";

export interface CallSite {
  callee: string;
  /** Nearest enclosing named function declaration, or null at top level. */
  enclosing: string | null;
  /** Each argument's source text, runs of whitespace collapsed to one space. */
  args: string[];
  /**
   * For each argument that IS an object literal: property name → initializer
   * text. A shorthand property (`advisorOn,`) reports its own name, so pinning
   * it to a constant changes the value and the `toEqual` fails. `null` for any
   * argument that is not an object literal.
   */
  objectArgs: (Record<string, string> | null)[];
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

function parse(source: string): ts.SourceFile {
  // `setParentNodes` is required: the enclosing-function walk reads `.parent`.
  return ts.createSourceFile("shell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function enclosingFunction(node: ts.Node): string | null {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
  }
  return null;
}

function objectArgOf(arg: ts.Node, sf: ts.SourceFile): Record<string, string> | null {
  if (!ts.isObjectLiteralExpression(arg)) return null;
  const out: Record<string, string> = {};
  for (const p of arg.properties) {
    // A shorthand property IS the identifier; report it as its own name so a
    // pin (`advisorOn: true`) reads differently from the reference.
    if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = p.name.text;
    else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
      out[p.name.text] = flat(p.initializer.getText(sf));
    // A spread carries no name of its own, so it is reported under a key no
    // field can have: `{ ...queue.rows, fold: … }` must not read as clean.
    else out[`«${flat(p.getText(sf))}»`] = "spread-or-computed";
  }
  return out;
}

/** Every call to one of `callees`, in source order. */
export function callSitesOf(source: string, callees: readonly string[]): CallSite[] {
  const sf = parse(source);
  const want = new Set(callees);
  const out: CallSite[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = flat(n.expression.getText(sf));
      if (want.has(callee)) {
        out.push({
          callee,
          enclosing: enclosingFunction(n),
          args: n.arguments.map((a) => flat(a.getText(sf))),
          objectArgs: n.arguments.map((a) => objectArgOf(a, sf)),
        });
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/**
 * THE SAME READING, FOR A JSX MOUNT.
 *
 * A prop is an argument list with angle brackets, and it neutralises the same
 * way. `taskCapKmh={snap.taskCapKmh}` → `taskCapKmh={undefined && snap.taskCapKmh}`
 * type-checks (the prop is `number | undefined`), blanks the drill's ceiling on
 * every capped rung, and CONTAINS the substring a `toContain` would look for.
 * So the mounts are read as trees too: name → the exact expression inside the
 * braces, with a shorthand prop (`<X flag />`) reported as `"true"`.
 */
export function jsxPropsOf(source: string, tagName: string): Record<string, string>[] {
  const sf = parse(source);
  const out: Record<string, string>[] = [];
  const read = (attrs: ts.JsxAttributes): void => {
    const props: Record<string, string> = {};
    for (const a of attrs.properties) {
      if (ts.isJsxSpreadAttribute(a)) props[`«${flat(a.getText(sf))}»`] = "spread";
      else if (a.initializer === undefined) props[a.name.getText(sf)] = "true";
      else if (ts.isJsxExpression(a.initializer))
        props[a.name.getText(sf)] = flat(a.initializer.expression?.getText(sf) ?? "");
      else props[a.name.getText(sf)] = flat(a.initializer.getText(sf));
    }
    out.push(props);
  };
  const walk = (n: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(sf) === tagName) read(n.attributes);
    else if (ts.isJsxOpeningElement(n) && n.tagName.getText(sf) === tagName) read(n.attributes);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/**
 * THE SELF-CHECK'S OTHER HALF — the mutations, applied to the real file's own
 * text through the same tree, so a probe cannot pass by looking at a fixture
 * that no longer resembles the product.
 *
 * Each throws when the thing it was asked to mutate is not there. A silent
 * no-op reported as „the guard rejected it" is exactly the instrument bug this
 * project has shipped four times, and every one lied in the reassuring
 * direction.
 */
export function pinProperty(
  source: string,
  callee: string,
  argIndex: number,
  property: string,
  constant: string,
): string {
  const sf = parse(source);
  let edit: { start: number; end: number } | null = null;
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && flat(n.expression.getText(sf)) === callee) {
      const arg = n.arguments[argIndex];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (p.name && ts.isIdentifier(p.name) && p.name.text === property) {
            if (edit !== null) throw new Error(`pinProperty: ${callee}.${property} is ambiguous`);
            edit = { start: p.getStart(sf), end: p.getEnd() };
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (edit === null) throw new Error(`pinProperty: no ${callee}(arg${argIndex}).${property}`);
  const { start, end } = edit;
  return source.slice(0, start) + `${property}: ${constant}` + source.slice(end);
}

/** Replace one whole argument — the `fold: {…}` and `setSnap` shapes. */
export function replaceArgument(
  source: string,
  callee: string,
  argIndex: number,
  replacement: string,
  /** Which call, when the callee is used more than once (0-based). */
  occurrence = 0,
): string {
  const sf = parse(source);
  const found: ts.Node[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && flat(n.expression.getText(sf)) === callee) {
      const arg = n.arguments[argIndex];
      if (arg) found.push(arg);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  const arg = found[occurrence];
  if (arg === undefined)
    throw new Error(`replaceArgument: ${callee}(arg${argIndex})#${occurrence} not found`);
  return source.slice(0, arg.getStart(sf)) + replacement + source.slice(arg.getEnd());
}
