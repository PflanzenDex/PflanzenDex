import { useEffect, useRef } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { useNavigate } from "react-router";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Menu } from "@/shared/patterns/display/panels/menu/menu";
import { Button } from "@/shared/ui/button";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { isOnline } from "@/shared/platform/browser/network";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import {
  entityKey,
  useInvalidate,
  useQueryClient,
  useWriteAction,
  type ApiError,
} from "../../../../../shared/data";
import { endFriendship } from "../../../../api/friends-api";
import { FRIENDS_KEY } from "../../../friends-page/friends-page";
import table from "../../../../social.de.json";

const tx = texts(table);

/** The layer with the question that ends a friendship (US-SOZ-03); the friend's collection page opens it from its menu. */
const END_LAYER = "end-friendship";

/**
 * "Mehr" in the top bar of a friend's collection (US-QS-32): the rarer actions of a friend, here the end of the friendship
 * as a red action. Choosing it opens the question, which asks first (P-10); the menu itself ends nothing.
 */
export function FriendEndMenu(props: { disabled: boolean }) {
  const layer = useLayer(END_LAYER);
  // The menu item unmounts when the menu closes, so the question opens from the "Mehr" trigger: Abbrechen returns the focus
  // to it (WCAG 2.4.3). The wrapper adds no box of its own.
  const wrap = useRef<HTMLSpanElement>(null);
  return (
    <span ref={wrap} className="contents">
      <Menu
        label={tx("friendPage.more")}
        items={[
          {
            label: tx("friendEnd.title"),
            destructive: true,
            disabled: props.disabled,
            onSelect: () =>
              layer.openLayer(
                wrap.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]'),
              ),
          },
        ]}
      />
    </span>
  );
}

/**
 * The question before a friendship ends (US-SOZ-03): what it does and what stays, then "Beenden" or "Abbrechen". A
 * refusal stays on screen beside the question (P-10).
 */
function EndConfirm(props: {
  name: string;
  busy: boolean;
  error: ApiError | null;
  onYes: () => void;
}) {
  const { closeLayer } = useLayer(END_LAYER);
  return (
    <div
      role="group"
      aria-label={tx("friendEnd.group", { name: props.name })}
      className="flex flex-col gap-3"
    >
      <p>{tx("friendEnd.question", { name: props.name })}</p>
      <span className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          variant="destructive"
          disabled={props.busy}
          onClick={props.onYes}
        >
          {tx("friendEnd.yes")}
        </Button>
        <Button type="button" size="touch" variant="plain" onClick={() => closeLayer()}>
          {tx("friendEnd.no")}
        </Button>
      </span>
      {props.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(props.error.code)}
          <RefusalClose error={props.error} />
        </p>
      )}
    </div>
  );
}

/** The layer of the question, mounted with the friend's data (its name is in the question). */
export function FriendEndLayer(props: {
  name: string;
  busy: boolean;
  error: ApiError | null;
  onYes: () => void;
}) {
  return (
    <LayerSheet id={END_LAYER} title={tx("friendEnd.title")}>
      <EndConfirm {...props} />
    </LayerSheet>
  );
}

/**
 * The end of a friendship from the friend's page (US-SOZ-03, US-QS-32): the write, what the ended friend leaves in the
 * cache (P-05), and the way to the friends page, which replaces this page in the history so Back never returns here (P-10).
 */
export function useEndFriendship(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friendId: string;
  name: string;
}) {
  const { api, friendId, name } = props;
  const navigate = useNavigate();
  const client = useQueryClient();
  const ending = useWriteAction(props.token, useInvalidate(FRIENDS_KEY));
  useEffect(() => {
    if (ending.message === null) return;
    client.removeQueries({ queryKey: ["social", "friend-collection", friendId] });
    client.removeQueries({ queryKey: ["social", "friend-equipment", friendId] });
    navigate(PATHS.friends, { replace: true, state: { hint: ending.message } });
  }, [client, ending.message, friendId, navigate]);
  const onYes = () => {
    // Offline the write waits in the buffer and says so there (US-QS-10): the question closes at once, and nothing is removed
    // before the friendship has ended.
    const offline = !isOnline();
    void ending.run(
      (t, opts) => endFriendship(api, t, friendId, opts),
      tx("friends.ended", { name }),
      entityKey("friend", friendId, "end"),
    );
    if (offline) navigate(PATHS.friends, { replace: true });
  };
  return { ending, onYes };
}
