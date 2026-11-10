// US-QS-29 · The app icon shows the due total of "Heute". Mounted once in the signed-in shell; it draws nothing. The counts
// are the requests of "Heute" (same keys), so every write that refreshes "Heute" refreshes the icon too.
import { useCallback, useEffect } from "react";
import { loadProfile } from "@/account";
import { useCalmMode } from "@/achievements";
import { useOpenCount } from "@/care";
import { useHintCount } from "@/collection";
import { useRequest } from "@/shared/data";
import { useDueCount } from "@/monitoring";
import { applyBadge } from "./badge-api";
import { badgeTarget, badgeTotal } from "./badge-target";

type Token = () => Promise<string | undefined>;

/** The app icon of the signed-in account: the number follows the rule of `badge-target.ts`, the browser calls are in `badge-api.ts`. */
export function AppBadge({ api, token }: { api: string; token: Token }) {
  const calm = useCalmMode(api, token);
  const load = useCallback((t: string) => loadProfile(api, t), [api]);
  const profile = useRequest({ queryKey: ["account", "profile"], token, load });
  const open = useOpenCount(api, token);
  const due = useDueCount(api, token);
  const hints = useHintCount(api, token);
  // The reminder switches read as the Konto index reads them: on while any occasion is on (US-QS-17).
  const remindersOn =
    profile.value === undefined
      ? undefined
      : Object.values(profile.value.notifications).some(Boolean);
  const total = badgeTotal({
    watering: due.count,
    treatments: open.count,
    hints: hints.count,
  });
  const target = badgeTarget({ calmMode: calm, remindersOn, total });
  useEffect(() => {
    if (target !== "wait") applyBadge(target);
  }, [target]);
  // Leaving the signed-in shell (a sign-out) clears the number, so the count of one account never stays on the icon (P-04).
  useEffect(() => () => applyBadge("clear"), []);
  return null;
}
