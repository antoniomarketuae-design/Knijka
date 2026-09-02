/**
 * hazard.mjs — THE BRAKE THAT HAS A REASON.
 *
 * Pure functions only: no browser, no `page`, no screenshot. Everything here
 * takes strings the product painted on the glass and returns plain numbers and
 * booleans, so `__tests__/hazard.test.mjs` can watch every clause fail without
 * a sim — the same contract `guidance.mjs` holds for the steering law.
 *
 * ═══ WHAT WAS WRONG, MEASURED ══════════════════════════════════════════════
 *
 * THE HARNESS COULD BRAKE. IT COULD NOT BRAKE *FOR* ANYTHING. Its stop was a
 * metronome: `rollM >= 15` metres of integrated dial speed, or a 4 s cap, then
 * `STOP_MS` at rest, repeat. Six `brake()` call sites in `lesson-audit.mjs` and
 * not one of them was conditioned on the world — one speed cap, one blind rest
 * cadence, one careless-leg cadence, three releases.
 *
 * The control loop's whole view of the world was `probe()`: eight fields, of
 * which exactly one (`lawfulWait`) is a hazard signal at all — and the product
 * publishes that one ONLY to a car that has already stopped. `finish.ts`:
 *
 *     const stationary = Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH;
 *     const reason = stationary ? yieldReasonAt(...) : null;
 *
 * So the single world-input the pedal loop had is by construction post-hoc: it
 * can extend a stop, it can never start one. Read the four legs and you can
 * watch it happen. `sc-sp-eco-coast__pc-right` tracked the ribbon on 54/54
 * moving samples at 2.25° median error, stopped at t=24 s because the blind
 * 15-metre cadence happened to put it at rest where a red light was, was held
 * by the advisory, and when the advisory withdrew it had no input left and
 * drove into the next red under throttle. Its own debrief says «Задачите от
 * маршрута са изпълнени — този урок не пада заради маршрута». It completed
 * every route task and failed on the one thing it could not do.
 *
 * ═══ THE THREE THINGS THIS MODULE IS NOT ═══════════════════════════════════
 *
 * 1. IT IS NOT A JUDGEMENT. Nothing here reads or writes a verdict, a fault, a
 *    score, or anything under `platform/src/modules/sim/rules`. It is an INPUT
 *    to how the harness drives. The product grades what it always graded.
 *
 * 2. IT IS NOT A WORLD MODEL. It has no geometry, no signal phase, no
 *    pedestrian. It reads two chips the student is looking at and nothing else.
 *    `HAZARD_NOTE` below states what it is permanently blind to, and the drive
 *    prints that sentence on EVERY lane so that „0 hazard brakes" can never be
 *    read as „no hazards" — the `steering.note` precedent, for the same reason.
 *
 * 3. IT IS NOT A REPAIR. A harness change never closes a product defect. If the
 *    product stops showing a red light the drive must still fail; see the proof
 *    obligation below, which is the single most important paragraph in the file.
 *
 * ═══ WHY THIS CANNOT CERTIFY A BROKEN PRODUCT ══════════════════════════════
 *
 * THE GUARANTEE IS STRUCTURAL, NOT A MATTER OF CARE, and it rests on one
 * property of `hazardCommand`:
 *
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │ THE NEUTRAL COMMAND IS THE OLD DRIVE. For every reading in which no    │
 *   │ instrument is armed — and for every reading the harness FAILED to take │
 *   │ — `hazardCommand` returns `{brake:false, capKmh:null}`, which the roll │
 *   │ phase folds in as `brake(hz.brake || <old test>)` and                  │
 *   │ `min(paceTarget, capKmh ?? Infinity)`. Both are identities at the      │
 *   │ neutral value. So on a build that publishes nothing, this drive is the │
 *   │ pre-change metronome, tick for tick.                                   │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * Read that in the contrapositive, which is the claim that matters: THE ONLY
 * WAY THIS MODULE CAN CHANGE A DRIVE IS BY THE PRODUCT PUBLISHING AN
 * INSTRUMENT. A regression that removes the instrument removes the braking
 * with it and hands back the exact drive — and therefore the exact faults, and
 * therefore the exact verdict — that the lane produced before this file
 * existed. There is no reading, malformed input, thrown exception, or missing
 * element that makes the car MORE cautious than it was. Degradation is toward
 * the old behaviour, never toward safety, and that is deliberate: a harness
 * that got safer when it went blind would be a harness that passed a product
 * for breaking its own instruments. `__tests__/hazard.test.mjs` pins this in
 * both directions and treats it as the module's load-bearing property.
 *
 * FOUR MORE GUARDS, each closing a way the property above could be true and
 * the module still corrupt:
 *
 *   · IT IS OFF ON THE `wrong` LEG. The careless leg exists to prove the
 *     grader fires. A hazard brake there would suppress the very faults that
 *     are its entire purpose — the one place where „drives better" and „tests
 *     less" are the same act. `active` is `MODE === "right"`, full stop.
 *
 *   · IT CANNOT WIN BY STANDING STILL. A car that never moves books no
 *     collision, which is the one way a more cautious harness could
 *     manufacture a pass. Every hazard hold therefore has a ceiling
 *     (`HAZARD_HOLD_MAX_MS`); at the ceiling the loop gives up LOUDLY, rolls
 *     on, and counts an `overrun`. The share of the drive spent hazard-braking
 *     is published on the summary line, so a lane that crawled its way to a
 *     clean sheet says so in the same breath as the clean sheet.
 *
 *   · IT ONLY REPRODUCES WHAT THE STUDENT IS LOOKING AT. Both inputs are
 *     `role="status"` elements carrying an `aria-label`, mounted
 *     unconditionally in `LessonScene.tsx` (`FollowGapCue` at :2623,
 *     `GlanceEdgePings` at :2697) with no `NODE_ENV` gate anywhere in their
 *     files. No `window.__driveRig` (dev route, `notFound()` in production), no
 *     `window.__camProbe` (`process.env.NODE_ENV !== "production"`), no test id
 *     added to the product to make the harness work. Braking for these chips is
 *     the act of a student who read his own screen; it removes faults the
 *     HARNESS caused, not faults the PRODUCT caught.
 *
 *   · BLIND IS NOT CLEAR, AND BLIND DOES NOT BRAKE. A failed read returns
 *     `ok:false` and is counted under its reason; it is never coerced to „no
 *     hazard". But it does not brake either, and that is the interesting
 *     tension in this file: braking on blind frames is the REASSURING choice
 *     and it is the one that breaks the guarantee above, because it makes a
 *     build that publishes nothing drive differently — and more gently — than
 *     the baseline. So blindness is answered with a LOUD RECORD and an
 *     unchanged control law. A lane blind past `BLIND_SUSPECT_FRAC` is declared
 *     `state:"blind"` and its hazard evidence is worthless by its own summary.
 *
 * ═══ THREE HOLES AN ADVERSARIAL PASS FOUND IN THE FIRST CUT ════════════════
 *
 * All three failed in the SAME direction — the reassuring one — and they are
 * recorded here because „the guarantee is structural" is a claim about branches
 * that exist, and two of these branches did not:
 *
 *   1. A GLANCE CHIP WITH NO `aria-label` WAS DELETED. The collector pushed
 *      only non-empty labels, so a chip that was on the glass left an empty
 *      array behind and the books recorded a clean sighting of an empty road.
 *      Closed by `GLANCE_NO_LABEL` and the unparsed branch in `parseHazard`.
 *
 *   2. AN EMPTY-STRING `follow` LABEL READ AS „NO LEAD CAR". It matched neither
 *      the non-empty-string branch nor the non-string guard and fell through to
 *      `follow = null`. Closed by rejecting it as BLIND — see `parseHazard`.
 *
 *   3. THE HAZARD CAP CORRUPTED `pace.targets`, the array the drive report
 *      SENDS VERIFIERS TO before they file a pedestrian fault. A 6 км/ч row
 *      invented here was indistinguishable from one the authored tape asked
 *      for. Closed by `hazardPaceRow` / `hazardPaceProvenance` at the foot of
 *      this file: every row now names its author.
 *
 * None of the three changed the control law. Two of them made the LOG say what
 * the loop had been silently swallowing, which is the only repair available to
 * an instrument whose whole value is that it can be checked.
 *
 * ═══ WHAT IT CAN SEE, AND — LOUDER — WHAT IT CANNOT ════════════════════════
 *
 * A census of every `data-hud` value in `platform/src` returns 44 names. Of
 * those, exactly two are forward hazard instruments that are live while the car
 * is MOVING:
 *
 *   · `[data-hud="glance-ping"]` — `GlanceEdgePings.tsx:253`, `role="status"`,
 *     `aria-label="Погледни наляво преди кръстовището"`. Armed
 *     `GLANCE_PING_APPROACH_M = 45` m before a scan-graded stop line at
 *     `speedKmh >= 3` (`advisor.ts:1563,1569,1669`). A genuine PROACTIVE
 *     approach warning. Its own doc comment states the limit: `scanControlled`
 *     is `stopSign || giveWay` (`advisor.ts:1664`) — traffic lights never arm.
 *
 *   · `[data-hud="follow-gap"]` — `FollowGapCue.tsx:142`, `role="status"`,
 *     `aria-label` from `followCueLabelBg` = «Дистанция · N м · X с · нужни Y
 *     с». A live lead gap in metres against the grader's OWN safe gap
 *     (`followGap.ts:197`: `safeGapM = max(minGapM, mps * safeSeconds)`). Its
 *     limit: `leadGapMeters` reads `traffic.vehicles` only — `templates-
 *     hazards2.ts:48` says it flatly, „the staged dart is a PEDESTRIAN, and
 *     `leadGapMeters` reads the VEHICLE list only".
 *
 * AND THAT IS ALL THERE IS. The rest is stated as an absence because the
 * absence is the finding:
 *
 *   · NO SIGNAL-PHASE SURFACE EXISTS. `runtime.signalPhase` (`worldRuntime.ts`)
 *     reaches exactly two consumers — `traffic.update` (`LessonScene.tsx:4209`)
 *     and the trace recorder. It reaches NO HUD component. Neither does
 *     `nextStopLineM` / `nextStopLineControl`. A harness cannot brake for a red
 *     light it is not shown, and neither can a student looking at the HUD.
 *
 *   · NO PEDESTRIAN / VRU PROXIMITY INSTRUMENT EXISTS AT ALL, in the DOM or
 *     out of it. The whole pedestrian-yield vocabulary lives behind
 *     `stepYieldWait`'s `stationary` gate.
 *
 *   · THE ONE STUDENT-VISIBLE STOP COMMAND — «Спри на стоп-линията»
 *     (`guidanceRoute.ts:807`, `affordance: "halt"`) — is `ctx.fillText` into a
 *     canvas texture (`RouteGuidance.tsx:962`). Production, and the student
 *     sees it, but it is PIXELS, NOT DOM. Reaching it means OCR or a pixel test
 *     on the band the guidance loop already scans. Not attempted here, and not
 *     silently: it is the honest next lane.
 *
 * THE CONSEQUENCE, SAID PLAINLY BECAUSE IT LIMITS THE PRIZE: of the ten `right`
 * legs certified TRACKED that still booked a collision or a red, SEVEN die on a
 * signal or a pedestrian. This module cannot close those seven, and no amount
 * of care in this file can, because the product publishes no instrument for
 * them. What it addresses is the approach and the lead vehicle. Anyone reading
 * a green hazard line on a signal lesson is reading `HAZARD_NOTE`, which says
 * so on that very lane.
 */

