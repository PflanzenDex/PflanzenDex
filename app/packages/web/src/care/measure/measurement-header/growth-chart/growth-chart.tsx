import type { MeasurementRow } from "@pflanzendex/core";
import { dateText, valueText } from "@/lib/format";

const W = 320;
const H = 140;
const PAD = 16;
const DAY = 86_400_000;

const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Linear position of `v` between `lo` and `hi` onto `[from, to]`; a flat range sits in the middle. */
const scale = (v: number, [lo, hi]: [number, number], [from, to]: [number, number]) =>
  hi === lo ? (from + to) / 2 : from + ((v - lo) / (hi - lo)) * (to - from);

function Marker(props: { x: number; y: number; etiolated: boolean }) {
  const { x, y } = props;
  // Etiolated: a hollow diamond (shape, not only colour); healthy: a filled circle.
  return props.etiolated ? (
    <path
      data-point="etiolated"
      d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`}
      className="fill-background stroke-destructive"
      strokeWidth={2}
    />
  ) : (
    <circle data-point="healthy" cx={x} cy={y} r={4} className="fill-primary" />
  );
}

/**
 * History chart of a specimen: value over time from its own measurements, etiolated ones marked (US-WAC-05). The
 * axes carry no invented numbers (P-08): only the first and last date and the lowest and highest measured value.
 */
export function GrowthChart({ measurements }: { measurements: readonly MeasurementRow[] }) {
  const points = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const [first, last] = [points[0], points[points.length - 1]];
  if (!first || !last || points.length < 2)
    return (
      <p className="text-muted-foreground">
        Ab der 2. Messung siehst du hier den Verlauf als Diagramm.
      </p>
    );
  const values = points.map((p) => p.value);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const [t0, t1] = [time(first.date), time(last.date)];
  const x = (p: MeasurementRow) =>
    t1 - t0 < DAY ? W / 2 : scale(time(p.date), [t0, t1], [PAD, W - PAD]);
  const y = (p: MeasurementRow) => scale(p.value, [lo, hi], [H - PAD, PAD]);
  const etiolated = points.filter((p) => p.quality === "etiolated").length;
  const label =
    `Verlauf: ${points.length} Messungen von ${dateText(first.date)} bis ${dateText(last.date)}, ` +
    `Werte von ${valueText(lo)} bis ${valueText(hi)}` +
    (etiolated ? `, ${etiolated} davon vergeilt/dünn` : "");
  return (
    <figure className="m-0 flex max-w-xl flex-col gap-1">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <polyline
          points={points.map((p) => `${x(p)},${y(p)}`).join(" ")}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={1.5}
        />
        {points.map((p) => (
          <Marker key={p.id} x={x(p)} y={y(p)} etiolated={p.quality === "etiolated"} />
        ))}
      </svg>
      <figcaption className="text-sm text-muted-foreground">
        Kreis: gesund. Raute: vergeilt/dünn; solche Messungen zählen nie als Erfolg.
      </figcaption>
    </figure>
  );
}
