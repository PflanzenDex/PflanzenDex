import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { type Control, type Path } from "react-hook-form";
import { FormBar } from "@/shared/ui/form-bar";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { deviceTimeZone, type ApiError } from "../../../../shared/data";
import type { AccountProfile } from "../../../api/account-api";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { useServerRefusal } from "@/shared/ui/form.server-refusal";
import { toProfile, toProfileFields, type ProfileFields as Fields } from "../../../schemas";
import { fixText, groupSchema } from "./group-rules";
import { BufferField, NameFields, ThresholdsField } from "../../../settings-fields/settings-fields";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./form-groups.de.json";
import type { ProfileSaver } from "../profile-saver";

const t = texts(table);

type Key = "displayName" | "timeZone" | "replenishBuffer" | "positionThresholds";

const UNCHANGED = "Keine Änderung: Die Werte sind schon gesichert.";
const INVALID = "Prüfe die markierten Felder.";

/** The form fields a key stands for: the four threshold fields of "positionThresholds" (US-LIC-03). */
function fieldPathsOf(key: Key): Path<Fields>[] {
  return key === "positionThresholds"
    ? [0, 1, 2, 3].map((i) => `positionThresholds.${i}` as const)
    : [key];
}

/** Whether the group's fields of `next` show what is stored already, compared as the form shows them. */
function sameAsSaved(next: AccountProfile, keys: readonly Key[], saved: AccountProfile): boolean {
  const shown = toProfileFields(next, null);
  const stored = toProfileFields(saved, null);
  return keys.every((k) => JSON.stringify(shown[k]) === JSON.stringify(stored[k]));
}

/**
 * The form of one group and its save: the group's fields go onto the stored profile; a refusal marks them (P-10). The
 * result of a save is said by the announcer and shows nowhere else: the saved value is the result (SG-FEED-01, SG-FEED-05).
 * While the group is `inactive` (it saves, or it has nothing to save) a submit sends nothing and says nothing. The
 * button is `aria-disabled`, not `disabled`, so it keeps the focus (PF-045); Enter in a field submits the form too, so
 * the guard sits here and not on the button.
 */
function useGroupForm(
  saver: ProfileSaver,
  keys: readonly Key[],
  saveAlways: boolean,
  fromDevice: boolean,
) {
  const form = useFieldForm<Fields>({
    resolver: zodResolver(groupSchema(saver.saved.displayName)),
    defaultValues: toProfileFields(saver.saved, deviceTimeZone()),
  });
  const announce = useAnnounce();
  const [error, setError] = useState<ApiError | null>(null);
  const fieldsOf = useCallback(
    (e: ApiError) =>
      keys.filter((k) => e.details?.some((d) => d.field === k)).flatMap(fieldPathsOf),
    [keys],
  );
  const { alertText, alertRef } = useServerRefusal(error, form.setError, fieldsOf, fixText);

  // A group that saves on change has nothing to save while its form is clean (the device's zone counts as to be saved).
  const nothingToSave = !saveAlways && !(form.formState.isDirty || fromDevice);
  const inactive = saver.saving || nothingToSave;

  const submit = form.handleSubmit(
    async (values) => {
      const own = Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<Fields>;
      const next = toProfile({ ...toProfileFields(saver.saved, null), ...own }, saver.saved);
      if (saveAlways && sameAsSaved(next, keys, saver.saved)) {
        announce?.announce(UNCHANGED);
        return;
      }
      const r = await saver.save(next);
      if (!r) return;
      setError(r.ok ? null : r.error);
      if (r.ok) {
        announce?.announce(t("saved"));
        form.reset(toProfileFields(r.value, null));
      }
    },
    () => {
      if (saveAlways) announce?.announce(INVALID);
    },
  );
  const send = (event: FormEvent<HTMLFormElement>) => {
    if (inactive) return;
    return submit(event);
  };
  return { form, alertText, alertRef, send, inactive };
}

/**
 * One group of the settings with its own "Sichern" (US-QS-17): the form holds the whole profile, but only the
 * fields of the group are taken over, onto the stored profile (the API saves the profile as a whole). A refusal that
 * names one of the group's fields marks it; any other refusal is an alert (P-10); the input stays. The button is
 * `aria-disabled` while the group is inactive, never `disabled`, so the focus stays on it (US-QS-32, PF-045).
 */
function GroupForm(props: {
  label: string;
  keys: readonly Key[];
  saver: ProfileSaver;
  fromDevice?: boolean;
  /** "Sichern" stays enabled; an unchanged save is announced and sends nothing (US-LIC-03, #1022). */
  saveAlways?: boolean;
  children: (control: Control<Fields>) => ReactNode;
}) {
  const { saver, keys } = props;
  const formId = useId();
  const fromDevice = props.fromDevice === true;
  const saveAlways = props.saveAlways === true;
  const { form, alertText, alertRef, send, inactive } = useGroupForm(
    saver,
    keys,
    saveAlways,
    fromDevice,
  );
  // Typed input that is not saved asks before the layer of the group closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);

  return (
    <Form {...form}>
      <FormRoot
        id={formId}
        aria-label={props.label}
        onSubmit={send}
        className="flex flex-col gap-4"
      >
        {props.children(form.control)}
        {alertText !== null && (
          <Banner variant="error" tabIndex={-1} ref={alertRef}>
            {alertText}
          </Banner>
        )}
        {/* "Abbrechen" and "Sichern" stand after the last field, in the bar of a phone sheet, never in a sticky footer (US-QS-32, SG-SHEET-04). */}
        <FormBar formId={formId} inactive={inactive} needsNetwork>
          {saver.saving ? "Sichert …" : "Sichern"}
        </FormBar>
      </FormRoot>
    </Form>
  );
}

const PROFILE_KEYS: readonly Key[] = ["displayName", "timeZone"];
const WISHLIST_KEYS: readonly Key[] = ["replenishBuffer"];
const LIGHT_KEYS: readonly Key[] = ["positionThresholds"];

/** Group "Profil": display name and time zone (US-ACC-02); the zone is prefilled from the device until chosen. */
export function ProfileGroup({ saver }: { saver: ProfileSaver }) {
  const fromDevice = saver.saved.timeZone === null;
  return (
    <GroupForm label="Profil" keys={PROFILE_KEYS} saver={saver} fromDevice={fromDevice}>
      {(control) => <NameFields control={control} fromDevice={fromDevice} />}
    </GroupForm>
  );
}

/** Group "Wunschliste": the buffer of the wishlist warning (US-WUN-02). */
export function WishlistGroup({ saver }: { saver: ProfileSaver }) {
  return (
    <GroupForm label="Wunschliste" keys={WISHLIST_KEYS} saver={saver}>
      {(control) => <BufferField control={control} />}
    </GroupForm>
  );
}

/** Group "Licht": the thresholds of the position recommendation (US-LIC-03). */
export function LightGroup({ saver }: { saver: ProfileSaver }) {
  return (
    <GroupForm label="Licht" keys={LIGHT_KEYS} saver={saver} saveAlways>
      {(control) => <ThresholdsField control={control} />}
    </GroupForm>
  );
}
