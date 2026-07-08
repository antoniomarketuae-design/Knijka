// TEMPORARY visual-verification route — delete after verifying the vehicle
// visual layer (see client.tsx).
import { SimCheckClient } from "./client";

export default function SimVisualCheckPage() {
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: 16 }}>
      <SimCheckClient />
    </div>
  );
}
