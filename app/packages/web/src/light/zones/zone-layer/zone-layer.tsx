import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import type { ApiError, LightZone } from "../../shared/light-api/light-api";
import { ErrorMessage } from "../../shared/ui/message/message";
import { ZoneForm, type ZoneInput } from "../zones-view/zones-view";
import { zoneLabel } from "@pflanzendex/core";

type Save = (e: ZoneInput) => Promise<ApiError | null>;

/** The id of the layer that changes one zone (`?sheet=zone-<id>`, US-QS-19). */
export const zoneLayerId = (id: string) => `zone-${id}`;

/**
 * The layer that changes one light zone (US-QS-19, US-LIC-05): the form, and deleting, which lives only here and asks
 * first. A refused deletion (zone in use) stays in the layer with its reason (P-10).
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
  return (
    <LayerSheet id={zoneLayerId(zone.id)} title="Lichtzone bearbeiten">
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
                void props.onDelete().then((f) => {
                  setError(f);
                  if (!f) closeLayer();
                  else setAsking(false);
                })
              }
            >
              Ja, „{zoneLabel(zone.name)}“ löschen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Nicht löschen
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
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
