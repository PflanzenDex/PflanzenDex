import type { Control } from "react-hook-form";
import { WISH_LIMITS, type ZoneStock } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import type { WishFields } from "../../schemas";

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

type FieldProps = { control: Control<WishFields> };

export function NameFields({ control }: FieldProps) {
  return (
    <>
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
      <FormField
        control={control}
        name="german"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Deutscher Name (optional)</FormLabel>
            <FormControl>
              <Input {...field} autoComplete="off" maxLength={WISH_LIMITS.german.max} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
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
            <FormLabel>Ziel-Lichtzone</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">unbekannt</option>
                {zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {z.name} — {plants(z.count)}
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
            <FormLabel>Schwierigkeit</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">unbekannt</option>
                <option value="1">Leicht</option>
                <option value="2">Mittel</option>
                <option value="3">Schwer</option>
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
            <FormLabel>Begründung (optional)</FormLabel>
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

export function ImageFields({ control }: FieldProps) {
  return (
    <>
      <FormField
        control={control}
        name="imageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Bild-Adresse (https)</FormLabel>
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
            <FormLabel>Bildquelle</FormLabel>
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
