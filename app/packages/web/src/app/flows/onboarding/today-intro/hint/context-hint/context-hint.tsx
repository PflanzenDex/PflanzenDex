import { useEffect, useState } from "react";
import { loadHints } from "../hint-api";
import { HintNote } from "../hint-note/hint-note";
import { HINT_TEXTS } from "../hint-texts";

type Token = () => Promise<string | undefined>;

/**
 * The calm hint of one view other than the start page (US-ONB-07): the view says which occasions apply, the server
 * decides which single one is due (fixed order, once, 7 days, none in calm mode or style `many`). It sits at the place
 * where it helps, blocks nothing and fails open: when the request fails, no hint shows (P-10 is kept by the page).
 */
export function ContextHint(props: { api: string; token: Token; applicable: readonly string[] }) {
  const { api, token } = props;
  const key = props.applicable.join(",");
  const [due, setDue] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t ? await loadHints(api, t, key.split(",")) : null;
      if (current) setDue(r?.ok ? r.value.hint : null);
    })();
    return () => {
      current = false;
    };
  }, [api, token, key]);
  if (!due || !(due in HINT_TEXTS)) return null;
  return (
    <HintNote
      occasion={due as keyof typeof HINT_TEXTS}
      api={api}
      token={token}
      onGone={() => setDue(null)}
    />
  );
}