/* ── THE CHIPS, AS THE PRODUCT WRITES THEM ────────────────────────────────── */

/** `GlanceEdgePings.tsx:258-261` — the PENDING label opens «Погледни» (imperative,
 *  „look"); the SATISFIED one opens «Погледна» («looked»). One letter apart, and
 *  they mean opposite things, so the test pins both. */
const GLANCE_PENDING_RE = /^\s*Погледни\s+(наляво|надясно)/u;
const GLANCE_DONE_RE = /^\s*Погледна\s+(наляво|надясно)/u;

/**
 * WHAT THE DRIVER PUSHES FOR A CHIP IT CANNOT READ — and the reason this
 * constant exists at all rather than being a literal in the page closure.
 *
 * MEASURED DEFECT, found by an adversarial pass on this very instrument. The
 * collector used to be `if (typeof l === "string" && l.trim() !== "")
 * glance.push(...)`, so a `[data-hud="glance-ping"]` element whose `aria-label`
 * was missing or empty was DROPPED FROM THE ARRAY — no marker, no `unparsed`,
 * no `ok:false`. `parseHazard` then computed `armed:false, pending:false` from
 * an empty list and the command fell to NEUTRAL: the chip was on the glass and
 * the books recorded a clean sighting of an empty road. That is the reassuring
 * direction, which is the direction every instrument bug in this programme has
 * failed in, and it is the exact hole the sibling follow-gap path had already
 * closed with `(badge on the glass, no aria-label)`.
 *
 * The marker is a non-empty string that matches NEITHER glance regex, so it
 * lands in the unparsed branch below: counted, `armed:true`, printed on the
 * HAZARD line. It does NOT cap the approach — an unreadable chip is not a
 * PENDING one, and inventing a cap from a chip whose phase this module cannot
 * see would be the module guessing at geometry. Seen loudly, acted on never:
 * blind must not read as clear, and blind must not brake.
 *
 * It is EXPORTED and handed to `page.evaluate` as an argument so the string the
 * driver writes and the string the parser and the test expect cannot drift
 * apart in three files.
 */
