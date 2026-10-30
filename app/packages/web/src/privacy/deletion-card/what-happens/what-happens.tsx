/** The word the keeper types to confirm (US-ACC-04: deleting needs a confirmation). */
export const CONFIRM_WORD = "LÖSCHEN";

/** What goes and what stays, named before the keeper confirms (US-ACC-04). It sits in the layer of the deletion (US-QS-15). */
export function WhatHappens() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="m-0 font-semibold">Das wird gelöscht:</p>
      <ul className="m-0 list-disc pl-5">
        <li>
          alle deine Pflanzen, Messungen, Behandlungen, Wünsche und das Equipment mit allem, was
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
        Nach der Bestätigung passiert 7&nbsp;Tage lang nichts, du kannst die Löschung zurücknehmen.
        Danach ist sie endgültig. Lade vorher deine Daten herunter, wenn du sie behalten willst.
      </p>
    </div>
  );
}
