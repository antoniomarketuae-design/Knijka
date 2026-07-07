"use client";

import dynamic from "next/dynamic";
import { SimLoadingCard } from "@/components/sim/SimLoadingCard";

// ssr:false is mandatory here (and only legal inside a client component):
// the simulator bundle pulls in three.js + the rapier physics wasm, which
// must never execute during SSR or the production build. This also
// code-splits the whole 3D stack away from every other dashboard route.
const SimulatorApp = dynamic(() => import("@/components/sim/SimulatorApp"), {
  ssr: false,
  loading: () => <SimLoadingCard />,
});

export function SimulatorClient() {
  return <SimulatorApp />;
}