export const GLANCE_NO_LABEL = "(chip on the glass, no aria-label)";

/**
 * `followGap.ts:239-245` — «Дистанция · 8 м», plus «· 1,4 с» once the dial is
 * over `FOLLOW_CUE_MIN_SPEED_KMH`, plus «· нужни 2,0 с» ONLY when the level is
 * not `info`. That last clause is the product's own verdict on the gap and it
 * is the load-bearing token here: `followCueLabelBg` returns early for `info`,
 * so «нужни» present ⟺ `gapM < safeGapM` ⟺ the grader's own bar is broken.
 * The separator is U+00B7 and the decimal is a COMMA (`secondsBg` replaces the
 * point) — both are matched literally rather than normalised, because a label
 * that stops looking like this is a label this module must fail to parse
 * loudly rather than half-read.
 */
const FOLLOW_RE =
  /Дистанция\s*·\s*(\d+)\s*м(?:\s*·\s*(\d+,\d+)\s*с)?(?:\s*·\s*нужни\s*(\d+,\d+)\s*с)?/u;

/* ── THE CONSTANTS, AND WHERE EACH NUMBER COMES FROM ──────────────────────── */

/**
 * The speed the approach is capped to while a scan ping is PENDING (км/ч).
 *
 * Not taste. `GLANCE_PING_APPROACH_M` is 45 m and `ROLL_DISTANCE_M` is 15, so a
 * 12 км/ч cruise fits three roll-and-look cadences inside the window and a
 * 6 км/ч one fits the same three with half the actuation overshoot — and
 * overshoot is the whole problem, since every pedal change is a CDP round trip
 * measured at 2.0 s median on the pc leg (see `CRUISE_KMH`'s note). Halving the
 * speed halves the metres the car travels between deciding to lift and lifting.
 * It is not zero because a car that stops dead 45 m short of a give-way line
 * has not approached it, it has abandoned the lesson.
 */
export const HAZARD_APPROACH_KMH = 6;

/**
 * A lead gap this short is braked for whatever the product's level says (m).
 *
 * `followGap.ts` mutes its own level below `followMinSpeedKmh` (queue traffic
 * rolls in formation), so a crawling car closing on a stopped one gets
 * «Дистанция · 3 м» with no «нужни» clause and no colour. Four metres is inside
 * this car's own stopping distance at the 12 км/ч cruise once the ~2 s
 * actuation latency is paid, so it is braked on the metre reading alone.
 */
export const FOLLOW_HARD_METRES = 4;

