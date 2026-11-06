import { useState } from "react";
import type { KeyboardShortcutMode } from "@pflanzendex/core";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import { MoreHelp } from "@/shared/ui/display/more-help/more-help";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { texts } from "@/shared/lib/text-rules/texts";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import table from "./switch-groups.de.json";
import { useFeature, type ApiError } from "../../../../shared/data";
import type { AccountProfile } from "../../../api/account-api";
import { refusalText } from "@/shared/lib/error-text";
import { ALERT_CLASSES } from "@/shared/ui/fields/form/server-refusal";
import { OCCASION_TEXT, visibleOccasions } from "../../../settings-fields/settings-fields";
import type { ProfileSaver } from "../profile-saver";

type Flag = "everythingPrivate" | "noRecommendations" | "rarityConsent";

/**
 * A switch saves at once (US-QS-17): the whole stored profile with this one change goes out. The switch shows the
 * stored state, so a refused save leaves it where it was and says why by the error code's text (P-10).
 */
function useSwitchSave(saver: ProfileSaver, onSaved?: (profile: AccountProfile) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const change = async (patch: Partial<AccountProfile>) => {
    const r = await saver.save({ ...saver.saved, ...patch });
    if (!r) return;
    setError(r.ok ? null : r.error);
    setSaved(r.ok);
    if (r.ok) onSaved?.(r.value);
  };
  return { error, saved, change };
}

function Feedback(props: { error: ApiError | null; saved: boolean }) {
  if (props.error)
    return (
      <p role="alert" className={ALERT_CLASSES}>
        {refusalText(props.error)}
      </p>
    );
  return props.saved ? (
    <p role="status" className="rounded-lg border border-border p-3">
      Gespeichert.
    </p>
  ) : null;
}

/** Group "Benachrichtigungen": a switch per occasion (US-ACC-02). */
export function NotificationsGroup({ saver }: { saver: ProfileSaver }) {
  const social = useFeature("social");
  const { error, saved, change } = useSwitchSave(saver);
  return (
    <div className="flex flex-col gap-1">
      {visibleOccasions(social).map((o) => (
        <Checkbox
          key={o}
          name={`notifications.${o}`}
          checked={saver.saved.notifications[o]}
          disabled={saver.saving}
          onChange={(e) =>
            void change({ notifications: { ...saver.saved.notifications, [o]: e.target.checked } })
          }
        >
          {OCCASION_TEXT[o]}
        </Checkbox>
      ))}
      <p className="mt-1 text-sm text-muted-foreground">
        Erinnerungen werden erst verschickt, wenn sie eingerichtet sind.
      </p>
      <Feedback error={error} saved={saved} />
    </div>
  );
}

const PRIVACY_SWITCHES: readonly { name: Flag; label: string }[] = [
  { name: "everythingPrivate", label: "Alles privat" },
  { name: "noRecommendations", label: "Keine Empfehlungen" },
  { name: "rarityConsent", label: "Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen" },
];

/** Group "Datenschutz und Empfehlungen": three switches, one line of help and the rest behind "Mehr erfahren". */
export function PrivacyGroup({ saver }: { saver: ProfileSaver }) {
  const { error, saved, change } = useSwitchSave(saver);
  return (
    <div className="flex flex-col gap-1">
      {PRIVACY_SWITCHES.map((s) => (
        <Checkbox
          key={s.name}
          name={s.name}
          checked={saver.saved[s.name]}
          disabled={saver.saving}
          onChange={(e) => void change({ [s.name]: e.target.checked })}
        >
          {s.label}
        </Checkbox>
      ))}
      <MoreHelp
        more={
          <>
            <p>
              „Alles privat“ setzt alle Freigaben aus, ohne sie zu löschen. Ohne Empfehlungen zeigt
              die App keine Ausrüstungsvorschläge.
            </p>
            <p>
              Die Seltenheit in PflanzenDéx zählt nur Konten, die hier zustimmen (Vorgabe: aus); es
              fließt nur eine Zahl pro Art ein, nie wer eine Art besitzt.
            </p>
          </>
        }
      >
        Du entscheidest, was geteilt und empfohlen wird.
      </MoreHelp>
      <Feedback error={error} saved={saved} />
    </div>
  );
}

const t = texts(table);

const CHOICES: readonly { value: KeyboardShortcutMode; label: string }[] = [
  { value: "plain", label: t("shortcuts.plain") },
  { value: "modifier", label: t("shortcuts.modifier") },
  { value: "disabled", label: t("shortcuts.off") },
];

/**
 * Group "Tastenkürzel" (US-QS-11): one choice of three. Einzeltasten (the starting value), Alt and Umschalt with the key,
 * or none. The choice saves at once and takes effect at once; the help says what each one does and that all of it is
 * also reachable with buttons.
 */
export function ShortcutsGroup({ saver }: { saver: ProfileSaver }) {
  const shortcuts = useShortcuts();
  const { error, saved, change } = useSwitchSave(saver, (p) =>
    shortcuts.setMode(p.keyboardShortcuts),
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-semibold">{t("shortcuts.label")}</p>
      <SegmentedControl
        label={t("shortcuts.label")}
        options={CHOICES}
        value={saver.saved.keyboardShortcuts}
        onChange={(mode) => {
          if (mode !== saver.saved.keyboardShortcuts) void change({ keyboardShortcuts: mode });
        }}
      />
      <p className="m-0 text-sm text-muted-foreground">{t("shortcuts.help")}</p>
      <Feedback error={error} saved={saved} />
    </div>
  );
}
