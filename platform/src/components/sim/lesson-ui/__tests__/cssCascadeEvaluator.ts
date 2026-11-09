/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PARSED-RULE CASCADE EVALUATOR FOR THE PHONE CORRIDOR — lane «swingcue»,
 * sc-ac-crosswind:a9db1738 clause 4 (2026-11-09).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. vitest runs in the `node` environment (vitest.config), so no
 * test here can ask a browser which rule won. Every CSS claim the swing-cue
 * yield makes — "the cue is drawn", "the column yields by visibility", "nothing
 * else moved" — is therefore decided HERE, over the RENDERED stylesheets (the
 * `renderToStaticMarkup` output, every `${…}` already resolved), never over the
 * source text. A source-text guard is what let a whole stylesheet rot into a
 * no-op in this project before (PlayAreaStyles: "It was correct CSS and it did
 * nothing").
 *
 * WHAT IT DECIDES, and the rule it follows when it cannot:
 *   · selectors: type, universal, class, attribute (= ^= $= *= ~= |=, i flag),
 *     the descendant / child / sibling combinators, :root, :first-child,
 *     :last-child, :only-child, :empty, :is(), :where(), :not() and :has()
 *     (relative selectors, any leading combinator). A pseudo-ELEMENT selector
 *     targets a box that is not the element, so it does not match the element
 *     (a decision, not a guess). ANY OTHER pseudo-class is UNKNOWN.
 *   · matching is three-valued (Kleene): a false part makes a compound false
 *     whatever else it holds, so `button:hover` never matches a <div>; an
 *     unknown part that the rest of the selector does not already refute makes
 *     the match UNKNOWN.
 *   · @media: orientation, prefers-reduced-motion, min/max-width/height in px
 *     or rem, `and`, `not`, `only`, comma lists; anything else is UNKNOWN.
 *     @supports is UNKNOWN. @keyframes / @font-face / @property are skipped
 *     (they hold no style rules). A nested `{` inside a style rule (CSS
 *     nesting) is a parse ERROR, never a silent skip.
 *   · the cascade winner per property: importance, then the style attribute,
 *     then layer (unlayered beats layered for normal declarations; the reverse
 *     for !important), then specificity, then order.
 *   · an UNKNOWN match or an UNKNOWN media condition on a rule that declares the
 *     property being decided makes that decision UNRESOLVED — the caller treats
 *     it as red. A matcher that cannot read must say so.
 */

export type Tri = true | false | "unknown";

const and3 = (a: Tri, b: Tri): Tri =>
  a === false || b === false ? false : a === "unknown" || b === "unknown" ? "unknown" : true;
const or3 = (a: Tri, b: Tri): Tri =>
  a === true || b === true ? true : a === "unknown" || b === "unknown" ? "unknown" : false;
const not3 = (a: Tri): Tri => (a === "unknown" ? "unknown" : !a);

/* ─────────────────────────────── the stylesheet ─────────────────────────── */

export interface CssDecl {
  prop: string;
  value: string;
  important: boolean;
}
export interface CssRule {
  /** The selector text as written (whitespace collapsed). */
  selectorText: string;
  selectors: string[];
  decls: CssDecl[];
  /** The at-rule preludes this rule sits inside, outermost first. */
  conditions: string[];
  /** Layer name, or null for unlayered. */
  layer: string | null;
  /** Document order across every sheet given to `parseSheets`. */
  order: number;
  /** The rule's own text, comments stripped, runs of whitespace collapsed. */
  raw: string;
  /** The rule's own text, comments stripped, every other byte as rendered. */
  rawExact: string;
  /** Which sheet it came from. */
  sheet: string;
}

function stripComments(css: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += css[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) throw new Error("css: unterminated comment");
      i = end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Index of the next top-level occurrence of any char in `stops`, skipping strings and (). */
function scanTo(s: string, from: number, stops: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (quote !== null) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && stops.includes(ch)) return i;
  }
  return -1;
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = scanTo(s, from, sep);
    if (at < 0) {
      out.push(s.slice(from));
      return out;
    }
    out.push(s.slice(from, at));
    from = at + 1;
  }
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

