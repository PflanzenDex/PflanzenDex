import { useState } from "react";
import type { KeyboardShortcutMode, MotionSetting } from "@pflanzendex/core";
import { Checkbox } from "@/shared/ui/checkbox";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { MoreHelp } from "@/shared/ui/more-help";
import { ChoiceRow, type Choice } from "./choice-row/choice-row";
import { texts } from "@/shared/lib/text-rules/texts";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import { applyMotion } from "@/shared/platform/device/motion/motion-setting";
import table from "./switch-groups.de.json";
import { useFeature, type ApiError } from "../../../../shared/data";
import type { AccountProfile } from "../../../api/account-api";
import { refusalText } from "@/shared/lib/error-text";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { OCCASION_TEXT, visibleOccasions } from "../../../settings-fields/settings-fields";
import type { ProfileSaver } from "../profile-saver";

const t = texts(table);

type Flag = "everythingPrivate" | "noRecommendations" | "rarityConsent";

/**
 * A switch saves at once (US-QS-17): the whole stored profile with this one change goes out. The switch itself is the
 * result (SG-FEED-01): a refused save leaves it where it was and says why by the error code's text (P-10); a saved one
 * is said to screen readers by the announcer, with no box in the page (SG-FEED-04, US-QS-32). While a save runs the
 * switches are `aria-disabled`, not `disabled`: a focused control that becomes disabled loses the focus, and the second
 * Space of the keeper would do nothing (US-QS-32, issue 2317). A press meanwhile sends nothing (the saver answers `null`
 * while busy) and React restores the stored state of the box.
 */
function useSwitchSave(saver: ProfileSaver, onSaved?: (profile: AccountProfile) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const announce = useAnnounce();
  const change = async (patch: Partial<AccountProfile>) => {
    const r = await saver.save({ ...saver.saved, ...patch });
    if (!r) return;
    setError(r.ok ? null : r.error);
    if (r.ok) {
      announce?.announce(t("saved"));
      onSaved?.(r.value);
    }
  };
  return { error, change };
}

function Feedback(props: { error: ApiError | null }) {
  if (props.error) return <Banner variant="error">{refusalText(props.error)}</Banner>;
  return null;
}

/** Group "Benachrichtigungen": a switch per occasion (US-ACC-02). */
export function NotificationsGroup({ saver }: { saver: ProfileSaver }) {
  const social = useFeature("social");
  const { error, change } = useSwitchSave(saver);
  return (
    <div className="flex flex-col gap-1">
      <NetworkSlot>
        {visibleOccasions(social).map((o) => (
          <Checkbox
            key={o}
            name={`notifications.${o}`}
            checked={saver.saved.notifications[o]}
            aria-disabled={saver.saving || undefined}
            needsNetwork
            onChange={(e) =>
              void change({
                notifications: { ...saver.saved.notifications, [o]: e.target.checked },
              })
            }
          >
            {OCCASION_TEXT[o]}
          </Checkbox>
        ))}
      </NetworkSlot>
      <p className="mt-1 text-sm text-muted-foreground">Erinnerungen nur, wenn eingerichtet.</p>
      <Feedback error={error} />
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
  const { error, change } = useSwitchSave(saver);
  return (
    <div className="flex flex-col gap-1">
      <NetworkSlot>
        {PRIVACY_SWITCHES.map((s) => (
          <Checkbox
            key={s.name}
            name={s.name}
            checked={saver.saved[s.name]}
            aria-disabled={saver.saving || undefined}
            needsNetwork
            onChange={(e) => void change({ [s.name]: e.target.checked })}
          >
            {s.label}
          </Checkbox>
        ))}
      </NetworkSlot>
      <MoreHelp
        more={
          <>
            <p>
              „Alles privat“ setzt alle Freigaben aus, ohne sie zu löschen. Ohne Empfehlungen zeigt
              die App keine Gerätevorschläge.
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
      <Feedback error={error} />
    </div>
  );
}

const CHOICES: readonly Choice<KeyboardShortcutMode>[] = [
  { value: "plain", label: t("shortcuts.plain") },
  { value: "modifier", label: t("shortcuts.modifier") },
  { value: "disabled", label: t("shortcuts.off") },
];

/**
 * Group "Tastenkürzel" (US-QS-11): one choice of three. Einzeltasten (the starting value), Alt and Umschalt with the key,
 * or none. The choice saves at once and takes effect at once; the help says that all of it is also reachable with
 * buttons.
 */
export function ShortcutsGroup({ saver }: { saver: ProfileSaver }) {
  const shortcuts = useShortcuts();
  const { error, change } = useSwitchSave(saver, (p) => shortcuts.setMode(p.keyboardShortcuts));
  return (
    <div className="flex flex-col gap-1">
      <ChoiceRow
        name="keyboardShortcuts"
        label={t("shortcuts.label")}
        help={t("shortcuts.help")}
        options={CHOICES}
        needsNetwork
        value={saver.saved.keyboardShortcuts}
        onPick={(keyboardShortcuts) => void change({ keyboardShortcuts })}
      />
      <Feedback error={error} />
    </div>
  );
}

const MOTION_CHOICES: readonly Choice<MotionSetting>[] = [
  { value: "system", label: t("motion.system") },
  { value: "reduced", label: t("motion.reduced") },
];

/**
 * Choice "Bewegung" (US-QS-33): "Wie auf dem Gerät" (the starting value) or "Bewegung aus". It saves at once with the
 * profile and applies at once on the open screen; a refused save keeps the old value and says why (P-10).
 */
export function MotionGroup({ saver }: { saver: ProfileSaver }) {
  const { error, change } = useSwitchSave(saver, (p) => applyMotion(p.motion));
  return (
    <div className="flex flex-col gap-1">
      <ChoiceRow
        name="motion"
        label={t("motion.label")}
        help={t("motion.help")}
        options={MOTION_CHOICES}
        needsNetwork
        value={saver.saved.motion}
        onPick={(motion) => void change({ motion })}
      />
      <Feedback error={error} />
    </div>
  );
}
