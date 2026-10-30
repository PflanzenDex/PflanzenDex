import { Button } from "@/components/ui/button/button";
import { LayerPart } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { Inbox } from "../inbox/inbox";
import {
  PAUSES_FORM,
  ReminderPausesForm,
  ReminderTimesForm,
  TIMES_FORM,
} from "../settings/settings-form/settings-form";
import { Subscriptions } from "../settings/subscriptions/subscriptions";

type Token = () => Promise<string | undefined>;

/**
 * The reminders of an account (epic MON) as one section of "Konto" (US-QS-17): four rows, each opens its layer
 * (US-QS-15). The inbox with what was reminded (US-MON-01), the settings in two layers (US-MON-08: "Wann erinnern?" and
 * "Pausen je Anlass", each saved from its own footer) and the push subscriptions. Every part loads and fails on its own
 * (P-10); a closed layer loads nothing.
 */
export function RemindersSection(props: { api: string; token: Token }) {
  return (
    <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
      <LayerPart id="inbox" title="Posteingang" value="Was dich erinnert hat">
        <Inbox {...props} />
      </LayerPart>
      <LayerPart
        id="times"
        title="Wann erinnern?"
        value="Uhrzeit, Ruhezeit und Messung"
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
      <LayerPart id="devices" title="Push-Geräte" value="Browser für Push abmelden">
        <Subscriptions {...props} />
      </LayerPart>
    </div>
  );
}