function parseDecls(body: string): CssDecl[] {
  if (scanTo(body, 0, "{}") >= 0) throw new Error(`css: nested block inside a style rule: ${body.slice(0, 80)}`);
  const out: CssDecl[] = [];
  for (const part of splitTop(body, ";")) {
    const t = part.trim();
    if (t === "") continue;
    const colon = t.indexOf(":");
    if (colon < 0) throw new Error(`css: declaration without a colon: ${t.slice(0, 60)}`);
    const prop = t.slice(0, colon).trim().toLowerCase();
    let value = collapse(t.slice(colon + 1));
    let important = false;
    const imp = /\s*!\s*important\s*$/i.exec(value);
    if (imp) {
      important = true;
      value = value.slice(0, imp.index).trim();
    }
    out.push({ prop: prop.startsWith("--") ? t.slice(0, colon).trim() : prop, value, important });
  }
  return out;
}

/** Find the `}` matching the `{` at `open`. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote !== null) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("css: unbalanced braces");
}

const SKIPPED_AT = /^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style)\b/i;

export function parseSheets(sheets: ReadonlyArray<{ name: string; css: string }>): CssRule[] {
  const rules: CssRule[] = [];
  let order = 0;
  const walk = (src: string, conditions: string[], layer: string | null, sheet: string) => {
    let i = 0;
    while (i < src.length) {
      const stop = scanTo(src, i, "{;}");
      if (stop < 0) {
        if (src.slice(i).trim() !== "") throw new Error(`css: trailing text ${src.slice(i, i + 60)}`);
        return;
      }
      const prelude = collapse(src.slice(i, stop));
      if (src[stop] === ";") {
        // @import / @layer a, b; / @charset — none carry style rules.
        if (prelude !== "" && !prelude.startsWith("@")) throw new Error(`css: stray text ${prelude.slice(0, 60)}`);
        i = stop + 1;
        continue;
      }
      if (src[stop] === "}") throw new Error(`css: stray } after ${prelude.slice(0, 60)}`);
      const close = matchBrace(src, stop);
      const body = src.slice(stop + 1, close);
      if (prelude.startsWith("@")) {
        if (SKIPPED_AT.test(prelude)) {
          // holds no style rules
        } else if (/^@layer\b/i.test(prelude)) {
          walk(body, conditions, collapse(prelude.slice(6)) || "anonymous", sheet);
        } else if (/^@(media|supports|container)\b/i.test(prelude)) {
          walk(body, [...conditions, prelude], layer, sheet);
        } else {
          throw new Error(`css: unknown at-rule ${prelude}`);
        }
      } else {
        const selectors = splitTop(prelude, ",").map(collapse).filter((s) => s !== "");
        rules.push({
          selectorText: prelude,
          selectors,
          decls: parseDecls(body),
          conditions,
          layer,
          order: order++,
          raw: collapse(src.slice(i, close + 1)),
          rawExact: src.slice(i, close + 1).replace(/^\s+/, ""),
          sheet,
        });
      }
      i = close + 1;
    }
  };
  for (const s of sheets) walk(stripComments(s.css), [], null, s.name);
  return rules;
}

/* ─────────────────────────────── the selector ───────────────────────────── */

type Combinator = " " | ">" | "+" | "~";
interface SimplePart {
  kind: "type" | "universal" | "class" | "id" | "attr" | "pseudo" | "pseudo-element" | "scope";
  name: string;
  op?: string;
  value?: string;
  ci?: boolean;
  args?: string;
}
interface Compound {
  parts: SimplePart[];
}
interface Complex {
  compounds: Compound[];
  combinators: Combinator[]; // combinators[i] sits between compounds[i] and compounds[i+1]
}

const IDENT = /^-?[_a-zA-Z\u00a0-\uffff\\][-_a-zA-Z0-9\u00a0-\uffff\\]*/;

