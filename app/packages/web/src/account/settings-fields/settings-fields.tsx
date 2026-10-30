import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { Input } from "@/components/ui/fields/input/input";
import { POSITION_THRESHOLD_DEFAULTS as DEFAULTS } from "@pflanzendex/core";
import { useFeature } from "@/kernel";
import { OCCASIONS, type Occasion } from "../api/account-api";
import type { ProfileFields as Fields } from "../schemas";

const OCCASION_TEXT: Record<Occasion, string> = {
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
function BufferField({ control }: FieldProps) {
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
function ThresholdsField({ control }: FieldProps) {
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

export function ProfileFields({ control, fromDevice }: FieldProps & { fromDevice: boolean }) {
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
      <BufferField control={control} />
      <ThresholdsField control={control} />
    </>
  );
}

const GROUP = "m-0 flex min-w-0 flex-col rounded-lg border-2 border-border px-3 pb-2 pt-1";
const LEGEND = "px-1 font-semibold";
const NOTE = "mt-1 text-sm text-muted-foreground";

/** One switch as a full-row 44 px target; the label text is the accessible name. */
function Switch(props: {
  control: Control<Fields>;
  name: "everythingPrivate" | "noRecommendations" | "rarityConsent" | `notifications.${Occasion}`;
  label: string;
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Checkbox
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            >
              {props.label}
            </Checkbox>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/** The occasions about swapping and friends have no meaning while "social" is off (US-DEV-06); the stored values stay. */
const SOCIAL_OCCASIONS: readonly Occasion[] = ["swap", "friends"];

export function SwitchFields({ control }: FieldProps) {
  const social = useFeature("social");
  return (
    <>
      <fieldset className={GROUP}>
        <legend className={LEGEND}>Benachrichtigungen</legend>
        {OCCASIONS.filter((o) => social || !SOCIAL_OCCASIONS.includes(o)).map((o) => (
          <Switch key={o} control={control} name={`notifications.${o}`} label={OCCASION_TEXT[o]} />
        ))}
        <p className={NOTE}>
          Deine Auswahl wird gespeichert. Erinnerungen werden erst verschickt, wenn sie eingerichtet
          sind.
        </p>
      </fieldset>
      <fieldset className={GROUP}>
        <legend className={LEGEND}>Datenschutz und Empfehlungen</legend>
        <Switch control={control} name="everythingPrivate" label="Alles privat" />
        <Switch control={control} name="noRecommendations" label="Keine Empfehlungen" />
        <Switch
          control={control}
          name="rarityConsent"
          label="Meine Sammlung in die Seltenheit in PflanzenDex einrechnen"
        />
        <p className={NOTE}>
          „Alles privat“ setzt alle Freigaben aus, ohne sie zu löschen. Ohne Empfehlungen zeigt die
          App keine Ausrüstungsvorschläge. Die Seltenheit in PflanzenDex zählt nur Konten, die hier
          zustimmen (Vorgabe: aus); es fließt nur eine Zahl pro Art ein, nie wer eine Art besitzt.
        </p>
      </fieldset>
    </>
  );
}
