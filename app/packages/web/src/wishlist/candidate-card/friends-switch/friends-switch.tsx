import { useCallback } from "react";
import { useRequest, useInvalidate, useWriteAction } from "../../../kernel";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { errorText } from "@/lib/error-text";
import { loadVisibleToFriends, setWishVisibleToFriends } from "../../wishlist-api";

const KEY = ["wishlist", "visible-to-friends"] as const;

/**
 * The switch "Für Freunde als gesucht zeigen" of one open wish (DM-TAU-02, US-TAU-05). Off by default (P-05): only a
 * deliberate tap turns it on, and a tap takes it back at any time. The text says what it does and what stays private;
 * the answer of the server and every refusal stay visible (P-09, P-10). One shared request tells all cards which wishes
 * are marked.
 */
export default function FriendsSwitch(props: {
  api: string;
  token: () => Promise<string | undefined>;
  wishId: string;
  title: string;
}) {
  const { api, token, wishId, title } = props;
  const load = useCallback((t: string) => loadVisibleToFriends(api, t), [api]);
  const marked = useRequest({ queryKey: KEY, token, load });
  const reload = useInvalidate(KEY);
  const write = useWriteAction(token, reload);
  if (marked.status === "error")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Ob dieser Wunsch für Freunde sichtbar ist, konnte nicht geladen werden. Lade die Seite neu.
      </p>
    );
  const ids = marked.value?.wishIds;
  if (!Array.isArray(ids)) return null;
  const on = ids.includes(wishId);
  return (
    <div className="mt-2 grid gap-1 rounded-lg border border-border p-2">
      <Checkbox
        checked={on}
        disabled={write.running}
        aria-label={`Für Freunde als gesucht zeigen: ${title}`}
        onChange={(e) => {
          // Read now: a controlled box is reset to its old value before the write has started.
          const visible = e.target.checked;
          void write.run(
            (t) => setWishVisibleToFriends(api, t, { wishId, visible }),
            visible
              ? `„${title}“ ist jetzt für bestätigte Freunde als gesucht sichtbar.`
              : `„${title}“ ist wieder privat.`,
          );
        }}
      >
        Für Freunde als gesucht zeigen
      </Checkbox>
      <p className="text-sm text-muted-foreground">
        {on
          ? "Bestätigte Freunde sehen bei ihrem Angebot dieser Art „Passt in beide Richtungen“. Ihre Liste sehen sie nie. Haken entfernen macht den Wunsch wieder privat."
          : "Standardmäßig ist jeder Wunsch privat. Mit Haken sehen bestätigte Freunde bei ihrem Angebot dieser Art „Passt in beide Richtungen“, nie deine Liste."}
      </p>
      {write.error && (
        <p role="alert" className="text-sm text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
      {write.message && !write.error && (
        <p role="status" className="text-sm">
          {write.message}
        </p>
      )}
    </div>
  );
}
