/**
 * The seam between the engine and the delivery layer, checked by the compiler.
 *
 * @/modules/hazard-play owns the run (ordering, one-shot-per-item, the
 * media-time plausibility check, persistence) and asks the engine two
 * questions through a registered port. The engine re-declares those shapes
 * rather than importing them, because that module's public barrel does not
 * exist yet and reaching into another module's internals from PRODUCTION code
 * is what docs/architecture/05 forbids.
 *
 * That leaves one risk: the two copies drifting apart in silence. This file is
 * the answer — a type-only import from that module's public barrel (erased at
 * runtime) plus an assignment. If either side changes the port, `tsc` fails
 * here instead of the wiring line failing in a route nobody typechecks.
 */

import { describe, expect, it } from "vitest";
import type { HazardEngine } from "@/modules/hazard-play";
import { hazardEngine } from "../engine";

describe("the hazard-play port", () => {
  it("is satisfied by the engine", () => {
    const port: HazardEngine = hazardEngine;
    expect(port.version).toBe(hazardEngine.version);
    expect(typeof port.deal).toBe("function");
    expect(typeof port.judge).toBe("function");
  });
});
