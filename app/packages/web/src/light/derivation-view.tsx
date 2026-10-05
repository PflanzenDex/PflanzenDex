import { useState } from "react";
import type { Control } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import type { DerivationRequest, Derivation, Response } from "./light-api";
import { FORM_GRID, RefusalAlert, SelectField, TextField, useSaveForm } from "./form";
import {
  DERIVATION_REFUSABLE,
  LUX_LIMITS,
  derivationSchema,
  toDerivationRequest,
  type DerivationFields,
} from "./schemas";
import { derivationText } from "./text";

function SoftLeaf({ control }: { control: Control<DerivationFields> }) {
  return (
    <FormField
      control={control}
      name="softLeaf"
      render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormControl>
            <Checkbox
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            >
              Sonnenliebende C3-Pflanze mit weichem Blatt
            </Checkbox>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export type Derive = (a: DerivationRequest) => Promise<Response<Derivation>>;

/** US-LIC-01: shows which zone of your account a species is assigned to according to its lux need. */
export function DerivationForm({ onDerive }: { onDerive: Derive }) {
  const [response, setResponse] = useState<Response<Derivation> | null>(null);
  const sent = useSaveForm<DerivationFields>({
    schema: derivationSchema,
    defaults: { lightDemandLux: "", standardLevel: "2", softLeaf: false },
    save: async (f) => {
      const r = await onDerive(toDerivationRequest(f));
      setResponse(r);
      return r.ok ? null : r.error;
    },
    refusable: DERIVATION_REFUSABLE,
    clear: false,
  });
  const { control } = sent.form;
  const text = response?.ok ? derivationText(response.value) : null;
  return (
    <Form {...sent.form}>
      <form
        noValidate
        className={FORM_GRID}
        onSubmit={(e) => void sent.send(e)}
        aria-label="Zone ermitteln"
      >
        <TextField
          control={control}
          name="lightDemandLux"
          label="Lux-Bedarf der Art (Lux)"
          type="number"
          inputMode="numeric"
          min={LUX_LIMITS[0]}
          max={LUX_LIMITS[1]}
          step={1}
        />
        <SelectField control={control} name="standardLevel" label="Standard-Stufe">
          <option value="2">Stufe 2</option>
          <option value="3">Stufe 3</option>
          <option value="4">Stufe 4</option>
        </SelectField>
        <SoftLeaf control={control} />
        <RefusalAlert sent={sent} />
        {text && (
          <div
            role="status"
            className="flex min-w-0 flex-col gap-1 break-words rounded-lg border border-border p-3 md:col-span-2"
          >
            <p>
              <strong>{text.title}</strong>
            </p>
            <p>{text.reason}</p>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" disabled={sent.running}>
            Zone ermitteln
          </Button>
        </div>
      </form>
    </Form>
  );
}
