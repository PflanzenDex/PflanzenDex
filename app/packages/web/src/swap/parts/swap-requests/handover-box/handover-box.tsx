import { useState } from "react";
import type { SwapSide } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { swapTitle } from "../swap-text";

/**
 * The handover of an accepted swap (US-SOZ-11): each side confirms once, it counts only when both did. The recipient may
 * name a marker for the new specimen (only needed when the species is in the collection already, DM-BES-03); a refusal is
 * shown by the parent by its error code and the form stays. After my confirmation the card says who is awaited (P-09).
 */
export function HandoverBox(props: {
  s: SwapSide;
  busy: boolean;
  onConfirm: (marker: string | null) => void;
}) {
  const { s } = props;
  const [marker, setMarker] = useState("");
  if (s.status !== "accepted") return null;
  const recipient = s.role === "recipient";
  const mine = recipient ? s.confirmedRecipient : s.confirmedGiver;
  const title = swapTitle(s);
  if (mine)
    return (
      <p className="text-sm text-muted-foreground">
        Du hast die Übergabe bestätigt. {s.otherName ?? "Der Freund"} muss noch bestätigen.
      </p>
    );
  return (
    <div className="grid gap-2">
      {recipient && (
        <label className="grid gap-1 text-sm font-medium">
          Kennzeichen für dein neues Exemplar (nur nötig, wenn du die Art schon hast)
          <Input value={marker} maxLength={40} onChange={(e) => setMarker(e.target.value)} />
        </label>
      )}
      <div>
        <Button
          type="button"
          size="touch"
          disabled={props.busy}
          aria-label={`${recipient ? "Erhalt" : "Übergabe"} bestätigen: ${title}`}
          onClick={() => props.onConfirm(recipient && marker.trim() ? marker.trim() : null)}
        >
          {recipient ? "Erhalt bestätigen" : "Übergabe bestätigen"}
        </Button>
      </div>
    </div>
  );
}
