import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { ResponsiveModal } from "@/components/shared/responsive/responsive-modal/responsive-modal";

/** The word the keeper types to confirm (US-ACC-04: deleting needs a confirmation). */
export const CONFIRM_WORD = "LÖSCHEN";

/** What goes and what stays, named before the keeper confirms (US-ACC-04). */
export function WhatHappens() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="m-0 font-semibold">Das wird gelöscht:</p>
      <ul className="m-0 list-disc pl-5">
        <li>
          alle deine Exemplare, Messungen, Behandlungen, Wünsche und das Equipment mit allem, was
          dazugehört
        </li>
        <li>alle deine Fotos im Speicher</li>
        <li>dein Profil, deine Einstellungen, Erinnerungen, Freigaben und KI-Verbindungen</li>
        <li>
          deine Freundschaften: Freunde sehen dich und deine Pflanzen danach nicht mehr; laufende
          Tausche werden abgebrochen, mit dem Grund „Konto gelöscht“
        </li>
      </ul>
      <p className="m-0 font-semibold">Das bleibt:</p>
      <ul className="m-0 list-disc pl-5">
        <li>
          abgeschlossene Tausche beim Tauschpartner, mit dem Namen, den er gespeichert hat, aber
          ohne Verbindung zu dir
        </li>
        <li>
          von dir vorgeschlagene Arten, die freigegeben wurden, im gemeinsamen Katalog, ohne deinen
          Namen
        </li>
        <li>
          dein Anmeldekonto (E-Mail und Passwort) beim Anmeldedienst; das entfernt der Betreiber
          danach von Hand
        </li>
      </ul>
      <p className="m-0">
        Nach der Bestätigung passiert 7 Tage lang nichts, du kannst die Löschung zurücknehmen.
        Danach ist sie endgültig. Lade vorher deine Daten herunter, wenn du sie behalten willst.
      </p>
    </div>
  );
}

export function ConfirmModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  running: boolean;
}) {
  const [typed, setTyped] = useState("");
  return (
    <ResponsiveModal
      title="Konto löschen?"
      description="Prüfe noch einmal, was gelöscht wird und was bleibt."
      closeLabel="Schließen"
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setTyped("");
        props.onOpenChange(open);
      }}
    >
      <div className="flex flex-col gap-4">
        <WhatHappens />
        <label className="flex flex-col gap-1 text-sm">
          <span>
            Zur Bestätigung tippe <strong>{CONFIRM_WORD}</strong>
          </span>
          <Input
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Zur Bestätigung ${CONFIRM_WORD} eingeben`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={typed.trim() !== CONFIRM_WORD || props.running}
            onClick={props.onConfirm}
          >
            {props.running ? "Wird vorgemerkt …" : "Konto in 7 Tagen löschen"}
          </Button>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Abbrechen
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
