// -----------------------------------------------------------------------------
// touch-probe.mjs — THE ONE THING THIS HARNESS COULD NEVER DO: TOUCH THE PADS.
//
// `sc-speed-creep:dff70553`, quoted: „the brake-drop family is mis-named — the
// harness never dispatches a touch, so it cannot exercise TouchControls.tsx,
// the suspect file all five rows name." Judged STILL at w11, w12, w13, w14,
// w23, w24 and w25, every time with the same sentence: it „needs a harness
// change to close". This is that change.
//
// WHY IT IS A POST-DRIVE PROBE AND NOT A DRIVE CHANNEL. The phone lane runs
// WEBKIT (`lesson-audit.mjs` `open()`), and WebKit has no CDP — so
// `Input.dispatchTouchEvent`, which is how `pedal-ab.mjs` holds a real finger
// down, is not available here. Playwright's WebKit touch API is `tap()`, a
// single tap that cannot express „still holding", and a pedal is a hold. What
// IS available is the pointer events the component actually listens to, so
// this dispatches those, on the real pad node, with `pointerType: "touch"`.
//
// AND IT PRESSES DEAD CENTRE, WHICH IS THE WHOLE SAFETY ARGUMENT. The
// drivetrain pad's axis is absolute about its own box — `seatDriveCentre` reads
// the box at the start of every gesture and „dead centre is exactly 0 km/h" —
// so a press on the geometric centre runs `driveApply` down its neutral branch,
// whose entire body is `releaseThrottle(); releaseBrake();`. It CANNOT command
// the car. It can only actuate the ownership machinery — claim, capture,
// publish, the four release edges — which is the machinery the brake-drop
// family is about.
//
// WHAT IT READS BACK, AND WHY NOT THE ARIA. At neutral the pad publishes the
// same `aria-valuenow=0` / centre sentence it already carries at rest, so the
// accessibility tree cannot tell a press from no press. The KNOB can: at rest
// its only inline style is `border-color`, `driveBegin` sets
// `transition: "none"` and `driveApply` writes `transform: translateY(0.0px)`,
// and `onDriveEnd` swaps the transition for `transform 140ms …`. Three states,
// all imperative, none of them present before the first press.
//
// IT FAILS TOWARDS „I COULD NOT PROVE IT". Every refusal below returns a
// sentence naming what was missing. A probe that cannot find the overlay says
// so; it never reports an actuation it did not observe, because „the touch
// arrived" is the reassuring direction and this row exists because an
// instrument was believed about its own reach.
// -----------------------------------------------------------------------------

/** The synthetic finger's id. Far outside the range a browser hands a real
 *  touch, so a readback can never confuse the two. */
export const TOUCH_PROBE_POINTER_ID = 4242;

/**
 * THE TWO INSTANTS, AND WHY THE PROBE HAS TO KNOW WHICH ONE IT IS AT.
 *
 * The first build of this file was called ONCE, after the drive, and it
 * refused on every lane it ever ran on. Measured at the commit that shipped it
 * (`.audit-frames/canary-8b9d135-232028/frames/sc-park-wall__mobile-right/run.log`):
 *
 *   TOUCH PROBE: NOT actuated · 0 touch events dispatched · … — the touch
 *   overlay is mounted but inert — a press here is refused by design
 *
 * That refusal is correct and the cause is in the product, working as
 * designed: `LessonScene.tsx` renders `<TouchControls hidden={physicsPaused}>`
 * and `TouchControls.tsx` stamps `data-sim-touch-inert="on"` whenever
 * `!visible`. A drive ends because the session ended, i.e. with the end card
 * up and the physics paused — so the one moment the old call site could never
 * reach the pad was the moment it always ran at. The capability shipped dead
 * and `touchProbe: "NOT actuated"` carried exactly as much information as the
 * `touchEvents: 0` column already did.
 *
 * So the reading that can actuate is taken at the LAST INSTANT OF THE DRIVE AT
 * WHICH THE CAR IS UNTOUCHED — the landmark `steerLiveness` already uses: the
 * ladder is finished, the world is running (`physicsPaused` false, overlay
 * live) and no pedal has been pressed. The post-drive reading is kept because
 * it answers a different question — whether the pads went inert under the end
 * card, which is doc 91 §I3's own promise — and `mergeProbes` reports the one
 * that reached the component.
 */
