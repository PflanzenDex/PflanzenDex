import { useState } from "react";
import type { CreatedFriendCode } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { useWriteAction, type ApiError } from "../../../../../kernel";
import { createFriendCode, sendFriendRequest } from "../../../../api/friends-api";
import { CodeForm } from "../../../../parts/code-form/code-form";
import { InviteCard } from "../../../../parts/invite-card/invite-card";
import { Layer } from "../layer/layer";
import { Outcome } from "../outcome/outcome";

type Token = () => Promise<string | undefined>;

/** Sends the code form's request and hands a refusal back to the field; one request at a time (a double tap sends one). */
function useSendRequest(api: string, token: Token, reload: () => void) {
  const write = useWriteAction(token, reload);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const send = async (code: string): Promise<boolean> => {
    let ok = false;
    await write.run(async (t) => {
      const r = await sendFriendRequest(api, t, code);
      ok = r.ok;
      setRefusal(r.ok ? null : r.error);
      return r;
    }, "Anfrage gesendet. Sobald die Person sie annimmt, seid ihr befreundet.");
    return ok;
  };
  return { send, refusal, write };
}

type Tab = "invite" | "code";

/**
 * The layer "Freund hinzufügen" (`?sheet=add`, US-QS-20): "Einladen" creates and shows the code (US-SOZ-01), "Code eingeben"
 * sends the request with a code from someone else. Two tabs, each with its one filled action; a refused code stays at the
 * field with its German text by code (FR-QG-11, P-10).
 */
export function AddFriendLayer(props: { api: string; token: Token; onWritten: () => void }) {
  const { api, token } = props;
  const [tab, setTab] = useState<Tab>("invite");
  const [created, setCreated] = useState<CreatedFriendCode | null>(null);
  const invite = useWriteAction(token, props.onWritten);
  const request = useSendRequest(api, token, props.onWritten);
  const tabs: { id: Tab; label: string }[] = [
    { id: "invite", label: "Einladen" },
    { id: "code", label: "Code eingeben" },
  ];
  return (
    <Layer id="add" title="Freund hinzufügen">
      <div className="flex min-w-0 flex-col gap-4">
        <div role="tablist" aria-label="Freund hinzufügen" className="flex gap-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              type="button"
              role="tab"
              id={`add-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`add-panel-${t.id}`}
              variant={tab === t.id ? "secondary" : "ghost"}
              className="flex-1"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <Outcome message={request.write.message ?? invite.message} error={invite.error} />
        <div role="tabpanel" id={`add-panel-${tab}`} aria-labelledby={`add-tab-${tab}`}>
          {tab === "invite" ? (
            <InviteCard
              created={created}
              running={invite.running}
              onCreate={() =>
                void invite.run(async (t) => {
                  const r = await createFriendCode(api, t);
                  if (r.ok) setCreated(r.value);
                  return r;
                }, "Code erzeugt.")
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
