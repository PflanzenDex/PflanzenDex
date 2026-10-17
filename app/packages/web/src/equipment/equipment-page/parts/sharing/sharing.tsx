import { useState } from "react";
import { SHARE_NOTE_LIMITS } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import type { EquipmentRow } from "../../../equipment-api";

export interface SharingActions {
  busy: boolean;
  /** The note of each shared piece of equipment by id; equipment not in the map is private (P-05). */
  shared: ReadonlyMap<string, string | null>;
  onShare: (item: EquipmentRow, share: "private" | "friends", note: string | null) => void;
}

/**
 * Sharing a piece of equipment with friends (US-EQU-12): private by default. Friends see only type, name, model, the
 * light level of a lamp's zone and the note, never price, place of purchase, serial number, location or purchase date.
 * Sharing never recommends anything to a friend (FR-EQU-07).
 */
export function Sharing(props: { item: EquipmentRow; actions: SharingActions }) {
  const { item, actions } = props;
  const isShared = actions.shared.has(item.id);
  const saved = actions.shared.get(item.id) ?? "";
  const [share, setShare] = useState<"private" | "friends">(isShared ? "friends" : "private");
  const [note, setNote] = useState(saved);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    actions.onShare(item, share, share === "friends" ? note.trim() || null : null);
  };
  return (
    <FormRoot
      onSubmit={submit}
      aria-label={`Freigabe für ${item.name}`}
      className="mt-2 flex flex-col gap-2 text-sm"
    >
      <label className="flex min-w-0 flex-col gap-1">
        Freigabe für Freunde
        <Select value={share} onChange={(e) => setShare(e.target.value as "private" | "friends")}>
          <option value="private">Privat</option>
          <option value="friends">Für Freunde sichtbar</option>
        </Select>
      </label>
      {share === "friends" ? (
        <label className="flex min-w-0 flex-col gap-1">
          Erfahrung für Freunde (optional)
          <Input
            value={note}
            maxLength={SHARE_NOTE_LIMITS.max}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      ) : null}
      <p className="m-0 text-xs text-muted-foreground">
        Freunde sehen nur Art, Name, Modell, Lichtstufe und deine Erfahrung, nie Preis, Kaufort,
        Seriennummer, Standort oder Kaufdatum. Zurückziehen wirkt beim nächsten Abruf; was schon
        angezeigt wurde, lässt sich nicht zurückholen.
      </p>
      <Button type="submit" size="touch" variant="secondary" disabled={actions.busy}>
        Freigabe speichern
      </Button>
    </FormRoot>
  );
}
