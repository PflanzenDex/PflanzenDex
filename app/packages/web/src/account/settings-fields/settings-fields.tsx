import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { Input } from "@/components/ui/fields/input/input";
import { POSITION_THRESHOLD_DEFAULTS as DEFAULTS } from "@pflanzendex/core";
import { OCCASIONS, type Occasion } from "../api/account-api";
import { formatLux, parseLux, type ProfileFields as Fields } from "../schemas";

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
          <MoreHelp more="Die Wunschliste warnt, wenn eine Zone 2 bis 4 weniger offene Wünsche hat. Ganze Zahl von 0 bis 10, 2 ist die Vorgabe; 0 schaltet die Warnung aus.">
            Die Wunschliste warnt bei zu wenigen offenen Wünschen.
          </MoreHelp>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The labels of the four thresholds, from the highest to the lowest (US-LIC-03, FR-LIC-05). */
const POSITION_LABELS = [
  "Direkt unter der Lampe ab",
  "Sehr nah ab",
  "Nah ab",
  "Mittlerer Abstand ab",
] as const;

/** The four thresholds of the position recommendation: one labelled field each, German grouping, the unit Lux. */
export function ThresholdsField({ control }: FieldProps) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <legend className="p-0 text-sm font-medium">Schwellen der Positionsempfehlung</legend>
      <MoreHelp more={`Vorgabe: ${DEFAULTS.map(formatLux).join(", ")} Lux (eine Annahme).`}>
        Vier Lux-Werte von hoch nach niedrig.
      </MoreHelp>
      {POSITION_LABELS.map((label, i) => (
        <FormField
          key={label}
          control={control}
          name={`positionThresholds.${i}`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    {...field}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                    onBlur={() => {
                      const n = parseLux(field.value);
                      if (n !== null) field.onChange(formatLux(n));
                      field.onBlur();
                    }}
                  />
                </FormControl>
                <span className="whitespace-nowrap">Lux</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </fieldset>
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
            <MoreHelp more="Freunde finden dich über eine Einladung, nicht über den Namen.">
              Jeder Name geht, er darf aber nicht leer sein.
            </MoreHelp>
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
