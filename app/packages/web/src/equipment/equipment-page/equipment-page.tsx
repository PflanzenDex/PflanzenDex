import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import { LoadFrame, useFeature, useInvalidate } from "../../kernel";
import { Button } from "@/components/ui/button/button";
import { loadEquipment, type EquipmentData } from "../equipment-api";
import { LampOutcome, useLampActions } from "./lamp-actions/lamp-actions";
import { useWishActions } from "../overviews/wishes-view/use-wish-actions";
import { useRecord } from "./equipment-screen/use-record/use-record";
import { EquipmentLayers } from "./equipment-screen/layers/equipment-layers/equipment-layers";
import { EquipmentTiles } from "./equipment-screen/tiles/equipment-tiles/equipment-tiles";
import { EquipmentPageSkeleton } from "./equipment-page.skeleton";

const KEY = ["equipment", "list"] as const;
type Token = () => Promise<string | undefined>;
/**
 * The equipment on one screen (US-QS-22): the outcome of the last write, the tiles with their counts and the one
 * primary action "Equipment erfassen". "Gekauft" on an equipment wish fills the form and opens it (US-EQU-08).
 */
function Body(props: { data: EquipmentData; api: string; token: Token; onWritten: () => void }) {
  const { write, send, prefill, fill, openLayer } = useRecord(
    props.api,
    props.token,
    props.onWritten,
  );
  // A write inside a layer shows its outcome there, because the screen behind the layer is covered (P-10).
  const layered = useSearchParams()[0].has("sheet");
  const lamps = useLampActions(props.api, props.token, props.onWritten, props.data.sharing);
  const wishes = useWishActions(props.api, props.token, props.onWritten, fill);
  const outcome = (
    <>
      <LampOutcome message={lamps.message} error={lamps.error} />
      <LampOutcome message={wishes.message} error={wishes.error} />
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {write.message ? (
        <p role="status" className="rounded-lg border border-border p-2">
          {write.message}
        </p>
      ) : null}
      {layered ? null : outcome}
      <Button type="button" aria-haspopup="dialog" onClick={(e) => openLayer(e.currentTarget)}>
        Equipment erfassen
      </Button>
      {props.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch kein Equipment erfasst. Nur Art und Name sind nötig.
        </p>
      ) : null}
      <EquipmentTiles data={props.data} />
      <EquipmentLayers
        data={props.data}
        lamps={lamps}
        wishes={wishes}
        prefill={prefill}
        outcome={layered ? outcome : null}
        running={write.running}
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
  const social = useFeature("social");
  const recommendations = useFeature("recommendations");
  const load = useCallback(
    (t: string) => loadEquipment(api, t, fetch, { sharing: social, recommendations }),
    [api, social, recommendations],
  );
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
        <p className="text-sm text-muted-foreground">
          Alles für die Pflege außer den Pflanzen; Fehlendes bleibt „unbekannt“.
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