function parseCompoundAt(s: string, i: number): [Compound, number] {
  const parts: SimplePart[] = [];
  while (i < s.length) {
    const ch = s[i];
    if (ch === "*") {
      parts.push({ kind: "universal", name: "*" });
      i++;
    } else if (ch === ".") {
      const m = IDENT.exec(s.slice(i + 1));
      if (!m) throw new Error(`selector: bad class in ${s}`);
      parts.push({ kind: "class", name: m[0].replace(/\\(.)/g, "$1") });
      i += 1 + m[0].length;
    } else if (ch === "#") {
      const m = IDENT.exec(s.slice(i + 1));
      if (!m) throw new Error(`selector: bad id in ${s}`);
      parts.push({ kind: "id", name: m[0] });
      i += 1 + m[0].length;
    } else if (ch === "[") {
      // Attribute values in this stylesheet never contain "]".
      const close = s.indexOf("]", i);
      if (close < 0) throw new Error(`selector: unterminated attribute in ${s}`);
      const inner = s.slice(i + 1, close).trim();
      const m = /^([-\w]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*([iIsS])?)?$/.exec(inner);
      if (!m) throw new Error(`selector: bad attribute [${inner}]`);
      parts.push({
        kind: "attr",
        name: m[1].toLowerCase(),
        op: m[2],
        value: m[3] ?? m[4] ?? m[5],
        ci: m[6] === "i" || m[6] === "I",
      });
      i = close + 1;
    } else if (ch === ":") {
      const isElement = s[i + 1] === ":";
      const start = i + (isElement ? 2 : 1);
      const m = /^[-a-zA-Z]+/.exec(s.slice(start));
      if (!m) throw new Error(`selector: bad pseudo in ${s}`);
      const name = m[0].toLowerCase();
      let j = start + m[0].length;
      let args: string | undefined;
      if (s[j] === "(") {
        let depth = 0;
        let k = j;
        for (; k < s.length; k++) {
          if (s[k] === "(") depth++;
          else if (s[k] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        args = s.slice(j + 1, k);
        j = k + 1;
      }
      const legacyElement = ["before", "after", "first-line", "first-letter"].includes(name);
      parts.push({ kind: isElement || legacyElement ? "pseudo-element" : "pseudo", name, args });
      i = j;
    } else {
      const m = IDENT.exec(s.slice(i));
      if (!m || parts.length > 0) break;
      parts.push({ kind: "type", name: m[0].toLowerCase() });
      i += m[0].length;
    }
  }
  return [{ parts }, i];
}

function parseComplex(sel: string, relative = false): Complex {
  const s = sel.trim();
  const compounds: Compound[] = [];
  const combinators: Combinator[] = [];
  let i = 0;
  if (relative) {
    // A relative selector: `:scope` is the anchor, a leading combinator binds to it.
    compounds.push({ parts: [{ kind: "scope", name: "scope" }] });
    const lead = /^\s*([>+~])\s*/.exec(s);
    if (lead) {
      combinators.push(lead[1] as Combinator);
      i = lead[0].length;
    } else combinators.push(" ");
  }
  while (i < s.length) {
    const [c, j] = parseCompoundAt(s, i);
    if (c.parts.length === 0) throw new Error(`selector: cannot parse «${s}» at ${i}`);
    compounds.push(c);
    i = j;
    const ws = /^\s*([>+~])?\s*/.exec(s.slice(i));
    if (!ws || ws[0] === "") {
      if (i < s.length) throw new Error(`selector: unexpected «${s.slice(i)}» in «${s}»`);
      break;
    }
    i += ws[0].length;
    if (i >= s.length) break;
    combinators.push((ws[1] as Combinator | undefined) ?? " ");
  }
  return { compounds, combinators };
}

export type Specificity = [number, number, number];
const addSpec = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cmpSpec = (a: Specificity, b: Specificity): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function specificityOf(sel: string): Specificity {
  return complexSpec(parseComplex(sel));
}
function complexSpec(c: Complex): Specificity {
  let s: Specificity = [0, 0, 0];
  for (const comp of c.compounds) for (const p of comp.parts) s = addSpec(s, partSpec(p));
  return s;
}
function maxListSpec(args: string, relative: boolean): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const a of splitTop(args, ",")) {
    const sp = complexSpec(parseComplex(a, relative));
    if (cmpSpec(sp, best) > 0) best = sp;
  }
  return best;
}
function partSpec(p: SimplePart): Specificity {
  switch (p.kind) {
    case "id":
      return [1, 0, 0];
    case "class":
    case "attr":
      return [0, 1, 0];
    case "type":
    case "pseudo-element":
      return [0, 0, 1];
    case "universal":
    case "scope":
      return [0, 0, 0];
    case "pseudo":
      if (p.name === "where") return [0, 0, 0];
      if (p.name === "is" || p.name === "not" || p.name === "matches")
        return maxListSpec(p.args ?? "", false);
      if (p.name === "has") return maxListSpec(p.args ?? "", true);
      return [0, 1, 0];
  }
}

/* ─────────────────────────────── the DOM model ──────────────────────────── */

