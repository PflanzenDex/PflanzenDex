import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useFeature, useInvalidate, type ApiError } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { Button } from "@/shared/ui/button";
import { loadEquipment, type EquipmentData } from "../equipment-api";
import { useLampActions } from "./lamp-actions/lamp-actions";
import { LampOutcome } from "./lamp-actions/lamp-outcome/lamp-outcome";
import { useWishActions } from "../overviews/wishes-view/use-wish-actions";
import { useRecord } from "./equipment-screen/use-record/use-record";
import { EquipmentLayers } from "./equipment-screen/layers/equipment-layers/equipment-layers";
import { EquipmentTiles } from "./equipment-screen/tiles/equipment-tiles/equipment-tiles";
import { EquipmentPageSkeleton } from "./equipment-page.skeleton";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

const KEY = ["equipment", "list"] as const;
type Token = () => Promise<string | undefined>;
/**
 * A refusal belongs to the layer it happened in: it is gone for good when that layer closes or another one opens, so it never
 * stands in a later sheet, on the page behind or when the same layer is opened again (F-0160, P-10). A new refusal is told by
 * `failures`, not by the error object: a repeated refusal can be the same object.
 */
function useRefusalOf(error: ApiError | null, failures: number, sheet: string | null) {
  const [born, setBorn] = useState({ failures, sheet, gone: false });
  if (born.failures !== failures) setBorn({ failures, sheet, gone: false });
  else if (!born.gone && born.sheet !== sheet) setBorn({ ...born, gone: true });
  return born.failures === failures && !born.gone ? error : null;
}

/**
 * The equipment on one screen (US-QS-22): the tiles with their counts and the one primary action "Gerät erfassen". A
 * write shows at its row or control and is announced (SG-FEED-01, F-0160); only a refusal is shown, in its layer.
 * "Gekauft" on an equipment wish fills the form and opens it (US-EQU-08).
 */
function Body(props: { data: EquipmentData; api: string; token: Token; onWritten: () => void }) {
  const { write, send, prefill, fill, openLayer } = useRecord(
    props.api,
    props.token,
    props.onWritten,
  );
  const sheet = useSearchParams()[0].get("sheet");
  const lamps = useLampActions(props.api, props.token, props.onWritten, props.data.sharing);
  const wishes = useWishActions(props.api, props.token, props.onWritten, fill);
  const lampError = useRefusalOf(lamps.error, lamps.failures, sheet);
  const wishError = useRefusalOf(wishes.error, wishes.failures, sheet);
  const outcome = (
    <>
      <LampOutcome error={lampError} />
      <LampOutcome error={wishError} />
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button type="button" aria-haspopup="dialog" onClick={(e) => openLayer(e.currentTarget)}>
        Gerät erfassen
      </Button>
      {props.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Gerät erfasst.</p>
      ) : null}
      <EquipmentTiles data={props.data} />
      <EquipmentLayers
        data={props.data}
        lamps={lamps}
        wishes={wishes}
        prefill={prefill}
        fill={fill}
        outcome={outcome}
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
    host?.onCaption(count === 1 ? "1\u00a0Gerät" : `${count}\u00a0Geräte`);
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
            Geräte
          </h2>
        ) : (
          <PageHeader headingId="equipment-title" title="Geräte" />
        )}
        <p className="text-sm text-muted-foreground">
          Alles für die Pflege außer den Pflanzen; Fehlendes bleibt „unbekannt“.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Geräte werden geladen …"
          loadingFallback={<EquipmentPageSkeleton label="Geräte werden geladen …" />}
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
