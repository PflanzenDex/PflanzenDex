import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SegmentedOption } from "../segmented-control";

// When two or three segments stack (issue 2232): the measurement and its hidden one-line copy of the labels.

/**
 * Whether every segment of a row fits its equal column (issue 2232): the group's inner width less the gaps, split by the
 * number of segments, against the widest label on one line plus a segment's own padding and border. Pure, so the rule
 * is tested without a layout engine.
 */
export function rowFits(m: {
  inner: number;
  gap: number;
  widest: number;
  chrome: number;
  count: number;
}): boolean {
  if (m.count < 1 || m.inner <= 0) return true;
  const column = (m.inner - m.gap * (m.count - 1)) / m.count;
  return m.widest + m.chrome <= column + 0.5;
}

const px = (v: string) => Number.parseFloat(v) || 0;

/**
 * Measures, before the first paint and again on every size change (text size, fonts, rotation), whether two or three
 * segments fit one row. The widths come from a hidden copy of the labels on one line in the selected (semibold) weight,
 * because the visible labels wrap once the segments stack and then no longer show their one-line width.
 */
export function useStacked(active: boolean, labels: string) {
  const group = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const g = group.current;
    const p = probe.current;
    if (!active || !g || !p) return;
    const measure = () => {
      const gs = getComputedStyle(g);
      const button = g.querySelector("button");
      const bs = button ? getComputedStyle(button) : undefined;
      const chrome = bs
        ? px(bs.paddingLeft) +
          px(bs.paddingRight) +
          px(bs.borderLeftWidth) +
          px(bs.borderRightWidth)
        : 0;
      const widest = Math.max(0, ...Array.from(p.children, (c) => c.getBoundingClientRect().width));
      const inner = g.clientWidth - px(gs.paddingLeft) - px(gs.paddingRight);
      const count = p.children.length;
      setStacked(!rowFits({ inner, gap: px(gs.columnGap), widest, chrome, count }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(g);
    observer.observe(p);
    return () => observer.disconnect();
  }, [active, labels]);
  return { group, probe, stacked };
}

/**
 * The hidden one-line copy of the labels that the row measures (useStacked); never read, never seen. The text is generated
 * content from a data attribute, so the page holds each label once as text (queries by text, find in page).
 */
export function LabelProbe<V extends string>(props: {
  probeRef: RefObject<HTMLDivElement | null>;
  options: readonly SegmentedOption<V>[];
  alerts?: Readonly<Partial<Record<V, string | undefined>>> | undefined;
}) {
  const { options, alerts } = props;
  return (
    <div
      ref={props.probeRef}
      aria-hidden="true"
      className="pointer-events-none invisible absolute top-0 left-0 flex h-0 w-max overflow-hidden text-sm font-semibold whitespace-nowrap"
    >
      {options.map((o) => (
        <span key={o.value} className="inline-flex gap-1">
          <span data-label={o.label} className="before:content-[attr(data-label)]" />
          {alerts?.[o.value] ? <span className="inline-block size-4" /> : null}
          {o.keyHint ? (
            <span
              data-label={o.keyHint.visible}
              className="hidden font-mono text-xs font-normal before:content-[attr(data-label)] md:inline"
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}
