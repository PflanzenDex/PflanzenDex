import { useState } from "react";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { Button } from "@/components/ui/button/button";
import type { ApiError, LightZone } from "../../shared/light-api/light-api";
import { FORM_GRID, FormButtons, RefusalAlert, useSaveForm } from "../../shared/ui/form/form";
import { TextField } from "@/components/ui/fields/input/input";
import { ErrorMessage } from "../../shared/ui/message/message";
import {
  LUX_LIMITS,
  NAME_MAX,
  ORDER_LIMITS,
  PPFD_LIMITS,
  ZONE_REFUSABLE,
  toZoneInput,
  zoneSchema,
  type ZoneFields,
} from "../../shared/schemas";
import { lux, ppfd } from "../../shared/texts";

export interface ZoneInput {
  name: string;
  luxCeiling: number;
  ppfd: number | null;
  sortOrder: number | null;
}

type Save = (e: ZoneInput) => Promise<ApiError | null>;

const numeric = (limits: readonly [number, number]) =>
  ({ type: "number", inputMode: "numeric", min: limits[0], max: limits[1], step: 1 }) as const;

/** Form for creating and changing a zone; fields stay in place on an error. */
export function ZoneForm(props: { start?: LightZone; onSave: Save; onCancel?: () => void }) {
  const z = props.start;
  const sent = useSaveForm<ZoneFields>({
    schema: zoneSchema,
    defaults: {
      name: z?.name ?? "",
      luxCeiling: z ? String(z.luxCeiling) : "",
      ppfd: z?.ppfd == null ? "" : String(z.ppfd),
      sortOrder: z?.sortOrder == null ? "" : String(z.sortOrder),
    },
    save: (f) => props.onSave(toZoneInput(f)),
    refusable: ZONE_REFUSABLE,
    clear: !z,
  });
  const { control } = sent.form;
  return (
    <Form {...sent.form}>
      <FormRoot
        className={FORM_GRID}
        onSubmit={sent.send}
        aria-label={z ? `${z.name} ändern` : "Lichtzone anlegen"}
      >
        <TextField
          control={control}
          name="name"
          label="Name"
          maxLength={NAME_MAX}
          autoComplete="off"
        />
        <TextField
          control={control}
          name="luxCeiling"
          label="Lux-Decke (Lux)"
          {...numeric(LUX_LIMITS)}
        />
        <TextField
          control={control}
          name="ppfd"
          label="PPFD, optional (µmol/m²/s)"
          {...numeric(PPFD_LIMITS)}
        />
        <TextField
          control={control}
          name="sortOrder"
          label="Reihenfolge, optional"
          {...numeric(ORDER_LIMITS)}
        />
        <RefusalAlert sent={sent} />
        <FormButtons
          label={z ? "Speichern" : "Zone anlegen"}
          running={sent.running}
          onCancel={props.onCancel}
        />
      </FormRoot>
    </Form>
  );
}

function DeleteConfirm(props: { name: string; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="mt-3 flex flex-col gap-3 md:flex-row">
      <Button type="button" variant="destructive" onClick={props.onDelete}>
        Ja, „{props.name}“ löschen
      </Button>
      <Button type="button" variant="secondary" onClick={props.onCancel}>
        Abbrechen
      </Button>
    </div>
  );
}

export const ENTRY = "min-w-0 break-words rounded-lg border border-border p-4";

export function ZoneCard(props: {
  zone: LightZone;
  onUpdate: Save;
  onDelete: () => Promise<ApiError | null>;
}) {
  const { zone } = props;
  const [mode, setMode] = useState<"zeigen" | "update" | "remove">("zeigen");
  const [error, setError] = useState<ApiError | null>(null);
  if (mode === "update")
    return (
      <li className={ENTRY}>
        <ZoneForm
          start={zone}
          onCancel={() => setMode("zeigen")}
          onSave={async (e) => {
            const f = await props.onUpdate(e);
            if (!f) setMode("zeigen");
            return f;
          }}
        />
      </li>
    );
  return (
    <li className={ENTRY}>
      <h3 className="text-lg font-semibold">{zone.name}</h3>
      <p className="text-sm text-muted-foreground">
        bis {lux(zone.luxCeiling)} · {ppfd(zone.ppfd)} · Platz {zone.sortOrder}
      </p>
      {error && <ErrorMessage error={error} />}
      {mode === "remove" ? (
        <DeleteConfirm
          name={zone.name}
          onDelete={() =>
            void props.onDelete().then((f) => {
              setError(f);
              if (f) setMode("zeigen");
            })
          }
          onCancel={() => setMode("zeigen")}
        />
      ) : (
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          {(["update", "remove"] as const).map((target) => (
            <Button
              key={target}
              type="button"
              variant="secondary"
              onClick={() => {
                setError(null);
                setMode(target);
              }}
            >
              {target === "update" ? "Ändern" : "Löschen"}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
