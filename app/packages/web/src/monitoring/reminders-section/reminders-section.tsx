import { Button } from "@/shared/ui/button/button";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { texts } from "@/shared/lib/text-rules/texts";
import { Inbox } from "../inbox/inbox";
import {
  PAUSES_FORM,
  ReminderPausesForm,
  ReminderTimesForm,
  TIMES_FORM,
} from "../settings/settings-form/settings-form";
import { Subscriptions } from "../settings/subscriptions/subscriptions";
import table from "../monitoring.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

/**
 * Push is not built yet (issue 2028, US-QS-32): reminders reach the inbox only, so the section says so in one line and
 * shows no row "Push-Geräte" that could sign off browsers. The row "Erinnerungen" of "Konto" and the row
 * "Benachrichtigungen" of "Einstellungen" say the same; the three switch back together once push exists.
 */
const PUSH_SET_UP = false;

/**
 * The reminders of an account (epic MON) as one section of "Konto" (US-QS-17): three rows while push is not set up,
 * each opens its layer (US-QS-15). The inbox with what was reminded (US-MON-01), the settings in two layers (US-MON-08:
 * "Wann erinnern?" and "Pausen je Anlass", each saved from its own footer) and, once push is set up, the push devices.
 * Every part loads and fails on its own (P-10); a closed layer loads nothing.
 */
export function RemindersSection(props: { api: string; token: Token }) {
  return (
    <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
      {!PUSH_SET_UP && (
        <p className="col-span-full m-0 text-sm text-muted-foreground">
          {ui("reminders.inboxOnly")}
        </p>
      )}
      <LayerPart id="inbox" title="Posteingang" value="Was dich erinnert hat">
        <Inbox {...props} />
      </LayerPart>
      <LayerPart
        id="times"
        title="Wann erinnern?"
        value="Uhrzeit, Erinnerungspause und Messung"
        primaryAction={
          <Button type="submit" form={TIMES_FORM} className="w-full">
            Erinnerungen speichern
          </Button>
        }
      >
        <ReminderTimesForm {...props} />
      </LayerPart>
      <LayerPart
        id="pauses"
        title="Pausen je Anlass"
        value="Anlässe bis zu einem Tag pausieren"
        primaryAction={
          <Button type="submit" form={PAUSES_FORM} className="w-full">
            Pausen speichern
          </Button>
        }
      >
        <ReminderPausesForm {...props} />
      </LayerPart>
      {PUSH_SET_UP && (
        <LayerPart id="devices" title="Push-Geräte" value="Browser für Push abmelden">
          <Subscriptions {...props} />
        </LayerPart>
      )}
    </div>
  );
}
