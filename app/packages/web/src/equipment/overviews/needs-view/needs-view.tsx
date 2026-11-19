import type { Need, NeedKind } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import type { EquipmentFill } from "../../equipment-form/equipment-form";
import table from "../../equipment.de.json";

const t = texts(table);

/** Needs per page until the layout measures the free height of the layer (starting value, assumption; #1029, issue 1154). */
const NEEDS_PER_PAGE = 2;

/** The step of each kind: the row's title says what to do (P-09, US-QS-32). */
const STEP: Record<
  NeedKind,
  "needs.step.supply" | "needs.step.zone" | "needs.step.wish" | "needs.step.replace"
> = {
  supply_low: "needs.step.supply",
  zone_without_lamp: "needs.step.zone",
  wish_without_lamp: "needs.step.wish",
  no_replacement: "needs.step.replace",
};

/** What a need opens: the device it names, or the form of a new lamp for the light zone it names. */
type NeedTarget =
  | { readonly kind: "device"; readonly id: string }
  | { readonly kind: "lamp"; readonly zoneId: string };

/**
 * The target of a need, read from the stable key of its cause: the core writes `supply:<id>` and `replace:<id>` for a
 * device and `zone:<zone>` and `wish-zone:<zone>` for a light zone. The key is read here and not added to the core type,
 * because the AI reads of the needs return that type unchanged (US-QS-32, US-EQU-07).
 */
export function needTarget(need: Need): NeedTarget {
  const key = need.id.slice(need.id.indexOf(":") + 1);
  return need.kind === "zone_without_lamp" || need.kind === "wish_without_lamp"
    ? { kind: "lamp", zoneId: key }
    : { kind: "device", id: key };
}

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
 * One need as a row (US-QS-32, SG-TOUCH-02): titled by the step, with the reason and its source as the one meta line. The
 * whole row is the target: a device opens its record, a lamp opens the form with its zone filled in.
 */
function NeedRow(props: { need: Need; fill: (prefill: EquipmentFill) => void }) {
  const { need } = props;
  const target = needTarget(need);
  const title = t(STEP[need.kind]);
  const meta = t("needs.meta", { reason: need.reason, source: need.source });
  if (target.kind === "device")
    return <GroupedRow bare to={itemAddress(target.id)} title={title} meta={meta} />;
  return (
    <GroupedRow
      bare
      haspopup="dialog"
      onClick={() => props.fill(lampFill(target.zoneId))}
      title={title}
      meta={meta}
    />
  );
}

/**
 * "Fehlt / Nachkaufen" (US-EQU-07): what is missing, one flat row per item, titled by the step and opening the place where
 * the step is done (US-QS-32). Derived, no urgency and no prices (P-08), and no advertising: recommendations are a separate,
 * later story. When nothing is missing the block says so.
 */
export function NeedsView(props: {
  needs: readonly Need[];
  fill: (prefill: EquipmentFill) => void;
}) {
  const { needs } = props;
  return (
    <section
      aria-labelledby="equipment-needs-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="equipment-needs-title" className="text-base font-semibold">
        {t("needs.title")}
      </h2>
      {needs.length === 0 ? (
        <p className="m-0 text-muted-foreground">{t("needs.none")}</p>
      ) : (
        <Pager
          items={needs}
          pageSize={NEEDS_PER_PAGE}
          fit
          label={t("needs.title")}
          param={LAYER_PARAM}
          replace
          listClassName={ROW_GROUP}
          getKey={(n) => n.id}
          renderItem={(n) => <NeedRow need={n} fill={props.fill} />}
        />
      )}
    </section>
  );
}