/**
 * The ceiling on ONE continuous hazard hold (ms).
 *
 * This is the anti-standstill guard and it is the reason the module cannot buy
 * a clean sheet with inaction. Sized off the product's own patience: the drive
 * loop already gives a lawful wait `LAWFUL_WAIT_MAX_MS` = 45 s because
 * `finish.ts` YIELD_WAIT_MAX_S is 180. A hazard hold is NOT a lawful wait — the
 * product has not declared this stop correct, the harness inferred it — so it
 * gets a quarter of that and then has to justify itself in the log.
 */
export const HAZARD_HOLD_MAX_MS = 12_000;

/** After an overrun, how long follow-gap braking stays suppressed (ms). Without
 *  it the next tick re-brakes on the same unmoving obstacle and the „give up
 *  and roll on" is a sentence in the log describing something that did not
 *  happen. The hazard is still SEEN and still counted while cooling — see
 *  `suppressed` — because a deliberately ignored hazard is data, not silence. */
export const HAZARD_COOLDOWN_MS = 8_000;

/** Blind on this share of reads ⇒ the lane's hazard evidence is worthless and
 *  says so. A quarter, matching the spirit of the guidance loop's own
 *  „seen on n/m moving samples" verdict bands: below three-quarters sighted,
 *  nobody should quote this instrument. */
export const BLIND_SUSPECT_FRAC = 0.25;

/**
 * THE SENTENCE EVERY LANE PRINTS, WHATEVER HAPPENED.
 *
 * `steering.note`'s precedent, and for the identical reason: the failure this
 * whole programme keeps repeating is silence being read as sufficiency. „0
 * hazard brakes" on a red-light lesson does not mean the car handled the red.
 * It means this module has never been able to see one.
 */
export const HAZARD_NOTE =
  "THE HAZARD LOOP SEES TWO CHIPS AND NOTHING ELSE: [data-hud=\"glance-ping\"] (a scan-graded stop line — стоп/пропусни " +
  "— within 45 m) and [data-hud=\"follow-gap\"] (the gap to a lead VEHICLE). IT IS PERMANENTLY BLIND TO TRAFFIC " +
  "SIGNALS, TO PEDESTRIANS AND TO STATIC OBSTACLES, because the product publishes no DOM instrument for any of the " +
  "three: runtime.signalPhase reaches no HUD component, there is no VRU proximity surface anywhere, and the one " +
  "student-visible «Спри на стоп-линията» command is fillText into a canvas texture, not DOM. NO FINDING ABOUT " +
  "STOPPING FOR A RED, A PEDESTRIAN OR AN OBSTACLE MAY BE DRAWN FROM A GREEN LINE HERE — on those lessons this " +
  "instrument is not passing, it is absent.";

/** The neutral command: what the drive did before this module existed. Frozen
 *  so a caller cannot mutate the shared identity and quietly re-arm braking. */
export const NEUTRAL = Object.freeze({
  brake: false,
  capKmh: null,
  cls: null,
  reason: null,
  blind: false,
  suppressed: false,
  overrun: false,
});

/* ── READING THE GLASS ────────────────────────────────────────────────────── */

/**
 * Turn what `page.evaluate` handed back into a structured reading.
 *
 * STRICT ON PURPOSE. Anything that is not a well-formed, `ok:true` payload is
 * BLIND, not clear — including `null`, a non-object, a missing `ok`, a `glance`
 * that is not an array, AND AN EMPTY-OR-WHITESPACE `follow` STRING. That last
 * one was the hole in this very list: it matched neither the „is a non-empty
 * string" branch nor the „is not a string" guard, fell through to
 * `follow = null`, and `null` is this module's word for „no lead car". A
 * docstring claiming to be strict is not a guard; the branch below is.
 * Every instrument bug in this programme's history failed in the reassuring
 * direction; the reassuring direction here is „nothing was armed", so the
 * parser refuses to reach it by accident.
 *
 * THE SAME SHAPE ON THE GLANCE SIDE: a chip entry that is not a usable string
 * is `unparsed`, never absent — an element that was on the glass may not leave
 * the books as an empty road. See `GLANCE_NO_LABEL`.
 *
 * A label that is PRESENT but does not match `FOLLOW_RE` is likewise not „no
 * lead car" — it is `follow: {present:true, parsed:false}`, which the command
 * treats as a hazard of unknown magnitude and the summary counts separately. A
 * product that changes its badge copy must show up as a parse failure, not as a
 * quiet return to the metronome.
 */
