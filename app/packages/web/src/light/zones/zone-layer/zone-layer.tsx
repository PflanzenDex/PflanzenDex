import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { returnFocus } from "@/shared/platform/routing/route-focus/view-start";
import type { ApiError, LightZone } from "../../shared/light-api/light-api";
import { ErrorMessage } from "../../shared/ui/message/message";
import { ZoneForm, type ZoneInput } from "../zones-view/zones-view";
import { zoneLabel } from "@pflanzendex/core";

type Save = (e: ZoneInput) => Promise<ApiError | null>;

/** The id of the layer that changes one zone (`?sheet=zone-<id>`, US-QS-19). */
export const zoneLayerId = (id: string) => `zone-${id}`;

/**
 * The delete of the zone with its focus (SG-BASE-01, issue 2465): the zone leaves its list and the row that opened this layer
 * goes with it, so the layer has no opener to return the focus to and it would fall to the body. The layer leaves with its
 * zone; then the focus goes to the start of the view (`returnFocus`: its heading), and only when nothing else holds it. A
 * refused delete leaves the layer and the focus where they are.
 */
function useDeleteWithFocus(onDelete: () => Promise<ApiError | null>) {
  const deleting = useRef(false);
  useEffect(
    () => () => {
      if (deleting.current) returnFocus(null);
    },
    [],
  );
  return () => {
    deleting.current = true;
    return onDelete().then((f) => {
      deleting.current = f === null;
      return f;
    });
  };
}

/**
 * The layer that changes one light zone (US-QS-19, US-LIC-05): the form, and deleting, which lives only here and asks
 * first. A refused deletion (zone in use) stays in the layer with its reason (P-10). A deleted zone leaves the focus on
 * the heading of the list view (`useDeleteWithFocus`).
 */
export function ZoneLayer(props: {
  zone: LightZone;
  onUpdate: Save;
  onDelete: () => Promise<ApiError | null>;
}) {
  const { zone } = props;
  const { closeLayer } = useLayer(zoneLayerId(zone.id));
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const remove = useDeleteWithFocus(props.onDelete);
  return (
    <LayerSheet id={zoneLayerId(zone.id)} title="Lichtzone ändern">
      <div className="flex flex-col gap-4">
        <ZoneForm
          start={zone}
          onCancel={closeLayer}
          onSave={async (e) => {
            const f = await props.onUpdate(e);
            if (!f) closeLayer();
            return f;
          }}
        />
        {error && <ErrorMessage error={error} />}
        {asking ? (
          <div className="flex flex-col gap-3">
            <p>Lichtzone „{zoneLabel(zone.name)}“ wirklich löschen?</p>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                void remove().then((f) => {
                  setError(f);
                  if (!f) closeLayer();
                  else setAsking(false);
                })
              }
            >
              „{zoneLabel(zone.name)}“ löschen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Nicht löschen
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive-plain"
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
          >
            Lichtzone löschen
          </Button>
        )}
      </div>
    </LayerSheet>
  );
}