export interface El {
  tag: string;
  /** A name for reports only. */
  name: string;
  attrs: Record<string, string>;
  classes: string[];
  /** Inline style declarations (the `style` attribute). */
  inline: CssDecl[];
  children: El[];
  parent: El | null;
}

export function el(
  tag: string,
  name: string,
  attrs: Record<string, string | undefined> = {},
  classes: string[] = [],
  inline: CssDecl[] = [],
  children: El[] = [],
): El {
  const a: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) a[k] = v;
  const node: El = { tag, name, attrs: a, classes, inline, children, parent: null };
  for (const c of children) c.parent = node;
  return node;
}

export function walkEls(root: El, f: (e: El) => void): void {
  f(root);
  for (const c of root.children) walkEls(c, f);
}

const siblingsBefore = (e: El): El[] => {
  if (e.parent === null) return [];
  const all = e.parent.children;
  return all.slice(0, all.indexOf(e));
};

function matchAttr(p: SimplePart, e: El): boolean {
  if (p.name === "class") {
    const v = e.classes.join(" ");
    if (p.op === undefined) return e.classes.length > 0;
    return attrOp(p, v);
  }
  if (!(p.name in e.attrs)) return false;
  if (p.op === undefined) return true;
  return attrOp(p, e.attrs[p.name]);
}
function attrOp(p: SimplePart, raw: string): boolean {
  const v = p.ci ? raw.toLowerCase() : raw;
  const w = p.ci ? (p.value ?? "").toLowerCase() : p.value ?? "";
  switch (p.op) {
    case "=":
      return v === w;
    case "^=":
      return w !== "" && v.startsWith(w);
    case "$=":
      return w !== "" && v.endsWith(w);
    case "*=":
      return w !== "" && v.includes(w);
    case "~=":
      return v.split(/\s+/).includes(w);
    case "|=":
      return v === w || v.startsWith(w + "-");
    default:
      throw new Error(`selector: attribute op ${p.op}`);
  }
}

/** The pseudo-classes this evaluator does not decide, collected for the report. */
export const unknownPseudos = new Set<string>();

function matchPart(p: SimplePart, e: El, scope: El | null): Tri {
  switch (p.kind) {
    case "universal":
      return true;
    case "type":
      return e.tag === p.name;
    case "class":
      return e.classes.includes(p.name);
    case "id":
      return e.attrs.id === p.name;
    case "attr":
      return matchAttr(p, e);
    case "scope":
      return scope === null ? e.tag === "html" : e === scope;
    case "pseudo-element":
      return false;
    case "pseudo": {
      const args = p.args ?? "";
      switch (p.name) {
        case "root":
          return e.parent === null;
        case "first-child":
          return e.parent !== null && e.parent.children[0] === e;
        case "last-child":
          return e.parent !== null && e.parent.children[e.parent.children.length - 1] === e;
        case "only-child":
          return e.parent !== null && e.parent.children.length === 1;
        case "empty":
          return e.children.length === 0;
        case "is":
        case "where":
        case "matches": {
          let r: Tri = false;
          for (const a of splitTop(args, ",")) r = or3(r, matchComplexAt(parseComplex(a), e, scope));
          return r;
        }
        case "not": {
          let r: Tri = false;
          for (const a of splitTop(args, ",")) r = or3(r, matchComplexAt(parseComplex(a), e, scope));
          return not3(r);
        }
        case "has": {
          let r: Tri = false;
          for (const a of splitTop(args, ",")) r = or3(r, hasRelative(parseComplex(a, true), e));
          return r;
        }
        default:
          unknownPseudos.add(p.name);
          return "unknown";
      }
    }
  }
}

function matchCompound(c: Compound, e: El, scope: El | null): Tri {
  let r: Tri = true;
  // Decide the cheap, refuting parts first; Kleene AND is order-free anyway.
  for (const p of c.parts) {
    r = and3(r, matchPart(p, e, scope));
    if (r === false) return false;
  }
  return r;
}

