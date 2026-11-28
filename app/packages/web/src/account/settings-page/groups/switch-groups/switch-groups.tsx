import { useState } from "react";
import type { KeyboardShortcutMode, MotionSetting } from "@pflanzendex/core";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { SwitchRow } from "@/shared/lists/switch-row/switch-row";
import { ChoiceRow, type Choice } from "./choice-row/choice-row";
import { texts } from "@/shared/lib/text-rules/texts";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import { applyMotion } from "@/shared/platform/device/motion/motion-setting";
import table from "./switch-groups.de.json";
import { useFeature, type ApiError } from "../../../../shared/data";
import type { AccountProfile, Occasion } from "../../../api/account-api";
import { refusalText } from "@/shared/lib/error-text";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { OCCASION_TEXT, visibleOccasions } from "../../../settings-fields/settings-fields";
import type { ProfileSaver } from "../profile-saver";

const t = texts(table);

/**
 * A switch saves at once (US-QS-17): the whole stored profile with this one change goes out. The switch itself is the
 * result (SG-FEED-01): a refused save leaves it where it was and says why at its row by the error code's text (P-10); a
 * saved one is said to screen readers by the announcer, with no box in the page (SG-FEED-04, US-QS-32). While a save runs
 * the switches are `aria-disabled`, not `disabled`: a focused control that becomes disabled loses the focus, and the second
 * Space of the keeper would do nothing (US-QS-32, issue 2317). A press meanwhile sends nothing (the saver answers `null`
 * while busy) and the controlled switch stays on the stored state.
 */
function useSwitchSave(saver: ProfileSaver, onSaved?: (profile: AccountProfile) => void) {
  const [failed, setFailed] = useState<{ row: string; error: ApiError } | null>(null);
  const announce = useAnnounce();
  const change = async (row: string, patch: Partial<AccountProfile>) => {
    const r = await saver.save({ ...saver.saved, ...patch });
    if (!r) return;
    setFailed(r.ok ? null : { row, error: r.error });
    if (r.ok) {
      announce?.announce(t("saved"));
      onSaved?.(r.value);
    }
  };
  const errorOf = (row: string) => (failed?.row === row ? refusalText(failed.error) : undefined);
  return { change, errorOf, error: failed?.error ?? null };
}

function Feedback(props: { error: ApiError | null }) {
  if (props.error) return <Banner variant="error">{refusalText(props.error)}</Banner>;
  return null;
}

const OCCASION_HELP: Record<Occasion, string> = {
  phase: t("notifications.help.phase"),
  treatment: t("notifications.help.treatment"),
  measurement: t("notifications.help.measurement"),
  watering: t("notifications.help.watering"),
  swap: t("notifications.help.swap"),
  friends: t("notifications.help.friends"),
  equipment: t("notifications.help.equipment"),
};

/** Group "Benachrichtigungen": a switch row per occasion (US-ACC-02). The offline reason stands once below the group. */
export function NotificationsGroup({ saver }: { saver: ProfileSaver }) {
  const social = useFeature("social");
  const { change, errorOf } = useSwitchSave(saver);
  return (
    <NetworkSlot>
      <GroupedList footer={t("notifications.footer")}>
        {visibleOccasions(social).map((o) => (
          <SwitchRow
            key={o}
            name={`notifications.${o}`}
            label={OCCASION_TEXT[o]}
            help={OCCASION_HELP[o]}
            checked={saver.saved.notifications[o]}
            busy={saver.saving}
            error={errorOf(o)}
            needsNetwork
            onCheckedChange={(on) =>
              void change(o, { notifications: { ...saver.saved.notifications, [o]: on } })
            }
          />
        ))}
      </GroupedList>
    </NetworkSlot>
  );
}

/**
 * Group "Datenschutz und Empfehlungen": three switch rows, each with one line that says who sees what. Worded so that on
 * means the thing happens (SG-CTRL-05): "Empfehlungen zeigen" is the opposite of the stored `noRecommendations`; "Alles
 * privat" is the one allowed exception.
 */
export function PrivacyGroup({ saver }: { saver: ProfileSaver }) {
  const { change, errorOf } = useSwitchSave(saver);
  const p = saver.saved;
  const rows = [
    {
      row: "everythingPrivate",
      label: t("privacy.everythingPrivate.label"),
      help: t("privacy.everythingPrivate.help"),
      checked: p.everythingPrivate,
      patch: (on: boolean): Partial<AccountProfile> => ({ everythingPrivate: on }),
    },
    {
      row: "noRecommendations",
      label: t("privacy.recommendations.label"),
      help: t("privacy.recommendations.help"),
      checked: !p.noRecommendations,
      patch: (on: boolean): Partial<AccountProfile> => ({ noRecommendations: !on }),
    },
    {
      row: "rarityConsent",
      label: t("privacy.rarity.label"),
      help: t("privacy.rarity.help"),
      checked: p.rarityConsent,
      patch: (on: boolean): Partial<AccountProfile> => ({ rarityConsent: on }),
    },
  ];
  return (
    <NetworkSlot>
      <GroupedList footer={t("privacy.footer")}>
        {rows.map((r) => (
          <SwitchRow
            key={r.row}
            name={r.row}
            label={r.label}
            help={r.help}
            checked={r.checked}
            busy={saver.saving}
            error={errorOf(r.row)}
            needsNetwork
            onCheckedChange={(on) => void change(r.row, r.patch(on))}
          />
        ))}
      </GroupedList>
    </NetworkSlot>
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
        onPick={(keyboardShortcuts) => void change("keyboardShortcuts", { keyboardShortcuts })}
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
        onPick={(motion) => void change("motion", { motion })}
      />
      <Feedback error={error} />
    </div>
  );
}
