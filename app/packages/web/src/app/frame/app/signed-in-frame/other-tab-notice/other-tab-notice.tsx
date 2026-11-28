import { useEffect, useState } from "react";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { tabRefusal, useQueryClient, type QueryClient } from "@/shared/data";
import { clearPhotoCache } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./other-tab-notice.de.json";

const t = texts(table);

/** The key prefix of the sign-in storage: a storage event of another key is none of this notice's business. */
const USER_KEY_PREFIX = "oidc.user:";

/** The code of a write refused because another tab signed in as another account (US-QS-07). */
const OTHER_TAB = "access.account_in_other_tab";

/** Drops what this tab loaded and cached, so no copy of another account's data stays in memory (US-QS-07, P-04, P-05). */
function dropCaches(client: QueryClient): void {
  client.clear();
  clearPhotoCache();
}

/**
 * Says that another tab signed in as another account (US-QS-07, P-10): the writes of this tab are refused, so the keeper
 * reloads the page. It asks the check of a write on the storage event of the sign-in and on focus, the backstop for a
 * missed event. While the check refuses (any code: another account, or none), the tab's query cache and photo cache are
 * emptied, and again when the check passes anew (the account is the tab's own again): nothing loaded under the other
 * account is shown to the original one (P-04, P-05). The code is its own chunk (DS-08): the signed-in frame mounts it once
 * and it draws nothing while the account is the tab's own.
 */
export function OtherTabNotice({
  reload = () => window.location.reload(),
}: {
  reload?: () => void;
}) {
  const client = useQueryClient();
  const [sentence, setSentence] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let wasRefused = false;
    const check = () =>
      void tabRefusal().then((refused) => {
        if (!live) return;
        setSentence(refused?.code === OTHER_TAB ? refused.text : undefined);
        if (refused || wasRefused) dropCaches(client);
        wasRefused = refused !== undefined;
      });
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(USER_KEY_PREFIX)) check();
    };
    check();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [client]);
  if (sentence === undefined) return null;
  return (
    <Banner variant="warning" action={{ label: t("reload"), onClick: reload }}>
      {sentence}
    </Banner>
  );
}
