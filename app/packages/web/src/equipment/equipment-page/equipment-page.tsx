import { useCallback, useEffect, useState } from "react";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { EquipmentForm } from "../equipment-form/equipment-form";
import {
  loadEquipment,
  recordEquipment,
  type EquipmentData,
  type EquipmentInput,
  type EquipmentRow,
} from "../equipment-api";
import { STATUS_LABELS, TYPE_LABELS } from "../labels";
import { LampLightView } from "../lamp-light/lamp-light";
import { LampOutcome, useLampActions } from "./lamp-actions/lamp-actions";
import { Maintenance, type MaintenanceActions } from "./parts/maintenance/maintenance";
import { Supply, type SupplyActions } from "./parts/supply/supply";
import { Sharing, type SharingActions } from "./parts/sharing/sharing";
import { CostsView } from "../overviews/costs-view/costs-view";
import { NeedsView } from "../overviews/needs-view/needs-view";
import { SensorsView } from "../overviews/sensors-view/sensors-view";
import { useWishActions } from "../overviews/wishes-view/use-wish-actions";
import { WishesView } from "../overviews/wishes-view/wishes-view";
import type { EquipmentPrefill } from "../overviews/wishes-view/wishes-api";
import { ZonesView } from "../overviews/zones-view/zones-view";
import { EquipmentPageSkeleton } from "./equipment-page.skeleton";

const KEY = ["equipment", "list"] as const;
type Token = () => Promise<string | undefined>;
const UNKNOWN = "unbekannt";

const focusForm = () =>
  document
    .querySelector<HTMLElement>('section[aria-labelledby="equipment-form-title"] select')
    ?.focus();

/** One record: what is missing reads "unbekannt", never a guess (P-08). */
function Card(props: {
  item: EquipmentRow;
  zone: string | undefined;
  maintenance: MaintenanceActions;
  supply: SupplyActions;
  sharing: SharingActions;
}) {
  const { item, zone } = props;
  const maker = [item.manufacturer, item.model].filter(Boolean).join(" ");
  const price =
    item.priceEur === null ? UNKNOWN : `${item.priceEur.toFixed(2).replace(".", ",")} €`;
  return (
    <li className="min-w-0 rounded-lg border border-border p-3">
      <h3 className="break-words font-semibold">{item.name}</h3>
      <p className="text-sm text-muted-foreground">
        {TYPE_LABELS[item.type]}
        {item.status ? ` · ${STATUS_LABELS[item.status]}` : ""}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>Hersteller und Modell</dt>
        <dd className="m-0">{maker || UNKNOWN}</dd>
        <dt>Produkt-ID</dt>
        <dd className="m-0 break-all">{item.productId ?? UNKNOWN}</dd>
        {item.type === "Lamp" ? (
          <>
            <dt>Lichtzone</dt>
            <dd className="m-0">{zone ?? "ohne Zone"}</dd>
          </>
        ) : null}
        <dt>Preis</dt>
        <dd className="m-0">{price}</dd>
        <dt>Gekauft am</dt>
        <dd className="m-0">{item.boughtAt ?? UNKNOWN}</dd>
      </dl>
      {item.note ? <p className="mt-2 break-words text-sm">{item.note}</p> : null}
      <Supply item={item} actions={props.supply} />
      <Maintenance item={item} actions={props.maintenance} />
      <Sharing item={item} actions={props.sharing} />
    </li>
  );
}

function Body(props: { data: EquipmentData; api: string; token: Token; onWritten: () => void }) {
  const write = useWriteAction(props.token, props.onWritten);
  const lamps = useLampActions(props.api, props.token, props.onWritten, props.data.sharing);
  // "Gekauft" on a wish fills the form below (US-EQU-08).
  const [prefill, setPrefill] = useState<EquipmentPrefill | null>(null);
  const wishes = useWishActions(props.api, props.token, props.onWritten, setPrefill);
  const items = props.data.items;
  const zoneNames = new Map(props.data.zones.zones.map((z) => [z.zoneId, z.name]));
  const send = async (input: EquipmentInput): Promise<boolean> => {
    let saved = false;
    await write.run(async (t) => {
      const r = await recordEquipment(props.api, t, input);
      saved = r.ok;
      return r;
    }, `Equipment „${input.name}“ gespeichert.`);
    return saved;
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {items.length === 0 ? (
        <EmptyState
          title="Noch kein Equipment erfasst"
          description="Erfasse Lampen, Zeitschaltuhren, Substrat und mehr. Nur Art und Name sind nötig."
          action={{ label: "Equipment erfassen", onClick: focusForm }}
        />
      ) : (
        <ul
          className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Dein Equipment"
        >
          {items.map((item) => (
            <Card
              key={item.id}
              item={item}
              zone={zoneNames.get(item.lightZoneId ?? "")}
              maintenance={lamps.maintenance}
              supply={lamps.supply}
              sharing={lamps.sharing}
            />
          ))}
        </ul>
      )}
      <LampOutcome message={lamps.message} error={lamps.error} />
      <LampOutcome message={wishes.message} error={wishes.error} />
      <CostsView items={items} />
      <NeedsView needs={props.data.needs} />
      <ZonesView view={props.data.zones} actions={lamps.actions} />
      <LampLightView view={props.data.light} actions={lamps.light} />
      <SensorsView view={props.data.sensors} actions={lamps.sensors} />
      <WishesView wishes={props.data.wishes} actions={wishes.actions} />
      <EquipmentForm
        prefill={prefill}
        zones={props.data.zones.zones}
        running={write.running}
        message={write.message}
        error={write.error}
        onSend={send}
      />
    </div>
  );
}

type Host = { onCaption: (text: string | null) => void };

function ReportCaption({ host, count }: { host: Host | undefined; count: number }) {
  useEffect(() => {
    host?.onCaption(count === 1 ? "1 Teil Equipment" : `${count} Teile Equipment`);
    return () => host?.onCaption(null);
  }, [host, count]);
  return null;
}

/**
 * Equipment (US-EQU-01): the list of what the keeper owns and the form to record more. It works without any
 * recommendation (FR-EQU-01) and is private to the account (P-05). The destination "Sammlung" shows it below its title.
 */
export function EquipmentPage(props: { api: string; token: Token; host?: Host }) {
  const { api, token, host } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadEquipment(api, t), [api]);
  return (
    <div className={host ? "min-w-0" : "rounded-2xl border border-border bg-card px-4 py-6 md:p-7"}>
      <section aria-labelledby="equipment-title" className="flex min-w-0 flex-col gap-3">
        {host ? (
          <h2 id="equipment-title" className="sr-only">
            Equipment
          </h2>
        ) : (
          <h1 id="equipment-title" className="text-2xl font-semibold">
            Equipment
          </h1>
        )}
        <p className="text-muted-foreground">
          Alles, was du für die Pflege brauchst, außer den Pflanzen. Fehlende Angaben bleiben
          „unbekannt“.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Equipment wird geladen …"
          loadingFallback={<EquipmentPageSkeleton label="Equipment wird geladen …" />}
        >
          {(data: EquipmentData) => (
            <>
              <ReportCaption host={host} count={data.items.length} />
              <Body data={data} api={api} token={token} onWritten={reload} />
            </>
          )}
        </LoadFrame>
      </section>
    </div>
  );
}
