// -----------------------------------------------------------------------------
// budget.mjs — turn a report into a verdict, and print it like something a
// human will actually read.
//
// The founder asked for a screen budget, not a screenshot review: "at least 85%
// of the mobile screen should remain available for the actual simulator,
// questions, or exam". A budget that is checked by eye is a wish. This module
// is what makes it fail a build — used by cli.mjs for its exit code and by
// budget.test.mjs for the vitest gate.
// -----------------------------------------------------------------------------

/**
 * @param {any} report a report from sweep()
 * @returns {{pass:boolean, failures:{route:string,device:string,reason:string}[], checked:number}}
 */
export function evaluate(report) {
  const failures = [];
  let checked = 0;

  for (const r of report.results) {
    if (!r.ok) {
      failures.push({ route: r.route, device: r.device, reason: r.error || "route failed" });
      continue;
    }
    checked += 1;
    const budget = r.budget || {};

    // INTEGRITY, NOT BUDGET, AND IT IS UNCONDITIONAL. A mustFit selector that
    // matches nothing means the fold test measured nothing — and a check that
    // silently measures nothing is exactly the failure this harness was built
    // to end. It fails even on routes where foldMustPass is off, because the
    // route's own declaration is what is broken, not the layout.
    for (const item of r.fold?.items || []) {
      if (item.found === 0) {
        failures.push({
          route: r.route,
          device: r.device,
          reason: `mustFit selector "${item.selector}" matched no element — fix routes.mjs, ` +
            `do not read this route's fold result as a pass`,
        });
      }
    }

    // A LONG LIST IS NOT AN EXCUSE FOR AN UNREACHABLE FIRST ROW.
    //
    // `foldMustPass` is all-or-nothing: it also requires a document that does
    // not scroll, which is the wrong demand on a sixteen-topic hub — so that
    // route had the whole fold check off, and the day its selector rotted
    // nothing failed. `foldItemsMustFit` is the half that always applies: the
    // elements the route NAMED as its primary interaction have to be on the
    // screen the student lands on, however long the page below them is.
    if (budget.foldItemsMustFit && !budget.foldMustPass) {
      const missed = (r.fold?.items || []).filter((i) => i.found > 0 && !i.fits);
      if (missed.length > 0) {
        failures.push({
          route: r.route,
          device: r.device,
          reason:
            `the primary interaction is below the fold on the screen the student lands on; ` +
            missed.map((m) => `${m.selector} overflows by ${m.overflowPx}px`).join(", "),
        });
      }
    }

    if (typeof budget.contentMin === "number" && r.coverage.contentFraction < budget.contentMin) {
      failures.push({
        route: r.route,
        device: r.device,
        reason:
          `content ${(r.coverage.contentFraction * 100).toFixed(1)}% < budget ` +
          `${(budget.contentMin * 100).toFixed(0)}% ` +
          `(chrome paints ${(r.coverage.chromeFraction * 100).toFixed(1)}% of the screen)`,
      });
    }
    if (budget.foldMustPass && !r.fold.pass) {
      const worst = (r.fold.items || []).filter((i) => !i.fits);
      failures.push({
        route: r.route,
        device: r.device,
        reason:
          `primary interaction does not fit above the fold` +
          (r.fold.documentOverflowPx > 1 ? `; page scrolls ${r.fold.documentOverflowPx}px` : "") +
          (worst.length
            ? `; ${worst
                .map((w) =>
                  w.found === 0
                    ? `${w.selector} MATCHED NOTHING (the fold test cannot vouch for this screen)`
                    : `${w.selector} overflows by ${w.overflowPx}px`,
                )
                .join(", ")}`
            : ""),
      });
    }
    if (budget.touchMustPass && !r.touch.pass) {
      const worst = r.touch.violations[0];
      failures.push({
        route: r.route,
        device: r.device,
        reason:
          `${r.touch.violations.length} touch target(s) under 44x44 — smallest ` +
          `${worst.w}x${worst.h} (${worst.label || worst.path})`,
      });
    }
  }

  return { pass: failures.length === 0, failures, checked };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** A table a person can read, plus the diagnosis under it. */
export function formatReport(report, verdict = evaluate(report)) {
  const lines = [];
  lines.push("");
  lines.push(
    `MOBILE SCREEN BUDGET — ${report.engine}${report.enginePrimary ? "" : " (SECOND OPINION, not the founder's engine)"}` +
      `  ${report.baseUrl}  ${report.startedAt}`,
  );
  lines.push("");
  lines.push(
    "  route              device               content   chrome  unclaimed  fold   <44px  safe",
  );
  lines.push(
    "  ------------------ -------------------- --------- ------- ---------- ------ ------ ----",
  );
  for (const r of report.results) {
    if (!r.ok) {
      lines.push(`  ${r.route.padEnd(18)} ${r.device.padEnd(20)} ERROR: ${r.error}`);
      continue;
    }
    lines.push(
      `  ${r.route.padEnd(18)} ${r.device.padEnd(20)} ` +
        `${pct(r.coverage.contentFraction).padStart(8)} ` +
        `${pct(r.coverage.chromeFraction).padStart(7)} ` +
        `${pct(r.coverage.unclaimedFraction).padStart(10)} ` +
        `${(r.fold.pass ? "ok" : "FAIL").padStart(6)} ` +
        `${String(r.touch.violations.length).padStart(6)} ` +
        `${String(r.safeArea.violations.length).padStart(4)}`,
    );
  }

  lines.push("");
  lines.push("  content   = viewport share INSIDE the declared content surface that no UI paints on");
  lines.push("  chrome    = viewport share a non-content element paints on, translucent included");
  lines.push("  unclaimed = neither: bare app backdrop outside the content surface");

  // The diagnosis: where the chrome actually is.
  for (const r of report.results) {
    if (!r.ok || r.coverage.chromeFraction < 0.05) continue;
    lines.push("");
    lines.push(`  ${r.route} / ${r.device} — chrome ${pct(r.coverage.chromeFraction)}:`);
    for (const c of r.coverage.topContributors.slice(0, 6)) {
      lines.push(`      ${String(c.addedPct).padStart(5)}%  ${c.fixed ? "[fixed] " : ""}${c.path}`);
    }
    const heavy = r.coverage.bands.filter((b) => b.chromePct >= 50);
    if (heavy.length) {
      lines.push(
        `      bands >=50% chrome: ` +
          heavy.map((b) => `y${b.y0}-${b.y1} ${b.chromePct}%`).join(", "),
      );
    }
  }

  lines.push("");
  if (verdict.pass) {
    lines.push(`  PASS — ${verdict.checked} route/device combinations met their budgets.`);
  } else {
    lines.push(`  FAIL — ${verdict.failures.length} budget failure(s):`);
    for (const f of verdict.failures) lines.push(`    ${f.route} / ${f.device}: ${f.reason}`);
  }
  if (report.runDir) lines.push(`\n  screenshots: ${report.runDir}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * The durable, tracked shape of a sweep — tools/mobile/baseline.json.
 *
 * Screenshots and full reports are scratch (gitignored); THIS is what later
 * phases are measured against, so it is small enough to read in a diff and
 * contains only numbers that mean something on their own.
 */
export function summarize(report, previous = null) {
  const rows = report.results.map((r) => ({
      route: r.route,
      device: r.device,
      capturedAt: report.startedAt,
      ok: r.ok,
      ...(r.ok
        ? {
            contentPct: Number((r.coverage.contentFraction * 100).toFixed(1)),
            chromePct: Number((r.coverage.chromeFraction * 100).toFixed(1)),
            foldPass: r.fold.pass,
            documentOverflowPx: r.fold.documentOverflowPx,
            touchUnder44: r.touch.violations.length,
            safeAreaViolations: r.safeArea.violations.length,
          }
        : { error: r.error }),
  }));

  // A CELL THAT FAILED TO MEASURE MUST NOT ERASE ONE THAT DID.
  //
  // This dev box regularly hands a route a 3-minute render, and when it does,
  // one route/device cell times out while the other seventeen are fine.
  // Overwriting a good baseline row with "ERROR: timeout" would delete the
  // number a later phase is supposed to be measured against, in exchange for
  // information about the machine. So an errored cell keeps the previous
  // measurement — and keeps ITS OWN `capturedAt`, so nobody can mistake a
  // carried-over row for a fresh one.
  if (previous?.routes) {
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].ok) continue;
      const old = previous.routes.find(
        (p) => p.route === rows[i].route && p.device === rows[i].device && p.ok,
      );
      if (old) rows[i] = { ...old, staleReason: rows[i].error };
    }

    // AND A PARTIAL SWEEP MUST NOT DELETE THE CELLS IT DID NOT VISIT.
    // `cli.mjs -r theory-practice -d small-portrait --save-baseline` is the
    // natural way to repair one flaky cell; without this, saving would replace
    // an 18-row baseline with a 1-row one.
    const measured = new Set(rows.map((r) => `${r.route}/${r.device}`));
    for (const old of previous.routes) {
      if (!measured.has(`${old.route}/${old.device}`)) rows.push({ ...old });
    }
  }

  rows.sort((a, b) => a.device.localeCompare(b.device) || a.route.localeCompare(b.route));
  return { capturedAt: report.startedAt, engine: report.engine, routes: rows };
}

/** What moved since the baseline. Positive contentPct delta = more road. */
export function formatDelta(baseline, report) {
  if (!baseline) return "";
  const key = (r) => `${r.route}/${r.device}`;
  const before = new Map(baseline.routes.map((r) => [key(r), r]));
  const lines = ["", `  vs baseline (${baseline.capturedAt}):`];
  let any = false;
  for (const r of summarize(report).routes) {
    const b = before.get(key(r));
    if (!b || !b.ok || !r.ok) continue;
    const d = Number((r.contentPct - b.contentPct).toFixed(1));
    const t = r.touchUnder44 - b.touchUnder44;
    if (d === 0 && t === 0) continue;
    any = true;
    lines.push(
      `    ${key(r).padEnd(40)} content ${b.contentPct}% -> ${r.contentPct}% ` +
        `(${d > 0 ? "+" : ""}${d})   <44px ${b.touchUnder44} -> ${r.touchUnder44}`,
    );
  }
  if (!any) lines.push("    no change");
  return lines.join("\n");
}

/**
 * The vitest-facing assertion. Throws an Error whose message is the whole
 * table, so a failing build shows the numbers and not just "expected true".
 */
export function assertBudget(report) {
  const verdict = evaluate(report);
  if (!verdict.pass) throw new Error(formatReport(report, verdict));
  return verdict;
}
