import { useCallback, useRef, useState } from "react";
import { SIGN_IN, setProfileTimeZone, type ApiError, useRepeatKey } from "../../../shared/data";
import { saveProfile, type AccountProfile } from "../../api/account-api";

type Token = () => Promise<string | undefined>;

export type SaveResult = { ok: true; value: AccountProfile } | { ok: false; error: ApiError };

/** The profile as stored and the one validating write that changes it, shared by all groups of the settings. */
export type ProfileSaver = {
  saved: AccountProfile;
  saving: boolean;
  /** Sends the whole profile (the API saves it as a whole); `null` while another save runs (a double tap sends one). */
  save: (next: AccountProfile) => Promise<SaveResult | null>;
};

export function useProfileSaver(api: string, token: Token, initial: AccountProfile): ProfileSaver {
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const keys = useRepeatKey();
  const save = useCallback(
    async (next: AccountProfile): Promise<SaveResult | null> => {
      if (busy.current) return null;
      busy.current = true;
      setSaving(true);
      const t = await token();
      const key = keys.take();
      const r = t
        ? await saveProfile(api, t, next, { key })
        : { ok: false as const, error: SIGN_IN };
      keys.settle(key, r);
      busy.current = false;
      setSaving(false);
      if (r.ok) {
        setSaved(r.value);
        setProfileTimeZone(r.value.timeZone);
      }
      return r;
    },
    [api, token, keys],
  );
  return { saved, saving, save };
}