export const PROBE_BEFORE_DRIVE = "before the drive, on the untouched car";
export const PROBE_AFTER_DRIVE = "after the drive, under the end card";

/** How long the finger stays down. Long enough that a pad which drops its
 *  ownership on a timer or a re-render has dropped it before the second read. */
export const TOUCH_PROBE_HOLD_MS = 500;

/** Hard ceiling on the whole in-page call. A dead page must cost one line in
 *  the transcript, not a killed lane. */
export const TOUCH_PROBE_TIMEOUT_MS = 5000;

/**
 * THE IN-PAGE HALF. Serialised to the browser by `page.evaluate`, so it closes
 * over nothing and returns only structured-cloneable data. It takes NO verdict:
 * it reports what the DOM said, and `readbackVerdict` below — which needs no
 * browser and is unit-tested — decides what that means.
 */
export async function actuateDrivePad({ pointerId, holdMs }) {
  const fail = (why) => ({ ok: false, why, events: 0 });
  const root = document.querySelector('[data-hud="touch-controls"]');
  if (!root) return fail("the touch overlay is not on the page");
  if (root.getAttribute("data-sim-touch-inert") === "on") {
    return fail("the touch overlay is mounted but inert — a press here is refused by design, not by a defect");
  }
  const pads = Array.from(root.querySelectorAll('[role="slider"]'));
  // The drivetrain pad is the VERTICAL one; the wheel declares no orientation.
  const drive = pads.find((p) => p.getAttribute("aria-orientation") === "vertical");
  if (!drive) return fail(`no vertical (drivetrain) pad among ${pads.length} slider(s) in the overlay`);
  const box = drive.getBoundingClientRect();
  if (box.width < 8 || box.height < 8) {
    return fail(`the drivetrain pad measures ${Math.round(box.width)}×${Math.round(box.height)} px`);
  }
  // The knob is the pad's only descendant carrying an inline border-color.
  const knob = drive.querySelector('div[style*="border-color"]');
  if (!knob) return fail("the drivetrain pad has no knob to read the press back from");

  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  let events = 0;
  const send = (type, buttons) => {
    drive.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: "touch",
        isPrimary: true,
        buttons,
        clientX: x,
        clientY: y,
        width: 24,
        height: 24,
        pressure: buttons ? 0.5 : 0,
      }),
    );
    events += 1;
  };
  const read = () => ({
    transition: knob.style.transition || "",
    transform: knob.style.transform || "",
    valueNow: drive.getAttribute("aria-valuenow"),
  });

  const atRest = read();
  let result;
  try {
    send("pointerdown", 1);
    const onPress = read();
    await new Promise((r) => setTimeout(r, holdMs));
    // A wobble, because a real thumb wobbles and `adoptable()` keys on moves.
    send("pointermove", 1);
    const afterHold = read();
    send("pointerup", 0);
    result = { ok: true, pads: pads.length, atRest, onPress, afterHold, onRelease: read() };
  } catch (e) {
    result = { ok: false, why: `the actuation threw: ${(e && e.message) || e}` };
  }
  // NEVER LEAVE A PAD OWNED. `onDriveEnd` is idempotent — the second release
  // for one pointer answers false and does nothing — so this costs nothing on
  // the happy path and closes the pad on every unhappy one.
  try {
    send("pointercancel", 0);
  } catch {
    /* the page is gone; `events` already says how far we got */
  }
  result.events = events;
  return result;
}

