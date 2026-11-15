import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * The name of a species in every row, sheet and card (US-QS-32, SG-TYPE-06, SG-TYPE-08). With a German name the German
 * name is the title, upright, and the scientific name stands in italics on the meta line before any further meta. Without
 * one the scientific name is the single title, in italics. A "German" name equal to the scientific name is no German
 * name (F-0067), and no name is invented where the catalog has none (P-08).
 */

/** The German name where the catalog has one; `null` for a missing, empty or scientific one. */
export function germanNameOf(scientific: string, german: string | null): string | null {
  return german && german !== scientific ? german : null;
}

export interface SpeciesNameProps {
  /** The scientific name: italic wherever it stands (SG-TYPE-06). */
  scientific: string;
  /** The German name, or `null` where the catalog has none (P-08). It is never italic. */
  german: string | null;
  /** Further meta after the scientific name on the meta line, e.g. the catch date. */
  meta?: ReactNode;
  /** Text before the title, e.g. the place in a list ("1. "). */
  lead?: string;
  /** The element of the title: a heading of the card or the page (SG-HEAD-03), a span otherwise. */
  as?: "h2";
  /** Classes of the title, added to its semibold weight. */
  titleClassName?: string;
  /** Tooltip of the title, e.g. the full German name (US-POK-01); none when `null`. */
  tooltip?: string | null;
}

/** The name of a species as a title and a meta line; the caller lays both out in its own grid or flow. */
export function SpeciesName(props: SpeciesNameProps) {
  const { scientific, lead, as, titleClassName, tooltip, meta } = props;
  const german = germanNameOf(scientific, props.german);
  const Title = as ?? "span";
  const hasMeta = meta !== undefined && meta !== null && meta !== false && meta !== "";
  return (
    <>
      <Title
        className={cn("break-words font-semibold", titleClassName)}
        title={tooltip ?? undefined}
      >
        {lead}
        {german ?? <i>{scientific}</i>}
      </Title>
      {german !== null || hasMeta ? (
        <span className="break-words text-sm text-muted-foreground">
          {german !== null ? <i>{scientific}</i> : null}
          {german !== null && hasMeta ? " · " : null}
          {hasMeta ? meta : null}
        </span>
      ) : null}
    </>
  );
}

/** A name in running text: "German (*scientific*)", or the scientific name alone in italics (milestones, lists). */
export function SpeciesNameInline(props: { scientific: string; german: string | null }) {
  const german = germanNameOf(props.scientific, props.german);
  if (german === null) return <i>{props.scientific}</i>;
  return (
    <>
      {german} (<i>{props.scientific}</i>)
    </>
  );
}