function matchFrom(c: Complex, idx: number, e: El, scope: El | null): Tri {
  const here = matchCompound(c.compounds[idx], e, scope);
  if (here === false || idx === 0) return here;
  const comb = c.combinators[idx - 1];
  let left: Tri = false;
  if (comb === ">") left = e.parent === null ? false : matchFrom(c, idx - 1, e.parent, scope);
  else if (comb === " ") {
    for (let a = e.parent; a !== null; a = a.parent) {
      left = or3(left, matchFrom(c, idx - 1, a, scope));
      if (left === true) break;
    }
  } else if (comb === "+") {
    const sib = siblingsBefore(e);
    left = sib.length === 0 ? false : matchFrom(c, idx - 1, sib[sib.length - 1], scope);
  } else {
    for (const s of siblingsBefore(e)) {
      left = or3(left, matchFrom(c, idx - 1, s, scope));
      if (left === true) break;
    }
  }
  return and3(here, left);
}

function matchComplexAt(c: Complex, e: El, scope: El | null): Tri {
  return matchFrom(c, c.compounds.length - 1, e, scope);
}

function hasRelative(rel: Complex, anchor: El): Tri {
  // Candidates: every element after the anchor in the relative sense — its
  // descendants for " " / ">", its following siblings (and their subtrees) for
  // "+" / "~". The anchor itself is the `:scope` compound.
  const cands: El[] = [];
  const first = rel.combinators[0];
  if (first === " " || first === ">") walkEls(anchor, (d) => d !== anchor && cands.push(d));
  else if (anchor.parent !== null) {
    const sibs = anchor.parent.children;
    for (const s of sibs.slice(sibs.indexOf(anchor) + 1)) walkEls(s, (d) => cands.push(d));
  }
  let r: Tri = false;
  for (const d of cands) {
    r = or3(r, matchFrom(rel, rel.compounds.length - 1, d, anchor));
    if (r === true) return true;
  }
  return r;
}

const parsedCache = new Map<string, Complex>();
export function matches(selector: string, e: El): Tri {
  let c = parsedCache.get(selector);
  if (c === undefined) {
    c = parseComplex(selector);
    parsedCache.set(selector, c);
  }
  return matchComplexAt(c, e, null);
}

/* ─────────────────────────────── @media ─────────────────────────────────── */

export interface Env {
  orientation: "landscape" | "portrait";
  widthPx: number;
  heightPx: number;
  reducedMotion: boolean;
}

function lengthPx(v: string): number | null {
  const m = /^(-?[\d.]+)(px|rem|em)$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * (m[2] === "px" ? 1 : 16);
}