/** Did the knob take up the imperative styling only a press can give it? */
function seated(s) {
  return !!s && s.transition === "none" && /^translateY\(/.test(s.transform || "");
}

/**
 * THE JUDGE, WITH NO BROWSER IN IT. Given a raw readback it says whether the
 * component answered — and when it did not, WHY, in a sentence a reader who
 * was not here can act on.
 */
export function readbackVerdict(raw) {
  if (!raw || typeof raw !== "object") {
    return { actuated: false, held: false, released: false, events: 0, why: "the probe returned nothing at all" };
  }
  const events = Number.isFinite(raw.events) ? raw.events : 0;
  if (raw.ok !== true) {
    return { actuated: false, held: false, released: false, events, why: raw.why || "the probe refused without saying why" };
  }
  const actuated = seated(raw.onPress);
  const held = actuated && seated(raw.afterHold);
  const released = /^transform 140ms/.test((raw.onRelease && raw.onRelease.transition) || "");
  let why;
  if (!actuated) {
    why =
      "the pad took the pointer event and did NOT seat its knob — TouchControls.onDriveDown either " +
      "refused the claim or never ran, so this lane still has not exercised the component";
  } else if (!held) {
    why = `the pad answered the press and had LET GO ${TOUCH_PROBE_HOLD_MS} ms later — this is the brake-drop shape, on the touch surface`;
  } else if (!released) {
    why = "the pad answered and held, but its release edge did not fire — the knob never went back to its transition";
  } else {
    why = "pressed dead centre (commands nothing), held, released cleanly — the drivetrain pad is live on this build";
  }
  return { actuated, held, released, events, why };
}

/**
 * PICK THE READING THAT REACHED THE COMPONENT, AND SUM WHAT BOTH SENT.
 *
 * No browser in it, for the reason `readbackVerdict` has none: which instant
 * a lane is entitled to report is a judgement, and a judgement that needs
 * WebKit to check is a judgement nobody checks.
 *
 * THE COUNT IS THE SUM AND THE VERDICT IS NOT. `events` is „how many touches
 * did this lane dispatch", which is what the INPUT line attests, and both
 * readings dispatched into the same page. `actuated`/`held`/`released` belong
 * to ONE press and may never be blended: a pad that answered before the drive
 * and refused under the end card did both, and `when` says which press the
 * three flags describe. An unreached pair reports the FIRST reading, because
 * „it was live and said no" is the finding, and „it was inert under the card"
 * is the design.
 */
export function mergeProbes(pre, post) {
  const readings = [
    [PROBE_BEFORE_DRIVE, pre],
    [PROBE_AFTER_DRIVE, post],
  ].filter(([, v]) => v && typeof v === "object");
  if (readings.length === 0) return { ...readbackVerdict(null), when: null };
  const events = readings.reduce((n, [, v]) => n + (Number.isFinite(v.events) ? v.events : 0), 0);
  const [when, chosen] = readings.find(([, v]) => v.actuated) ?? readings[0];
  return { ...chosen, events, when };
}

/** One unconditional transcript line. Unconditional for the reason every other
 *  line in the attestation is: a capability nobody prints is a capability every
 *  reader assumes.
 *
 *  `taken …` sits BEFORE the em dash so every clause regex in `summary.mjs`
 *  keeps the line it is anchored to; the trailing sentence stays the free
 *  text. Omitted entirely for a single reading, so an older transcript and a
 *  probe that was never merged read exactly as they always did. */
export function touchProbeLine(v) {
  return (
    `  TOUCH PROBE: ${v.actuated ? "actuated" : "NOT actuated"} · ${v.events} touch events dispatched · ` +
    `hold ${v.held ? "survived" : "did NOT survive"} · release ${v.released ? "clean" : "NOT observed"}` +
    (v.when ? ` · taken ${v.when}` : "") +
    ` — ${v.why}`
  );
}

/**
 * Drive the in-page half and judge it. Never throws and never hangs: a page
 * that has died, a browser that has gone, an evaluate that will not return —
 * all three come back as a refusal with a sentence.
 */
export async function probeTouchPads(page, opts = {}) {
  const holdMs = opts.holdMs ?? TOUCH_PROBE_HOLD_MS;
  const timeoutMs = opts.timeoutMs ?? TOUCH_PROBE_TIMEOUT_MS;
  let timer = null;
  try {
    const raw = await Promise.race([
      page.evaluate(actuateDrivePad, { pointerId: TOUCH_PROBE_POINTER_ID, holdMs }),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, why: `the in-page actuation did not return within ${timeoutMs} ms`, events: 0 }),
          timeoutMs,
        );
      }),
    ]);
    return readbackVerdict(raw);
  } catch (e) {
    return readbackVerdict({ ok: false, why: `the page refused the actuation: ${(e && e.message) || e}`, events: 0 });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
