import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { forgetRepeatKeys } from "../write-action/repeat-key";

/** Drops every cached copy while nobody is signed in, so the next account never sees data of the last one (P-04). */
export function useClearOnSignOut(signedIn: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    // The held repeat-guard keys go with the account: a key of another account is never repeated (US-QS-03).
    if (!signedIn) {
      client.clear();
      forgetRepeatKeys();
    }
  }, [client, signedIn]);
}
