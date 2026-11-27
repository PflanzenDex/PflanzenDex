import type { Control } from "react-hook-form";
import { WISH_LIMITS, type ZoneStock, zoneLabel } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import type { WishFields } from "../../schemas";

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

type FieldProps = { control: Control<WishFields> };

/** The required name: it stays in the visible part of the form, never behind "Mehr Angaben" (SG-FORM-04). */
export function NameField({ control }: FieldProps) {
  return (
    <FormField
      control={control}
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <Input {...field} autoComplete="off" maxLength={WISH_LIMITS.name.max} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The German name, optional, behind "Mehr Angaben" (SG-FORM-01). */
export function GermanNameField({ control }: FieldProps) {
  return (
    <FormField
      control={control}
      name="german"
      render={({ field }) => (
        <FormItem>
          <FormLabel optional>Deutscher Name</FormLabel>
          <FormControl>
            <Input {...field} autoComplete="off" maxLength={WISH_LIMITS.german.max} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ChoiceFields({ control, zones }: FieldProps & { zones: readonly ZoneStock[] }) {
  return (
    <>
      <FormField
        control={control}
        name="targetZoneId"
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>Ziel-Lichtzone</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">unbekannt</option>
                {zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {zoneLabel(z.name)} — {plants(z.count)}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="difficulty"
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>Schwierigkeit</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">unbekannt</option>
                <option value="1">Leicht</option>
                <option value="2">Mittel</option>
                <option value="3">Schwierig</option>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="reasoning"
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>Begründung</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} maxLength={WISH_LIMITS.reasoning.max} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/** The picture address and its source: both optional as a pair; the https rule is named in the error text only (SG-FORM-01). */
export function ImageFields({ control }: FieldProps) {
  return (
    <>
      <FormField
        control={control}
        name="imageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>Bild-Adresse</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="url"
                inputMode="url"
                autoComplete="off"
                maxLength={WISH_LIMITS.imageUrl.max}
              />
            </FormControl>
            <FormDescription>
              Das Bild wird nicht geladen: Auf der Karte erscheint nur ein Link zur Adresse, der
              erst auf deinen Klick hin öffnet.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="imageSource"
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>Bildquelle</FormLabel>
            <FormControl>
              <Input {...field} autoComplete="off" maxLength={WISH_LIMITS.imageSource.max} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