export function parseHazard(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return blindReading("the hazard probe returned no object at all");
  }
  if (raw.ok !== true) {
    return blindReading(
      typeof raw.why === "string" && raw.why.trim() !== "" ? raw.why : "the hazard probe reported ok:false with no reason",
    );
  }
  if (!Array.isArray(raw.glance)) {
    return blindReading("the hazard probe returned a non-array for the glance chips");
  }

  let pendingLeft = false;
  let pendingRight = false;
  let done = 0;
  let unparsedGlance = 0;
  let firstUnparsed = null;
  for (const entry of raw.glance) {
    if (typeof entry !== "string" || entry.trim() === "") {
      // A CHIP WHOSE LABEL NEVER ARRIVED, and this branch is REACHED, not
      // hypothetical. The driver pushes `GLANCE_NO_LABEL` for a missing or
      // empty `aria-label`, but the marker travels through `page.evaluate`'s
      // argument object and the day that argument goes missing the closure
      // pushes `undefined`, which CDP serialises to `null` and which arrives
      // here. Either way the chip is not deleted: it is counted, it arms the
      // approach, and it is printed. The one thing it must never do is vanish.
      unparsedGlance += 1;
      firstUnparsed = firstUnparsed ?? (typeof entry === "string" ? entry : `a ${entry === null ? "null" : typeof entry} entry`);
      continue;
    }
    const p = GLANCE_PENDING_RE.exec(entry);
    if (p !== null) {
      if (p[1] === "наляво") pendingLeft = true;
      else pendingRight = true;
      continue;
    }
    if (GLANCE_DONE_RE.test(entry)) {
      done += 1;
      continue;
    }
    // A chip is on the glass and this module cannot read it. Not "off".
    unparsedGlance += 1;
    firstUnparsed = firstUnparsed ?? entry;
  }

  const rawFollow = raw.follow;
  let follow = null;
  if (rawFollow !== null && rawFollow !== undefined && typeof rawFollow !== "string") {
    return blindReading("the hazard probe returned a non-string for the follow-gap label");
  }
  if (typeof rawFollow === "string" && rawFollow.trim() === "") {
    /* THE HOLE IN THE STRICT LIST, and it was open. An empty or all-whitespace
     * label matched neither the `typeof === "string" && trim() !== ""` branch
     * nor the non-string guard, so it FELL THROUGH to `follow = null` — and
     * `follow === null` is this module's word for „no lead car". A badge whose
     * copy went missing was therefore read as an empty road ahead, silently,
     * with `ok:true`.
     *
     * The driver cannot produce this any more (it sends the marker instead),
     * which is exactly why it must be rejected here: the ONLY way an empty
     * string now reaches this line is a payload that broke its own contract,
     * and a broken contract is BLIND. Not braked for — blind never brakes, see
     * the header's fourth guard — but counted, keyed in `blindWhy`, and
     * capable of tipping the lane to `state:"blind"` on its own. */
    return blindReading("the hazard probe returned an empty string for the follow-gap label — a badge with no copy is not an absent badge");
  }
  if (typeof rawFollow === "string") {
    const m = FOLLOW_RE.exec(rawFollow);
    if (m === null) {
      follow = { present: true, parsed: false, meters: null, heldSec: null, needSec: null, short: false, label: rawFollow };
    } else {
      const meters = Number(m[1]);
      const heldSec = m[2] === undefined ? null : Number(m[2].replace(",", "."));
      const needSec = m[3] === undefined ? null : Number(m[3].replace(",", "."));
      follow = {
        present: true,
        parsed: true,
        meters,
        heldSec,
        needSec,
        // «нужни» is emitted ONLY for warn/danger — the product's own bar, not
        // one this module invented. See FOLLOW_RE's note.
        short: needSec !== null,
        label: rawFollow,
      };
    }
  }
  // …and `null`/`undefined` — a badge that is NOT MOUNTED — is the one shape
  // that legitimately leaves `follow` null. It is the product's own honesty
  // contract (`stepFollowCue`: "no vehicle reported ⇒ no badge, from ANY
  // state"), and it is the only reading this module accepts as „no lead car".

  return {
    ok: true,
    why: null,
    glance: {
      pending: pendingLeft || pendingRight,
      pendingLeft,
      pendingRight,
      done,
      unparsed: unparsedGlance,
      /** The first entry this module could not read, for the log to name — the
       *  marker when a label was missing, the drifted copy when it was not. */
      firstUnparsed,
      /** A chip of ANY kind is up ⇒ a scan-graded line is inside 45 m. The
       *  „done" phase is a fading confirmation on a line not yet crossed, so it
       *  still means „you are on an approach". */
      armed: pendingLeft || pendingRight || done > 0 || unparsedGlance > 0,
    },
    follow,
  };
}

function blindReading(why) {
  return { ok: false, why, glance: null, follow: null };
}

/* ── THE CONTROL LAW ──────────────────────────────────────────────────────── */

/**
 * What to do about the world, this tick.
 *
 * @param reading  a `parseHazard` result.
 * @param ctx      `{ kmh, holdMs, cooling }` — the dial, how long the CURRENT
 *                 continuous hazard hold has run (ms), and whether an overrun
 *                 cooldown is in force.
 * @returns `{brake, capKmh, cls, reason, blind, suppressed, overrun}`.
 *
 * COMPOSITION, AND IT IS THE WHOLE SAFETY ARGUMENT. `capKmh` is folded by the
 * caller as `min(paceTarget, capKmh ?? Infinity)` and `brake` as
 * `hz.brake || <the existing speed-cap test>`. Both fold to the identity at the
 * neutral value, so every path that returns `NEUTRAL` — no instrument, blind
 * read, malformed payload, cooling — is the pre-change drive exactly. There is
 * deliberately no path that returns a MORE cautious command than the world
 * justifies, because that path is how a harness passes a broken product.
 *
 * ORDER IS SEVERITY. A lead vehicle inside the grader's own safe gap outranks
 * an approach cap: one is metres from contact and the other is a speed limit.
 */
