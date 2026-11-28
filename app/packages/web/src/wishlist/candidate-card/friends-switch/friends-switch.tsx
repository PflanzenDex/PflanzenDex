import { useCallback, useEffect, useState } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import {
  entityKey,
  useReload,
  useRequest,
  useWriteAction,
  type ApiError,
} from "../../../shared/data";
import { SwitchRow } from "@/shared/lists/switch-row/switch-row";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { loadVisibleToFriends, setWishVisibleToFriends } from "../../wishlist-api";
import table from "./friends-switch.de.json";

const t = texts(table);
const KEY = ["wishlist", "visible-to-friends"] as const;

/** The refusal at the row: the German text of its code, and the control that frees a held key (US-QS-03, P-10). */
function RefusalLine({ error }: { error: ApiError }) {
  return (
    <>
      {errorText(error.code)}
      <RefusalClose error={error} />
    </>
  );
}

/**
 * The switch row "Für Freunde sichtbar" of one open wish (DM-TAU-02, US-TAU-05, US-QS-32). Off by default (P-05): only a
 * deliberate tap turns it on, and a tap takes it back at any time. The one line says what friends see and that the list stays
 * private; it does not change with the state. The switch is optimistic: it moves at the tap and stays while the write runs, a
 * refusal rolls it back and says why at the row (P-10), and a result is said once to assistive technology and shows in no
 * second place (SG-FEED-02, SG-FEED-04). One shared request tells all cards which wishes are marked.
 */
export default function FriendsSwitch(props: {
  api: string;
  token: () => Promise<string | undefined>;
  wishId: string;
  title: string;
}) {
  const { api, token, wishId, title } = props;
  const load = useCallback((tok: string) => loadVisibleToFriends(api, tok), [api]);
  const marked = useRequest({ queryKey: KEY, token, load });
  const reload = useReload(KEY);
  // The state the keeper asked for, until the reload shows the stored one (the tap, then the answer, then the reload).
  const [wanted, setWanted] = useState<boolean | null>(null);
  const settle = useCallback(() => void reload().finally(() => setWanted(null)), [reload]);
  const write = useWriteAction(token, settle);
  const announce = useAnnounce();
  // A refusal puts the switch back at once; the reload that follows confirms the stored state.
  useEffect(() => {
    if (write.failures > 0) setWanted(null);
  }, [write.failures]);
  useEffect(() => {
    if (write.message) announce?.announce(write.message);
  }, [write.message, announce]);

  if (marked.status === "error")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("notLoaded")}
      </p>
    );
  const ids = marked.value?.wishIds;
  if (!Array.isArray(ids)) return null;
  const shown = wanted ?? ids.includes(wishId);
  return (
    <SwitchRow
      bare
      className="mt-1"
      label={
        <>
          {t("label")}
          <span className="sr-only">: {title}</span>
        </>
      }
      help={t("help")}
      checked={shown}
      busy={write.running}
      error={write.error ? <RefusalLine error={write.error} /> : undefined}
      onCheckedChange={(visible) => {
        setWanted(visible);
        void write.run(
          (tok, opts) => setWishVisibleToFriends(api, tok, { wishId, visible }, opts),
          t(visible ? "visible" : "private", { title }),
          entityKey("wish", wishId, `visible:${visible}`),
        );
      }}
    />
  );
}
