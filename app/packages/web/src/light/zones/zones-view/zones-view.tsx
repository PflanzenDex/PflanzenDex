import { Form, FormRoot } from "@/components/ui/fields/form/form";
import type { ApiError, LightZone } from "../../shared/light-api/light-api";
import { FORM_GRID, FormButtons, RefusalAlert, useSaveForm } from "../../shared/ui/form/form";
import { TextField } from "@/components/ui/fields/input/input";
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