export function hazardCommand(reading, ctx = {}) {
  const kmh = typeof ctx.kmh === "number" ? ctx.kmh : -1;
  const holdMs = typeof ctx.holdMs === "number" && ctx.holdMs > 0 ? ctx.holdMs : 0;
  const cooling = ctx.cooling === true;

  if (reading === null || typeof reading !== "object" || reading.ok !== true) {
    // BLIND. Recorded, never assumed clear — and never braked for, see the
    // header's fourth guard. The `why` rides along so the log can name it.
    return {
      ...NEUTRAL,
      blind: true,
      reason: reading !== null && typeof reading === "object" && typeof reading.why === "string"
        ? reading.why
        : "the hazard reading was unusable",
    };
  }

  const f = reading.follow;
  const followHazard =
    f !== null &&
    f.present === true &&
    // Unparseable label = hazard of unknown magnitude. A badge is only rendered
    // at all when `leadGapMeters` returned a finite reading (`stepFollowCue`'s
    // own honesty contract: "no vehicle reported ⇒ no badge, from ANY state"),
    // so its mere presence means there IS a car ahead and inside cue range.
    (f.parsed !== true || f.short === true || (typeof f.meters === "number" && f.meters <= FOLLOW_HARD_METRES));

  if (followHazard) {
    const why =
      f.parsed !== true
        ? `a follow-gap badge is up and its copy no longer parses («${String(f.label).slice(0, 60)}»)`
        : f.short === true
          ? `lead gap ${f.meters} m / ${fmtSec(f.heldSec)} s against ${fmtSec(f.needSec)} s required`
          : `lead gap ${f.meters} m — inside the ${FOLLOW_HARD_METRES} m floor with no graded level published`;

    if (cooling) {
      // Seen, counted, deliberately not acted on. The log says so.
      return { ...NEUTRAL, cls: "follow-gap", reason: `${why} — SUPPRESSED, still cooling off an overrun`, suppressed: true };
    }
    if (holdMs >= HAZARD_HOLD_MAX_MS) {
      // THE ANTI-STANDSTILL CEILING. Give up, roll on, and make the lane say it
      // did: a clean sheet bought by never moving is the failure mode this
      // branch exists to make impossible.
      return {
        ...NEUTRAL,
        cls: "follow-gap",
        reason: `${why} — but the hold has run ${Math.round(holdMs / 1000)}s past its ${HAZARD_HOLD_MAX_MS / 1000}s ceiling; rolling on`,
        overrun: true,
      };
    }
    return { ...NEUTRAL, brake: true, cls: "follow-gap", reason: why };
  }

  if (reading.glance !== null && reading.glance.pending === true) {
    // A speed CAP, not a stop. The chip says a scan-graded line is inside 45 m
    // and the scan has not been made; it does not say where the line is, and a
    // module that stopped dead on it would be inventing geometry it cannot see.
    return {
      ...NEUTRAL,
      capKmh: HAZARD_APPROACH_KMH,
      cls: "glance-approach",
      reason: `a scan-graded stop line is inside ${45} m and the ${sides(reading.glance)} glance is still pending — approach capped to ${HAZARD_APPROACH_KMH} км/ч`,
    };
  }

  // Read fine, nothing armed. The old drive, by construction.
  void kmh;
  return NEUTRAL;
}

function sides(g) {
  if (g.pendingLeft && g.pendingRight) return "left and right";
  return g.pendingLeft ? "left" : "right";
}

function fmtSec(v) {
  return typeof v === "number" ? v.toFixed(1) : "?";
}

/* ── THE ACCOUNTING ───────────────────────────────────────────────────────── */

/** A fresh books object. `active:false` means the loop deliberately did not run
 *  on this lane (the `wrong` leg), which is a different word from „saw
 *  nothing" and must never collapse into it. */
export function createHazardBooks(active, mode) {
  return {
    wired: true,
    mode: mode ?? null,
    active: active === true,
    reads: 0,
    blind: 0,
    blindWhy: {},
    brakeEpisodes: 0,
    brakeMs: 0,
    capEpisodes: 0,
    capMs: 0,
    overruns: 0,
    suppressed: 0,
    seen: { glancePending: 0, glanceArmed: 0, glanceUnparsed: 0, followPresent: 0, followShort: 0, followUnparsed: 0 },
    byClass: {},
    state: "untested",
    why: "the hazard loop has not run yet",
    note: HAZARD_NOTE,
  };
}

/**
 * Fold one tick into the books. Pure: takes the elapsed ms since the previous
 * tick rather than reading a clock, so the test can drive it deterministically.
 */
export function observeHazardTick(books, reading, cmd, dtMs) {
  const dt = typeof dtMs === "number" && dtMs > 0 ? dtMs : 0;
  books.reads += 1;
  if (cmd.blind) {
    books.blind += 1;
    const k = cmd.reason ?? "unstated";
    books.blindWhy[k] = (books.blindWhy[k] ?? 0) + 1;
    return books;
  }
  if (reading.ok === true) {
    if (reading.glance !== null) {
      if (reading.glance.pending) books.seen.glancePending += 1;
      if (reading.glance.armed) books.seen.glanceArmed += 1;
      // A CHIP THAT WAS ON THE GLASS AND COULD NOT BE READ GETS ITS OWN
      // COLUMN, exactly as the follow badge's does. Folding it into
      // `glanceArmed` alone would leave the line reading „saw glance 0/1
      // pending/armed", which a reader takes for a satisfied «Погледна» — the
      // reassuring direction again, one level up.
      if (reading.glance.unparsed > 0) books.seen.glanceUnparsed += 1;
    }
    if (reading.follow !== null) {
      books.seen.followPresent += 1;
      if (reading.follow.short) books.seen.followShort += 1;
      if (reading.follow.parsed !== true) books.seen.followUnparsed += 1;
    }
  }
  if (cmd.overrun) books.overruns += 1;
  if (cmd.suppressed) books.suppressed += 1;
  if (cmd.cls !== null && (cmd.brake || cmd.capKmh !== null)) {
    const row = books.byClass[cmd.cls] ?? (books.byClass[cmd.cls] = { episodes: 0, ms: 0 });
    row.ms += dt;
    if (cmd.brake) books.brakeMs += dt;
    if (cmd.capKmh !== null) books.capMs += dt;
  }
  return books;
}

