import { useState } from "react";
import type { CreatedFriendCode } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { useSay, useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import {
  createKey,
  useWriteAction,
  type ApiError,
  type WriteOptions,
} from "../../../../../shared/data";
import { createFriendCode, sendFriendRequest } from "../../../../api/friends-api";
import { CodeForm } from "../../../../parts/code-form/code-form";
import { InviteCard } from "../../../../parts/invite-card/invite-card";
import { Layer } from "../layer/layer";

type Token = () => Promise<string | undefined>;

/**
 * Sends the code form's request and hands a refusal back to the field; one request at a time (a double tap sends one).
 * The confirmation goes to `shown`: the request is not on this layer, so it stays a toast until the in-place row of FX-09
 * (SG-FEED-03, US-QS-32). A refused code is not a toast, it stays at its field (P-10).
 */
function useSendRequest(
  api: string,
  token: Token,
  reload: () => void,
  shown: (message: string) => void,
) {
  const write = useWriteAction(token, reload, (message, kind) => {
    if (kind !== "error") shown(message);
  });
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const send = async (code: string): Promise<boolean> => {
    let ok = false;
    // A create (a request is sent): the operation only, the code is the body (US-QS-03).
    const key = createKey("friend", "request");
    await write.run(
      async (t, opts) => {
        const r = await sendFriendRequest(api, t, code, opts);
        ok = r.ok;
        setRefusal(r.ok ? null : r.error);
        return r;
      },
      "Anfrage gesendet. Sobald die Person sie annimmt, seid ihr befreundet.",
      key,
    );
    return ok;
  };
  return { send, refusal, write };
}

type Tab = "invite" | "code";

/** The invitation code: the write of one code, keyed to the action of creating one (US-QS-03). */
const CODE_KEY = createKey("invite", "friend-code");
const createCode =
  (api: string, onCreated: (code: CreatedFriendCode) => void) =>
  async (t: string, opts: WriteOptions) => {
    const r = await createFriendCode(api, t, opts);
    if (r.ok) onCreated(r.value);
    return r;
  };

/**
 * The layer "Freund hinzufügen" (`?sheet=add`, US-QS-20): "Einladen" creates and shows the code (US-SOZ-01), "Code eingeben"
 * sends the request with a code from someone else. Two tabs, each with its one filled action; a refused code stays at the
 * field with its German text by code (FR-QG-11, P-10).
 */
export function AddFriendLayer(props: { api: string; token: Token; onWritten: () => void }) {
  const { api, token } = props;
  const [tab, setTab] = useState<Tab>("invite");
  const [created, setCreated] = useState<CreatedFriendCode | null>(null);
  // The code of an invitation shows in place (the card), so its result is said; a sent request is not on this layer.
  const say = useSay();
  const toast = useToast();
  const invite = useWriteAction(token, props.onWritten, say);
  const request = useSendRequest(api, token, props.onWritten, (message) => toast.show({ message }));
  const tabs: { id: Tab; label: string }[] = [
    { id: "invite", label: "Einladen" },
    { id: "code", label: "Code eingeben" },
  ];
  return (
    <Layer id="add" title="Freund hinzufügen">
      <div className="flex min-w-0 flex-col gap-4">
        <div role="tablist" aria-label="Freund hinzufügen" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              type="button"
              role="tab"
              id={`add-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`add-panel-${t.id}`}
              variant={tab === t.id ? "secondary" : "ghost"}
              className="max-w-full flex-1"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div role="tabpanel" id={`add-panel-${tab}`} aria-labelledby={`add-tab-${tab}`}>
          {tab === "invite" ? (
            <InviteCard
              created={created}
              running={invite.running}
              onCreate={() =>
                void invite.run(createCode(api, setCreated), "Code erzeugt.", CODE_KEY)
              }
            />
          ) : (
            <CodeForm
              running={request.write.running}
              refusal={request.refusal}
              onSend={request.send}
            />
          )}
        </div>
      </div>
    </Layer>
  );
}
