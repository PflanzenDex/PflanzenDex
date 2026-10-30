import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { POSITION_THRESHOLD_DEFAULTS as DEFAULTS } from "@pflanzendex/core";
import { OCCASIONS, type Occasion } from "../api/account-api";
import type { ProfileFields as Fields } from "../schemas";

export const OCCASION_TEXT: Record<Occasion, string> = {
  phase: "Pflegephasen",
  treatment: "Behandlungen",
  measurement: "Messungen",
  watering: "Gießen",
  swap: "Tausch",
  friends: "Freunde",
  equipment: "Equipment-Prüfung",
};

const zones = (): string[] => {
  const all = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return all ? all("timeZone") : [];
};

type FieldProps = { control: Control<Fields> };

/** The buffer of the wishlist warning (US-WUN-02), an account setting next to the time zone. */
export function BufferField({ control }: FieldProps) {
  return (
    <FormField
      control={control}
      name="replenishBuffer"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Mindestzahl offener Wünsche je Zone</FormLabel>
          <FormControl>
            <Input {...field} inputMode="numeric" autoComplete="off" />
          </FormControl>
          <FormDescription>
            Die Wunschliste warnt, wenn eine Zone 2 bis 4 weniger offene Wünsche hat. Ganze Zahl von
            0 bis 10, 2 ist die Vorgabe; 0 schaltet die Warnung aus.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The thresholds of the position recommendation in the light overview (US-LIC-03, FR-LIC-05). */
export function ThresholdsField({ control }: FieldProps) {
  return (
    <FormField
      control={control}
      name="positionThresholds"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Schwellen der Positionsempfehlung (Lux)</FormLabel>
          <FormControl>
            <Input {...field} inputMode="numeric" autoComplete="off" />
          </FormControl>
          <FormDescription>
            Vier Lux-Werte von hoch nach niedrig. Vorgabe: {DEFAULTS.join(", ")} (eine Annahme).
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function NameFields({ control, fromDevice }: FieldProps & { fromDevice: boolean }) {
  return (
    <>
      <FormField
        control={control}
        name="displayName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Anzeigename</FormLabel>
            <FormControl>
              <Input {...field} autoComplete="nickname" maxLength={80} />
            </FormControl>
            <FormDescription>
              Du kannst jeden Namen wählen, er muss nicht einmalig sein, darf aber nicht leer sein.
              Freunde finden dich über eine Einladung, nicht über den Namen.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="timeZone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Zeitzone</FormLabel>
            <FormControl>
              <Input {...field} list="time-zones" autoComplete="off" />
            </FormControl>
            <datalist id="time-zones">
              {zones().map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <FormDescription>
              {fromDevice
                ? "Vom Gerät übernommen. Speichere, um sie festzulegen."
                : "Pflegephasen, Termine und „heute“ richten sich nach dieser Zeitzone."}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/** The occasions about swapping and friends have no meaning while "social" is off (US-DEV-06); the stored values stay. */
const SOCIAL_OCCASIONS: readonly Occasion[] = ["swap", "friends"];

/** The occasions that have a switch: swapping and friends only while the function group "social" is on. */
export const visibleOccasions = (social: boolean): Occasion[] =>
  OCCASIONS.filter((o) => social || !SOCIAL_OCCASIONS.includes(o));