/** Called on the RISING EDGE only — a brake held for twenty ticks is one act of
 *  braking, not twenty, and a count that says otherwise flatters the loop. */
export function countHazardEpisode(books, cls, kind) {
  const row = books.byClass[cls] ?? (books.byClass[cls] = { episodes: 0, ms: 0 });
  row.episodes += 1;
  if (kind === "brake") books.brakeEpisodes += 1;
  else books.capEpisodes += 1;
  return books;
}

/**
 * The verdict on the INSTRUMENT — never on the drive.
 *
 * Four words, and „idle" is the one that must not be mistaken for a pass:
 *   "off"    the loop did not run (the `wrong` leg, by design)
 *   "blind"  it could not read the glass often enough to be quoted
 *   "live"   it read the glass and acted on it at least once
 *   "idle"   it read the glass throughout and nothing was ever armed — which
 *            on a signal or pedestrian lesson is the EXPECTED reading and means
 *            precisely nothing about whether the car handled the hazard
 */
export function finishHazardBooks(books) {
  if (!books.active) {
    books.state = "off";
    books.why =
      `MODE is «${books.mode}» — the hazard loop runs on the "right" leg only. The careless leg exists to prove the ` +
      "grader fires, and a harness that braked for hazards there would suppress the faults that are its whole purpose.";
    return books;
  }
  if (books.reads === 0) {
    books.state = "blind";
    books.why = "the drive never took a hazard reading at all — this lane can say nothing about stopping for anything.";
    return books;
  }
  const blindFrac = books.blind / books.reads;
  if (blindFrac >= BLIND_SUSPECT_FRAC) {
    books.state = "blind";
    const top = Object.entries(books.blindWhy).sort((a, b) => b[1] - a[1])[0];
    books.why =
      `the hazard chips could not be read on ${books.blind} of ${books.reads} ticks ` +
      `(${Math.round(blindFrac * 100)}%, over the ${Math.round(BLIND_SUSPECT_FRAC * 100)}% bar)` +
      (top ? `, mostly «${top[0]}»` : "") +
      ". NOTHING ON THIS LANE'S HAZARD LINE MAY BE QUOTED — a loop that cannot see did not decide the road was clear.";
    return books;
  }
  if (books.brakeEpisodes > 0 || books.capEpisodes > 0) {
    books.state = "live";
    books.why =
      `read the glass on ${books.reads - books.blind} of ${books.reads} ticks and acted ` +
      `${books.brakeEpisodes + books.capEpisodes} time(s).`;
    return books;
  }
  books.state = "idle";
  const sighted = books.seen.glanceArmed + books.seen.followPresent;
  books.why =
    sighted === 0
      ? `read the glass on ${books.reads - books.blind} of ${books.reads} ticks and NEITHER CHIP WAS EVER ARMED. ` +
        "That is not „the road was clear“: it is the only reading possible on a lesson whose hazard is a signal, a " +
        "pedestrian or a static obstacle, none of which the product publishes."
      : // A CHIP WAS UP AND THE LOOP NEVER ACTED, which is a different sentence
        // and must not borrow the one above. It happens legitimately — a
        // satisfied «Погледна», a comfortable lead gap — and it also happens
        // when a chip was UNREADABLE, which is the reassuring-direction failure
        // this state must never dress up as „nothing was there".
        `read the glass on ${books.reads - books.blind} of ${books.reads} ticks and NEVER ACTED, though a chip was up ` +
        `on ${sighted} of them (glance armed ${books.seen.glanceArmed}` +
        (books.seen.glanceUnparsed ? `, of which ${books.seen.glanceUnparsed} UNREADABLE` : "") +
        `, follow badge ${books.seen.followPresent}). None met the control law's bar — a satisfied glance and a ` +
        "comfortable gap both read like this, and so does a chip whose label this loop could not parse. It is still " +
        "not „the road was clear“.";
  return books;
}

/**
 * The run.log line. Built here rather than in the driver so the test can pin
 * the words — a capability nobody can audit is one nobody can trust, and the
 * audit surface IS this sentence.
 */
export function hazardLine(books) {
  const cls = Object.entries(books.byClass)
    .map(([k, v]) => `${k} ×${v.episodes}/${Math.round(v.ms / 1000)}s`)
    .sort()
    .join(" · ");
  return (
    `  HAZARD: ${books.state.toUpperCase()} · ${books.brakeEpisodes} brake(s) for a reason ` +
    `(${Math.round(books.brakeMs / 1000)}s) · ${books.capEpisodes} approach cap(s) (${Math.round(books.capMs / 1000)}s) · ` +
    `blind on ${books.blind}/${books.reads} ticks` +
    (books.overruns ? ` · ${books.overruns} overrun(s) — a hold hit its ceiling and rolled on` : "") +
    (books.suppressed ? ` · ${books.suppressed} tick(s) suppressed while cooling` : "") +
    (cls ? ` · ${cls}` : "") +
    ` · saw glance ${books.seen.glancePending}/${books.seen.glanceArmed} pending/armed` +
    (books.seen.glanceUnparsed ? ` (${books.seen.glanceUnparsed} UNREADABLE — a chip was on the glass)` : "") +
    `, follow-gap ${books.seen.followShort}/${books.seen.followPresent} short/present` +
    (books.seen.followUnparsed ? ` (${books.seen.followUnparsed} UNPARSEABLE)` : "")
  );
}

