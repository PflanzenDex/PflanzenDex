import type { ReactNode } from "react";
import type { TodayItem, TodayKind } from "@pflanzendex/core";
import { cn } from "@/shared/lib/utils";
import { keepTogether, overdueChip, withoutOverdue } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { viewAddress, type LinkTarget } from "@/shared/patterns/navigation/navigation/navigation";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { OPENS } from "../../today-destinations";
import table from "../../today.de.json";

const t = texts(table);

/** The text of each kind as the state chip of its row (US-QS-18). */
const KIND: Record<TodayKind, Parameters<typeof t>[0]> = {
  treatment_overdue: "kind.treatmentOverdue",
  treatment_due: "kind.treatmentDue",
  phase_deviation: "kind.phaseDeviation",
  measurement_etiolated: "kind.measurementEtiolated",
  specimen_incomplete: "kind.specimenIncomplete",
  buffer_low: "kind.bufferLow",
  equipment_check_due: "kind.equipmentCheckDue",
};

// Flat like every row of a page (US-QS-32, SG-SHAPE-05): the card colour, no shadow in the flow of the page.
const CARD = "min-w-0 rounded-card bg-card p-3 text-card-foreground [overflow-wrap:anywhere]";
const URGENT = "border-warning-border bg-warning text-warning-foreground";
export const isTreatment = (item: TodayItem) =>
  item.kind === "treatment_overdue" || item.kind === "treatment_due";

/** The state as a short chip ("10 Tage überfällig"), never a repeated heading and sentence (US-QS-18). */
function chipOf(item: TodayItem): string {
  return (item.kind === "treatment_overdue" ? overdueChip(item.text) : null) ?? t(KIND[item.kind]);
}

/** The one line under the chip: the item's text without the overdue part the chip already says (US-QS-32). */
function lineOf(item: TodayItem): string {
  return keepTogether(item.kind === "treatment_overdue" ? withoutOverdue(item.text) : item.text);
}

/** The "Stand" line of the most urgent row when its list is not from today (US-QS-32): a trailing value, or none. */
const standOf = (date: string | undefined) =>
  date === undefined ? {} : { trailing: t("stand", { date }) };

type RowProps = {
  item: TodayItem;
  /** The date of the list, shown only on the most urgent row when it is not today's (US-QS-32). */
  date?: string | undefined;
  /** The row is one of a list of its own (the list of `ScrollEntries` wraps it), so it is no list item of its own. */
  bare?: boolean | undefined;
};

/** A row that opens a view of the app: a link to its address, with a chevron (SG-TOUCH-02). */
function ViewRow(props: RowProps & { view: LinkTarget }) {
  return (
    <GroupedRow
      {...(props.bare ? { bare: true, dense: true } : {})}
      to={viewAddress(props.view)}
      title={chipOf(props.item)}
      meta={lineOf(props.item)}
      {...standOf(props.date)}
    />
  );
}

/**
 * A row that opens a layer of this page in place: a button with a chevron that announces its dialog and shows whether the layer
 * is open. The layer is opened from this element, so the focus returns to the row when it closes (US-QS-15). The most urgent
 * treatment has the amber tone (US-QS-18).
 */
function LayerRow(props: RowProps & { layer: string }) {
  const { openLayer, open } = useLayer(props.layer);
  return (
    <GroupedRow
      {...(props.bare ? { bare: true, dense: true } : {})}
      haspopup="dialog"
      expanded={open}
      tone={isTreatment(props.item) ? "warning" : "default"}
      title={chipOf(props.item)}
      meta={lineOf(props.item)}
      {...standOf(props.date)}
      onClick={(event) => openLayer(event.currentTarget)}
    />
  );
}

/** The most urgent treatment with its one "Behandlungen" entry as its action (US-QS-18): a card in the urgent tint. */
function TreatmentCard(props: { item: TodayItem; date?: string | undefined; entry: ReactNode }) {
  return (
    <div className={cn(CARD, "flex flex-wrap items-center gap-3", URGENT)}>
      <div className="flex min-w-0 grow basis-36 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="w-fit rounded-control border border-current px-2 text-sm font-semibold tabular-nums">
            {chipOf(props.item)}
          </p>
          {props.date && <p className="text-sm opacity-80">{t("stand", { date: props.date })}</p>}
        </div>
        <p className="line-clamp-2 text-base">{lineOf(props.item)}</p>
      </div>
      {props.entry}
    </div>
  );
}

/**
 * One item as a row of "Heute" (US-QS-18, US-QS-32): the state as its title, one meta line with the item's text, and the whole
 * row as its target. A row that opens a view links to it; one that opens a layer of the page is a button. `treatmentEntry` is
 * the one "Behandlungen" entry of a most urgent treatment: the row is then that card.
 */
export function TodayRow(props: {
  item: TodayItem;
  date?: string | undefined;
  treatmentEntry?: ReactNode;
  bare?: boolean | undefined;
}) {
  if (props.treatmentEntry !== undefined)
    return <TreatmentCard item={props.item} date={props.date} entry={props.treatmentEntry} />;
  const opens = OPENS[props.item.target];
  return "view" in opens ? (
    <ViewRow {...props} view={opens.view} />
  ) : (
    <LayerRow {...props} layer={opens.layer} />
  );
}
