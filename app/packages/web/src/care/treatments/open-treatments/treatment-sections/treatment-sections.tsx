import type { ReactNode } from "react";
import type { TreatmentListRow } from "@pflanzendex/core";
import { GroupSections } from "@/shared/lists/grouped-list/grouped-sections/grouped-sections";
import type { SectionGroup } from "@/shared/lists/grouped-list/grouped-sections/group-section/group-section";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { LIST_CLASSES } from "../../../shared/notices";
import table from "../open-treatments.de.json";

const ui = texts(table);
const plural = plurals(table);

/**
 * The state a row is filed under (SG-LIST-10): what is past due, what is due today, and what is still ahead ("in 3 Tagen" and
 * later). The state is the core's own (`status.kind`, from the local calendar day, NFR-08); nothing is guessed (P-08).
 */
const SECTION_OF: Record<TreatmentListRow["status"]["kind"], "overdue" | "today" | "later"> = {
  overdue: "overdue",
  today: "today",
  soon: "later",
  later: "later",
};
const SECTIONS = ["overdue", "today", "later"] as const;

/** The sections that have a row, in the order of SG-LIST-10; each keeps the order of the server (earliest due date first). */
export function sectionsOf(rows: readonly TreatmentListRow[]): SectionGroup<TreatmentListRow>[] {
  return SECTIONS.map((key) => {
    const items = rows.filter((r) => SECTION_OF[r.status.kind] === key);
    return {
      key,
      label: ui(`section.${key}`),
      items,
      countText: plural.counted("section.count", items.length),
    };
  }).filter((g) => g.items.length > 0);
}

/**
 * The open treatments as a list of due items (SG-LIST-10): "Überfällig", "Heute" and "Später" are sections of one list, each with
 * its count, sorted by how long an item is due; only a section with a row shows (an open set). Inside a sheet or the page's
 * main area the layer's body scrolls, so the list has no region of its own. `level` is the heading level of a section.
 */
export function TreatmentSections(props: {
  rows: readonly TreatmentListRow[];
  rowOf: (row: TreatmentListRow) => ReactNode;
  level: 3 | 4;
}) {
  return (
    <GroupSections
      label={ui("list")}
      in="layer"
      level={props.level}
      groups={sectionsOf(props.rows)}
      list={{
        listLabel: ui("list"),
        pageSize: props.rows.length,
        listClassName: LIST_CLASSES,
        getKey: (row) => row.id,
        renderItem: props.rowOf,
      }}
    />
  );
}
