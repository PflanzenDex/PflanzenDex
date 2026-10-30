import { useCallback, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import type { LightZone, SpecimenCard } from "@pflanzendex/core";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormRoot,
} from "@/components/ui/fields/form/form";
import { Select } from "@/components/ui/fields/select/select";
import type { ApiError } from "../../../../kernel";
import { loadCards } from "../../../specimens/cards/cards-api";
import { FormButtons, Quiet, TITLE, Warning } from "../../../specimens/cards/parts/parts";
import { useZones } from "../../../specimens/create/use-create";
import { SIGN_IN, type Token } from "../../../specimens/hooks/use-collection";
import { refusalText } from "../../../specimens/model/refusal";
import { setLightZone } from "../../../specimens/model/specimens-api";
import { zoneText } from "../../../specimens/model/text";
import { zoneLabel } from "@pflanzendex/core";

type ZoneFields = { lightZoneId: string };

const NEXT_FOR_UNKNOWN =
  "Welche Zone gilt, ist unbekannt. Weise dem Standort eine Lichtzone zu oder setze die Zone der Pflanze selbst.";

/** What the keeper sees after clearing: which zone applies again, from the freshly loaded card (P-09, P-08). */
async function derivedText(api: string, token: string, id: string, name: string): Promise<string> {
  const head = `Die eigene Lichtzone von „${name}“ ist entfernt.`;
  const r = await loadCards(api, token);
  const card = r.ok ? r.value.find((c) => c.id === id) : undefined;
  if (!card) return `${head} Welche Zone jetzt gilt, zeigt die Karte nach dem Neuladen.`;
  if (!card.lightZone) return `${head} ${NEXT_FOR_UNKNOWN}`;
  return `${head} Es gilt wieder die abgeleitete Zone: ${zoneText(card)}.`;
}

const setText = (card: SpecimenCard, zone: LightZone): string =>
  `Die Lichtzone von „${card.name}“ ist jetzt „${zoneLabel(zone.name)}“ (von dir gesetzt). ` +
  (card.status === "cutting"
    ? "Als Steckling steht es weiter unter Stecklingslicht; die Zone gilt, sobald du es eintopfst."
    : "Die Verteilung unter „Lichtzonen“ zählt die Pflanze dort mit.");

/**
 * State and action for the own light zone of an existing specimen (US-LIC-02, US-BES-04). A zone is set or changed
 * with its ID; `null` clears it and the message names the zone that applies again (P-09). After success the page
 * reloads (`after`); a refusal stays in the form (P-10).
 */
export function useLightZone(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<SpecimenCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const zones = useZones(api, token, !!open);

  const send = useCallback(
    async (lightZoneId: string | null): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !open) return SIGN_IN;
      const r = await setLightZone(api, t, { id: open.id, lightZoneId });
      if (!r.ok) return r.error;
      const zone = zones.items.find((z) => z.id === lightZoneId);
      setMessage(zone ? setText(open, zone) : await derivedText(api, t, open.id, open.name));
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, zones.items, after],
  );

  return { open, message, send, setOpen, setMessage, zones };
}

/** The id of the own zone of the card (empty when the zone is derived). The card names the zone, not its id. */
const ownZoneId = (card: SpecimenCard, zones: readonly LightZone[]): string =>
  card.lightZoneSource === "specimen"
    ? (zones.find((z) => z.name === card.lightZone)?.id ?? "")
    : "";

/** The select of the own zones; the empty option clears the own zone (derived again). */
function ZoneSelect(props: { control: Control<ZoneFields>; zones: readonly LightZone[] }) {
  return (
    <FormField
      control={props.control}
      name="lightZoneId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Eigene Lichtzone</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">Aus Standort und Art ableiten</option>
              {props.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {zoneLabel(z.name)}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormDescription>
            Ohne Auswahl wird die Zone wieder abgeleitet; danach siehst du auf der Karte, welche
            gilt.
          </FormDescription>
        </FormItem>
      )}
    />
  );
}

/**
 * Set, change or clear the own light zone of an existing specimen (US-LIC-02, US-BES-04). The zone is chosen from the
 * own zones, never typed. "Aus Standort und Art ableiten" clears it; the form says which zone applies now.
 */
export function LightZoneForm(props: {
  state: Pick<ReturnType<typeof useLightZone>, "send" | "setOpen" | "zones"> & {
    open: SpecimenCard;
  };
}) {
  const { open: card, send, setOpen, zones } = props.state;
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<ZoneFields>({ values: { lightZoneId: ownZoneId(card, zones.items) } });
  const submit = form.handleSubmit(async ({ lightZoneId }) =>
    setError(await send(lightZoneId === "" ? null : lightZoneId)),
  );
  return (
    <section aria-labelledby="light-zone-title">
      <h1 id="light-zone-title" className={TITLE}>
        Lichtzone ändern
      </h1>
      <p className="mb-2 text-muted-foreground">„{card.name}“</p>
      <Quiet className="mb-5">
        Jetzt: {zoneText(card)}.{" "}
        {card.status === "cutting"
          ? "Ein Steckling steht unter Stecklingslicht; die eigene Zone gilt erst nach dem Eintopfen."
          : "Die eigene Zone geht vor der Zone von Standort und Art."}
      </Quiet>
      {zones.failed && (
        <Warning>
          <p>Die Lichtzonen konnten nicht geladen werden. Versuche es später noch einmal.</p>
        </Warning>
      )}
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Lichtzone ändern"
          className="flex max-w-xl flex-col gap-4"
        >
          <ZoneSelect control={form.control} zones={zones.items} />
          {error && (
            <Warning>
              <p>{refusalText(error)}</p>
            </Warning>
          )}
          <FormButtons
            submit="Lichtzone speichern"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={() => setOpen(null)}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
