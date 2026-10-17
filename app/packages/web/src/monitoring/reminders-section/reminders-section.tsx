import { Inbox } from "../inbox/inbox";
import { ReminderSettingsForm } from "../settings/settings-form/settings-form";
import { Subscriptions } from "../settings/subscriptions/subscriptions";

type Token = () => Promise<string | undefined>;

/**
 * The reminders of an account (epic MON) as one section of "Konto": the inbox with what was reminded (US-MON-01), the
 * settings (US-MON-08) and the push subscriptions. Every part loads and fails on its own (P-10).
 */
export function RemindersSection(props: { api: string; token: Token }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Posteingang</h3>
        <Inbox {...props} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Wann erinnern?</h3>
        <ReminderSettingsForm {...props} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Push-Geräte</h3>
        <Subscriptions {...props} />
      </div>
    </div>
  );
}
