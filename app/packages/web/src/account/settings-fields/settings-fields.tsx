import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { MoreHelp } from "@/shared/ui/more-help";
import { FieldLegend, FieldSet } from "@/shared/ui/field.set";
import { Input } from "@/shared/ui/input";
import { Stepper } from "@/shared/ui/stepper";
import {
  POSITION_THRESHOLD_DEFAULTS as DEFAULTS,
  REPLENISH_BUFFER_LIMITS as BUFFER,
} from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { OCCASIONS, type Occasion } from "../api/account-api";
import { formatLux, parseLux, type ProfileFields as Fields } from "../schemas";
import table from "./settings-fields.de.json";

const ui = texts(table);

export const OCCASION_TEXT: Record<Occasion, string> = {
  phase: "Pflegephasen",
  treatment: "Behandlungen",
  measurement: "Messungen",
  watering: "Gießen",
  swap: "Tausch",
  friends: "Freunde",
  equipment: "Geräte-Prüfung",
};

const zones = (): string[] => {
  const all = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return all ? all("timeZone") : [];
};

type FieldProps = { control: Control<Fields> };

/**
 * The buffer of the wishlist warning (US-WUN-02), an account setting next to the time zone. A whole number from 0 to 10 is a
 * stepper (US-QS-32, SG-CTRL-04): no keyboard opens and no wrong number can be typed. The form keeps the number as text, as
 * the other fields do; the group still saves it with "Sichern".
 */
export function BufferField({ control }: FieldProps) {
  return (
    <FormField
      control={control}
      name="replenishBuffer"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Stepper
              label={ui("bufferLabel")}
              min={BUFFER.min}
              max={BUFFER.max}
              value={Number(field.value)}
              onChange={(n) => field.onChange(String(n))}
            />
          </FormControl>
          <MoreHelp more={ui("bufferMore")}>{ui("bufferHelp")}</MoreHelp>
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
    <FieldSet>
      <FieldLegend variant="label" className="mb-0">
        Schwellen der Positionsempfehlung
      </FieldLegend>
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
    </FieldSet>
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
                ? "Vom Gerät übernommen. Sichere, um sie festzulegen."
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
