import type { Need } from "@pflanzendex/core";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import type { EquipmentFill } from "../../equipment-form/equipment-form";
import table from "../../equipment.de.json";

const t = texts(table);

/** `ScrollEntries` asks for a part size; the needs are all loaded and have no `paging`, so every need is on the list at once (US-QS-15). */
const NEEDS_PER_PART = 2;

/** The address of a device's record: the equipment page with its item layer open (US-QS-22). */
const itemAddress = (id: string) =>
  `${PATHS.collection}?view=equipment&sheet=item-${encodeURIComponent(id)}`;

/** The form of a new lamp with its light zone filled in; the rest stays empty (P-08). */
const lampFill = (zoneId: string): EquipmentFill => ({
  type: "Lamp",
  name: "",
  productId: null,
  priceEur: null,
  lightZoneId: zoneId,
});

/**
 * One need as a row (US-QS-32, SG-TOUCH-02). The title is the core's next action, so the title says the step; the target
 * is where that step is done, and a row whose step happens outside the app (buying) is plain text with no chevron. The
 * reason and its source are the one meta line.
 */
function NeedRow(props: { need: Need; fill: (prefill: EquipmentFill, from: HTMLElement) => void }) {
  const { need } = props;
  const meta = t("needs.meta", { reason: need.reason, source: need.source });
  const target = need.target;
  if (target?.kind === "device")
    return <GroupedRow bare to={itemAddress(target.id)} title={need.nextAction} meta={meta} />;
  if (target?.kind === "zone")
    return (
      <GroupedRow
        bare
        haspopup="dialog"
        onClick={(event) => props.fill(lampFill(target.zoneId), event.currentTarget)}
        title={need.nextAction}
        meta={meta}
      />
    );
  return <GroupedRow bare title={need.nextAction} meta={meta} />;
}

/**
 * "Fehlt / Nachkaufen" (US-EQU-07): what is missing, one flat row per item, titled by the step and opening the place where
 * the step is done (US-QS-32). Derived, no urgency and no prices (P-08), and no advertising: recommendations are a separate,
 * later story. When nothing is missing the block says so.
 */
export function NeedsView(props: {
  needs: readonly Need[];
  fill: (prefill: EquipmentFill, from: HTMLElement) => void;
}) {
  const { needs } = props;
  return (
    // No min-h-0: a section that may shrink below its content lets the rows fall under the recommendations at 200 % text
    // (issue 2272).
    <section aria-labelledby="equipment-needs-title" className="flex min-w-0 flex-1 flex-col gap-3">
      <h2 id="equipment-needs-title" className="text-base font-semibold">
        {t("needs.title")}
      </h2>
      {needs.length === 0 ? (
        <p className="m-0 text-muted-foreground">{t("needs.none")}</p>
      ) : (
        <ScrollEntries
          items={needs}
          pageSize={NEEDS_PER_PART}
          label={t("needs.title")}
          // The list is the content of its layer, which scrolls (issue 2418): it is as high as its rows, so the recommendations
          // start below the last row. No size containment: it would make the list 0 px high and the rows would run over the
          // recommendations (issue 2535). The rows never shrink below their content: the list gives every row `shrink-0`.
          listClassName={ROW_GROUP}
          getKey={(n) => n.id}
          renderItem={(n) => <NeedRow need={n} fill={props.fill} />}
        />
      )}
    </section>
  );
}
