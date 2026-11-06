/**
 * A QR code as inline SVG (US-BES-17): one unit square per dark module, so the picture is exact at any print size. The
 * modules come from uqr with their quiet zone; the code takes the text colour of the label (black on print).
 */
export function QrCode(props: { modules: readonly (readonly boolean[])[]; className?: string }) {
  const { modules, className } = props;
  const size = modules.length;
  const d = modules
    .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join("");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
