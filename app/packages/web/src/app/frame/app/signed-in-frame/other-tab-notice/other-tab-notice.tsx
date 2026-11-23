import { useEffect, useState } from "react";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { tabRefusal } from "@/shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./other-tab-notice.de.json";

const t = texts(table);

/** The key prefix of the sign-in storage: a storage event of another key is none of this notice's business. */
const USER_KEY_PREFIX = "oidc.user:";

/** The code of a write refused because another tab signed in as another account (US-QS-07). */
const OTHER_TAB = "access.account_in_other_tab";

/**
 * Says that another tab signed in as another account (US-QS-07, P-10): the writes of this tab are refused, so the keeper
 * reloads the page. It asks the check of a write on the storage event of the sign-in and on focus, the backstop for a
 * missed event. The code is its own chunk (DS-08): the signed-in frame mounts it once and it draws nothing while the
 * account is the tab's own.
 */
export function OtherTabNotice({
  reload = () => window.location.reload(),
}: {
  reload?: () => void;
}) {
  const [sentence, setSentence] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const check = () =>
      void tabRefusal().then((refused) => {
        if (live) setSentence(refused?.code === OTHER_TAB ? refused.text : undefined);
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
  }, []);
  if (sentence === undefined) return null;
  return (
    <Banner variant="warning" action={{ label: t("reload"), onClick: reload }}>
      {sentence}
    </Banner>
  );
}