function evalMediaFeature(f: string, env: Env): Tri {
  const m = /^\(\s*([-a-z]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(f.trim());
  if (!m) return "unknown";
  const [, name, val] = m;
  switch (name) {
    case "orientation":
      return val === env.orientation;
    case "prefers-reduced-motion":
      return val === "reduce" ? env.reducedMotion : val === "no-preference" ? !env.reducedMotion : "unknown";
    case "max-height":
    case "min-height":
    case "max-width":
    case "min-width": {
      const px = val === undefined ? null : lengthPx(val);
      if (px === null) return "unknown";
      const dim = name.endsWith("height") ? env.heightPx : env.widthPx;
      return name.startsWith("max") ? dim <= px : dim >= px;
    }
    default:
      return "unknown";
  }
}

function evalMediaQuery(q: string, env: Env): Tri {
  let s = q.trim();
  let negate = false;
  if (/^not\s/i.test(s)) {
    negate = true;
    s = s.slice(4).trim();
  }
  s = s.replace(/^only\s+/i, "");
  let r: Tri = true;
  for (const part of s.split(/\s+and\s+/i)) {
    const t = part.trim();
    if (t === "all" || t === "screen") continue;
    if (t === "print") r = false;
    else r = and3(r, evalMediaFeature(t, env));
  }
  return negate ? not3(r) : r;
}

export function evalCondition(prelude: string, env: Env): Tri {
  if (/^@media\b/i.test(prelude)) {
    let r: Tri = false;
    for (const q of splitTop(prelude.slice(6), ",")) r = or3(r, evalMediaQuery(q, env));
    return r;
  }
  return "unknown";
}

/* ─────────────────────────────── the cascade ────────────────────────────── */

export interface Candidate {
  value: string;
  important: boolean;
  inline: boolean;
  layer: string | null;
  spec: Specificity;
  order: number;
  selector: string;
  match: Tri;
}

export interface Winner {
  /** null = no declaration matched (the initial / inherited value applies). */
  value: string | null;
  important: boolean;
  selector: string | null;
  inline: boolean;
  layer: string | null;
  /** Set when an undecidable rule could have changed the answer. */
  unresolved: string | null;
}

/** Positive when `a` beats `b`. */
function beats(a: Candidate, b: Candidate): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  if (a.inline !== b.inline) return a.inline ? 1 : -1;
  const aLayered = a.layer !== null;
  const bLayered = b.layer !== null;
  if (aLayered !== bLayered) {
    // normal: unlayered wins; important: layered wins.
    const unlayeredWins = !a.important;
    return (aLayered ? -1 : 1) * (unlayeredWins ? 1 : -1);
  }
  return cmpSpec(a.spec, b.spec) || a.order - b.order;
}

export function candidatesFor(rules: readonly CssRule[], e: El, prop: string, env: Env): Candidate[] {
  const out: Candidate[] = [];
  for (const d of e.inline)
    if (d.prop === prop)
      out.push({ value: d.value, important: d.important, inline: true, layer: null, spec: [1, 0, 0], order: 1e9, selector: "style=", match: true });
  for (const r of rules) {
    const decls = r.decls.filter((d) => d.prop === prop);
    if (decls.length === 0) continue;
    let cond: Tri = true;
    for (const c of r.conditions) cond = and3(cond, evalCondition(c, env));
    if (cond === false) continue;
    // One candidate per selector that can match: the cascade then takes the
    // most specific decided one, and an undecided selector that would beat it
    // makes the answer UNRESOLVED (winnerFor) instead of being dropped.
    for (const sel of r.selectors) {
      const sm = matches(sel, e);
      if (sm === false) continue;
      const m = and3(sm, cond);
      const spec = specificityOf(sel);
      for (const d of decls)
        out.push({ value: d.value, important: d.important, inline: false, layer: r.layer, spec, order: r.order, selector: sel, match: m });
    }
  }
  return out;
}

export function winnerFor(rules: readonly CssRule[], e: El, prop: string, env: Env): Winner {
  const cands = candidatesFor(rules, e, prop, env);
  const sure = cands.filter((c) => c.match === true);
  let win: Candidate | null = null;
  for (const c of sure) if (win === null || beats(c, win) > 0) win = c;
  // An undecided candidate that would beat the decided winner (or stand alone)
  // makes the answer undecidable.
  const shaky = cands.find((c) => c.match === "unknown" && (win === null || beats(c, win) > 0));
  return {
    value: win?.value ?? null,
    important: win?.important ?? false,
    selector: win?.selector ?? null,
    inline: win?.inline ?? false,
    layer: win?.layer ?? null,
    unresolved: shaky ? `${prop} on ${e.name}: undecidable rule «${shaky.selector}»` : null,
  };
}

/** Which rules' selectors match `e` (true/unknown), by rule raw text — the match SET. */
export function matchSet(rules: readonly CssRule[], e: El, env: Env): { set: string[]; unresolved: string[] } {
  const set: string[] = [];
  const unresolved: string[] = [];
  for (const r of rules) {
    let cond: Tri = true;
    for (const c of r.conditions) cond = and3(cond, evalCondition(c, env));
    if (cond === false) continue;
    // Per SELECTOR, with the rule's declarations: a rule whose OTHER selectors
    // changed still reads as the same match for an element its unchanged
    // selector hits.
    const body = r.decls.map((d) => `${d.prop}: ${d.value}${d.important ? " !important" : ""}`).join("; ");
    for (const sel of r.selectors) {
      const m = and3(matches(sel, e), cond);
      if (m === true) set.push(`${r.conditions.join(" ")} | ${sel} { ${body} }`.trim());
      else if (m === "unknown") unresolved.push(`${r.conditions.join(" ")} | ${sel}`.trim());
    }
  }
  return { set, unresolved };
}

/* ─────────────────────────────── computed state ─────────────────────────── */

export interface Painted {
  /** display:none on the element or any ancestor. */
  displayNone: boolean;
  /** Computed visibility (inherited). */
  visibility: string;
  /** Drawn = rendered AND visible. */
  drawn: boolean;
  unresolved: string[];
}

export function painted(rules: readonly CssRule[], e: El, env: Env): Painted {
  const unresolved: string[] = [];
  let displayNone = false;
  for (let a: El | null = e; a !== null; a = a.parent) {
    const w = winnerFor(rules, a, "display", env);
    if (w.unresolved) unresolved.push(w.unresolved);
    if (w.value === "none") displayNone = true;
  }
  let visibility = "visible";
  const chain: El[] = [];
  for (let a: El | null = e; a !== null; a = a.parent) chain.unshift(a);
  for (const a of chain) {
    const w = winnerFor(rules, a, "visibility", env);
    if (w.unresolved) unresolved.push(w.unresolved);
    if (w.value !== null && w.value !== "inherit") visibility = w.value;
  }
  return { displayNone, visibility, drawn: !displayNone && visibility === "visible", unresolved };
}

/* ─────────────────────────────── lengths ────────────────────────────────── */

export interface LengthEnv {
  /** The containing block's height, px (the % base of `top`). */
  cbHeightPx: number;
  safeTopPx: number;
  /** env(safe-area-inset-right); absent = the fallback. */
  safeRightPx?: number;
  /** The viewport width, for vw. */
  viewportWidthPx?: number;
  vars: Record<string, number>;
}

/** Resolves calc()/max()/min()/env()/var() over px, rem and % to px. Throws on anything else. */
export function resolveLengthPx(value: string, env: LengthEnv): number {
  const s = value.trim();
  let i = 0;
  const peek = () => s[i];
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const expr = (): number => {
    let v = term();
    for (;;) {
      ws();
      const c = peek();
      if (c === "+" || c === "-") {
        i++;
        v = c === "+" ? v + term() : v - term();
      } else return v;
    }
  };
  const term = (): number => {
    let v = factor();
    for (;;) {
      ws();
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        const f = factor();
        v = c === "*" ? v * f : v / f;
      } else return v;
    }
  };
  const args = (): number[] => {
    const out: number[] = [];
    ws();
    if (s[i] !== "(") throw new Error(`length: expected ( in ${s}`);
    i++;
    for (;;) {
      out.push(expr());
      ws();
      if (s[i] === ",") {
        i++;
        continue;
      }
      if (s[i] === ")") {
        i++;
        return out;
      }
      throw new Error(`length: bad args in ${s}`);
    }
  };
  const factor = (): number => {
    ws();
    if (s[i] === "(") {
      i++;
      const v = expr();
      ws();
      if (s[i] !== ")") throw new Error(`length: unbalanced ${s}`);
      i++;
      return v;
    }
    const fn = /^(calc|max|min|env|var)\b/.exec(s.slice(i));
    if (fn) {
      i += fn[1].length;
      if (fn[1] === "env" || fn[1] === "var") {
        ws();
        i++; // (
        ws();
        const nm = /^[-\w]+/.exec(s.slice(i));
        if (!nm) throw new Error(`length: bad ${fn[1]} in ${s}`);
        i += nm[0].length;
        ws();
        let fallback: number | null = null;
        if (s[i] === ",") {
          i++;
          fallback = expr();
          ws();
        }
        if (s[i] !== ")") throw new Error(`length: bad ${fn[1]} close in ${s}`);
        i++;
        if (fn[1] === "env") {
          if (nm[0] === "safe-area-inset-top") return env.safeTopPx;
          if (nm[0] === "safe-area-inset-right" && env.safeRightPx !== undefined) return env.safeRightPx;
          if (fallback === null) throw new Error(`length: env ${nm[0]}`);
          return fallback;
        }
        if (nm[0] in env.vars) return env.vars[nm[0]];
        if (fallback === null) throw new Error(`length: unset var ${nm[0]}`);
        return fallback;
      }
      const a = args();
      if (fn[1] === "calc") {
        if (a.length !== 1) throw new Error("length: calc arity");
        return a[0];
      }
      return fn[1] === "max" ? Math.max(...a) : Math.min(...a);
    }
    const num = /^(-?[\d.]+)(px|rem|%|vw)?/.exec(s.slice(i));
    if (!num) throw new Error(`length: cannot read «${s.slice(i)}» in ${s}`);
    i += num[0].length;
    const n = Number(num[1]);
    if (num[2] === "px") return n;
    if (num[2] === "rem") return n * 16;
    if (num[2] === "%") return (n / 100) * env.cbHeightPx;
    if (num[2] === "vw") {
      if (env.viewportWidthPx === undefined) throw new Error("length: vw without a viewport");
      return (n / 100) * env.viewportWidthPx;
    }
    return n;
  };
  const v = expr();
  ws();
  if (i !== s.length) throw new Error(`length: trailing «${s.slice(i)}» in ${s}`);
  return v;
}
