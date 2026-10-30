// German texts of the WUN errors (epic WUN), so `error.ts` stays under the file size limit.

export const WUN_ERROR_TEXTS = {
  "wish.not_found": "Diesen Wunsch gibt es nicht. Lade die Wunschliste neu.",
  "wish.name_taken":
    "Einen Wunsch mit diesem Namen gibt es schon. Prüfe die Wunschliste, statt ihn doppelt anzulegen.",
  "wish.image_source_unsupported":
    "Das Bild kann nur von Wikimedia Commons gespeichert werden. Trage die Adresse einer Datei von commons.wikimedia.org ein; es wurde nichts gespeichert.",
  "wish.image_not_found":
    "Dieses Bild gibt es bei Wikimedia Commons nicht (mehr). Prüfe die Adresse; es wurde nichts gespeichert.",
  "wish.image_license_unsupported":
    "Die Lizenz dieses Bildes erlaubt kein Speichern oder ist nicht angegeben. Nimm ein Bild mit freier Lizenz (CC0, CC BY, CC BY-SA oder gemeinfrei); es wurde nichts gespeichert.",
  "wish.not_open":
    "Dieser Wunsch ist verworfen und nicht mehr offen. Nur ein offener Wunsch kann als gekauft vermerkt werden; es wurde nichts geändert.",
  "wish.not_open_for_friends":
    "Dieser Wunsch ist gekauft oder verworfen und kann nicht mehr für Freunde sichtbar gemacht werden. Es wurde nichts geändert.",
  "wish.already_bought":
    "Dieser Wunsch ist schon als gekauft vermerkt und lässt sich nicht mehr verwerfen. Es wurde nichts geändert.",
  "wish.not_bought":
    "Dieser Wunsch ist nicht als gekauft vermerkt. Nur ein gekaufter Wunsch wird mit einer Pflanze verknüpft; es wurde nichts geändert.",
  "wish.already_linked":
    "Dieser Wunsch ist schon mit einer anderen Pflanze verknüpft, oder die Pflanze gehört schon zu einem anderen Wunsch. Es wurde nichts geändert.",
  "wish.not_duplicate":
    "Dieser Wunsch hat keinen doppelten Namen und lässt sich hier nicht umbenennen oder löschen. Lade die Wunschliste neu; es wurde nichts geändert.",
} as const;