/* ── THE PROVENANCE OF A PACE TARGET ──────────────────────────────────────── */

/**
 * ONE ROW OF `pace.targets`, WITH THE HAZARD LOOP'S FINGERPRINTS ON IT.
 *
 * ═══ WHY THIS LIVES IN THE HAZARD MODULE ═══════════════════════════════════
 *
 * Because the hazard cap is what made the row ambiguous. `pace` is documented
 * as „the authored shadow's speed-by-distance profile" and `pace.targets` as
 * „every CHANGE of target"; it is written to `_audit-status.json`, and the
 * drive report instructs a verifier IN WRITING:
 *
 *     «Непропускане на пешеходец» on this lane has to be read against
 *     pace.targets in _audit-status.json before it is filed against the
 *     product.
 *
 * The roll phase then began pushing `min(paced, hz.capKmh)` into that same
 * array under the same field name. A 6 км/ч row invented by
 * `HAZARD_APPROACH_KMH` became indistinguishable from a 6 км/ч row the
 * authored tape asked for — so the surface a verifier is SENT TO in order to
 * decide whether a pedestrian fault belongs to the product had a second author
 * and did not say so. That is not a decorative field, and a harness that
 * quietly co-signs the tape's name is a harness manufacturing evidence about
 * its own caution.
 *
 * So every row now carries all three numbers: what the car was asked for, what
 * the PACE LAW alone asked for, and what the hazard loop lowered it to. A
 * reader adjudicating a pedestrian finding reads `pacedKmh`; a reader asking
 * why the car crawled reads `hazardCapKmh`.
 *
 * @param prev the previous row, or null/undefined.
 * @param at   `{ tSec, odoM, pacedKmh, capKmh }` — the clock, the odometer, the
 *             pace law's own target, and the hazard cap in force (or null).
 * @returns the row to push, or `null` when nothing a reader cares about
 *          changed. NOTE the dedupe key includes the PROVENANCE: two
 *          consecutive 6 км/ч rows, one from the tape and one from a hazard
 *          cap, are two different facts and collapsing them would restore the
 *          very ambiguity this function exists to remove.
 */
export function hazardPaceRow(prev, at) {
  // `typeof`, not `Number()`: `Number(null)` is 0 and `Number("")` is 0, so a
  // coercing guard writes a 0 км/ч row — „the authored drive asked for a
  // standstill here" — out of a missing reading. Measured: the first cut of
  // this function did exactly that and its own test caught it.
  const paced = typeof at?.pacedKmh === "number" && Number.isFinite(at.pacedKmh) ? at.pacedKmh : null;
  if (paced === null) return null;
  const cap = typeof at?.capKmh === "number" && Number.isFinite(at.capKmh) ? at.capKmh : null;
  // The cap folds by `min` in the drive; it is recorded here ONLY when it
  // actually bit. A cap of 6 on a pace target of 4 changed nothing, and a row
  // marked "hazard-cap" that the hazard loop did not lower would be the same
  // false attribution in the other direction.
  const lowered = cap !== null && cap < paced;
  const row = {
    // `|| 0` is fine HERE and only here: the clock and the odometer are
    // labels on the row, not the claim it makes, and a 0 in either is
    // obviously a missing reading rather than a speed anyone would quote.
    tSec: Math.round(Number(at?.tSec) || 0),
    odoM: Math.round(Number(at?.odoM) || 0),
    /** what the car was actually asked for on this tick */
    kmh: Math.round(lowered ? cap : paced),
    /** what the PACE LAW asked for, before any hazard cap. On a lane with a
     *  tape this is the authored target; on a lane without one it is the fixed
     *  creep, and `pace.used` / `pace.why` says which. */
    pacedKmh: Math.round(paced),
    /** non-null ⇒ THIS ROW IS THE HARNESS'S CAUTION, NOT THE TAPE'S */
    hazardCapKmh: lowered ? cap : null,
    src: lowered ? "hazard-cap" : "pace",
  };
  if (
    prev &&
    prev.kmh === row.kmh &&
    prev.pacedKmh === row.pacedKmh &&
    (prev.hazardCapKmh ?? null) === row.hazardCapKmh
  ) {
    return null;
  }
  return row;
}

/**
 * THE SENTENCE THE PACE NOTE PRINTS SO THE ARRAY IS NEVER READ UNLABELLED.
 *
 * A provenance the reader has to open a JSON file to discover is a provenance
 * most readers will not discover. The report says it in the same breath as the
 * instruction to go and read the array.
 */
export function hazardPaceProvenance(targets) {
  const rows = Array.isArray(targets) ? targets : [];
  if (rows.length === 0) {
    return "no target row was recorded at all, so nothing here is evidence about the pace of this drive";
  }
  const lowered = rows.filter((r) => r && r.hazardCapKmh !== null && r.hazardCapKmh !== undefined);
  if (lowered.length === 0) {
    return `all ${rows.length} target row(s) carry src:"pace" — the hazard loop lowered none of them, so kmh IS the pace law's target`;
  }
  const to = [...new Set(lowered.map((r) => r.hazardCapKmh))].sort((a, b) => a - b).join("/");
  return (
    `${lowered.length} of ${rows.length} target row(s) were LOWERED BY THE HAZARD LOOP to ${to} км/ч and carry ` +
    `src:"hazard-cap" — on those rows kmh is THIS HARNESS being cautious at a scan chip and pacedKmh is what the ` +
    "authored drive asked for. A «Непропускане на пешеходец» read against this array must be read against pacedKmh."
  );
}
