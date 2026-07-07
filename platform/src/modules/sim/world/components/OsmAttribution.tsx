"use client";

/**
 * ODbL attribution — REQUIRED on every surface that renders the district
 * (docs/simulation/17 §5). Plain DOM element: place it in the HUD overlay
 * OUTSIDE the R3F <Canvas>, e.g. bottom-right corner of the sim viewport.
 */

const DEFAULT_STYLE: React.CSSProperties = {
  fontSize: "11px",
  lineHeight: 1,
  color: "rgba(255,255,255,0.75)",
  background: "rgba(0,0,0,0.35)",
  padding: "3px 6px",
  borderRadius: "4px",
  textDecoration: "none",
  pointerEvents: "auto",
  whiteSpace: "nowrap",
};

export function OsmAttribution({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <a
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noreferrer license"
      className={className}
      style={className ? style : { ...DEFAULT_STYLE, ...style }}
      aria-label="Map data © OpenStreetMap contributors (ODbL)"
    >
      © OpenStreetMap contributors
    </a>
  );
}
