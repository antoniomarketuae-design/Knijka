"use client";

// TEMPORARY visual-verification harness for the „Виток" vehicle layer.
// Mounts the standalone SimulatorApp (pre-lesson-shell wiring) so the car,
// cockpit, lights and cameras can be verified in isolation while the
// /simulator route is mid-rework. DELETE THIS ROUTE after verification.

import dynamic from "next/dynamic";

const SimulatorApp = dynamic(() => import("@/components/sim/SimulatorApp"), {
  ssr: false,
  loading: () => <p>Зареждане…</p>,
});

export function SimCheckClient() {
  return <SimulatorApp />;
}
