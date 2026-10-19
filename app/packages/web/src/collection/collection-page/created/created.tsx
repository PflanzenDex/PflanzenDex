import type { Specimen } from "@pflanzendex/core";
import { Status } from "../../specimens/cards/parts/parts";

/** What the page says after a specimen was created (US-BES-02, US-BES-04). */
export function Created({ specimen }: { specimen: Specimen }) {
  return (
    <Status>
      {specimen.status === "cutting" ? "Steckling" : "Exemplar"} „{specimen.name}“ ist angelegt.
      {specimen.status === "cutting" &&
        " Er steht unter Stecklingslicht; tippe auf der Karte „Eingetopft“, sobald du ihn eintopfst."}
      {specimen.locationId === null && " Der Standort ist unbekannt, du kannst ihn später setzen."}
    </Status>
  );
}
