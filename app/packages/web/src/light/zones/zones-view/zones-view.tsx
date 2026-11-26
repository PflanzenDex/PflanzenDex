import { useId } from "react";
import { Form, FormRoot } from "@/shared/ui/form";
import type { ApiError, LightZone } from "../../shared/light-api/light-api";
import { FORM_GRID, RefusalAlert, SaveBar, useSaveForm } from "../../shared/ui/form/form";
import { TextField } from "@/shared/ui/input";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
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

/** `clearNote` removes the form's refusal: a key conflict of a new zone carries a dismiss that calls it (US-QS-03). */
type Save = (e: ZoneInput, clearNote: () => void) => Promise<ApiError | null>;

const numeric = (limits: readonly [number, number]) =>
  ({ type: "number", inputMode: "numeric", min: limits[0], max: limits[1], step: 1 }) as const;

/** The first values of the zone form: the zone's own values, or empty fields for a new zone. */
function zoneDefaults(z: LightZone | undefined): ZoneFields {
  return {
    name: z?.name ?? "",
    luxCeiling: z ? String(z.luxCeiling) : "",
    ppfd: z?.ppfd == null ? "" : String(z.ppfd),
    sortOrder: z?.sortOrder == null ? "" : String(z.sortOrder),
  };
}

/** Form for creating and changing a zone; fields stay in place on an error. */
export function ZoneForm(props: { start?: LightZone; onSave: Save; onCancel?: () => void }) {
  const z = props.start;
  const sent = useSaveForm<ZoneFields>({
    schema: zoneSchema,
    defaults: zoneDefaults(z),
    save: (f, clearNote) => props.onSave(toZoneInput(f), clearNote),
    refusable: ZONE_REFUSABLE,
    clear: !z,
  });
  const { control } = sent.form;
  const formId = useId();
  // Typed input that is not saved asks before the layer of the zone closes (US-QS-32).
  useUnsavedInput(sent.form.formState.isDirty);
  return (
    <Form {...sent.form}>
      <FormRoot
        id={formId}
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
          label="Lux-Obergrenze"
          suffix="lx"
          {...numeric(LUX_LIMITS)}
        />
        <TextField
          control={control}
          name="ppfd"
          label="PPFD"
          optional
          suffix="µmol/m²/s"
          {...numeric(PPFD_LIMITS)}
        />
        <TextField
          control={control}
          name="sortOrder"
          label="Reihenfolge"
          optional
          {...numeric(ORDER_LIMITS)}
        />
        <RefusalAlert sent={sent} />
        <SaveBar
          formId={formId}
          label={z ? "Sichern" : "Lichtzone anlegen"}
          running={sent.running}
          onCancel={props.onCancel}
        />
      </FormRoot>
    </Form>
  );
}
