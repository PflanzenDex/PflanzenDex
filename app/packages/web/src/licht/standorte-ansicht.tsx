import { useState } from "react";
import type { ApiFehler, LichtStandort, Lichtzone } from "./licht-api";
import { FormularKnoepfe, useSenden } from "./formular";
import { FehlerMeldung } from "./meldung";
import { artText, zonenName } from "./text";

export interface StandortEingabe {
  name: string;
  lichtzoneId: string | null;
  art: "innen" | "aussen";
}

type Speichern = (e: StandortEingabe) => Promise<ApiFehler | null>;

export function StandortFormular(props: {
  zonen: readonly Lichtzone[];
  start?: LichtStandort;
  onSpeichern: Speichern;
  onAbbrechen?: () => void;
}) {
  const s = props.start;
  const { fehler, laeuft, senden } = useSenden<StandortEingabe>(
    (f) => ({
      name: String(f.get("name") ?? ""),
      lichtzoneId: String(f.get("lichtzoneId") ?? "") || null,
      art: f.get("art") === "aussen" ? "aussen" : "innen",
    }),
    props.onSpeichern,
    !s,
  );
  return (
    <form
      className="formular"
      onSubmit={(e) => void senden(e)}
      aria-label={s ? `${s.name} ändern` : "Standort anlegen"}
    >
      <label>
        Name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={s?.name ?? ""}
          autoComplete="off"
        />
      </label>
      <label>
        Lichtzone
        <select name="lichtzoneId" defaultValue={s?.lichtzoneId ?? ""}>
          <option value="">Keine Lichtzone (erscheint in den Hinweisen)</option>
          {props.zonen.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Art
        <select name="art" defaultValue={s?.art ?? "innen"}>
          <option value="innen">innen</option>
          <option value="aussen">außen</option>
        </select>
      </label>
      {fehler && <FehlerMeldung fehler={fehler} />}
      <FormularKnoepfe
        beschriftung={s ? "Speichern" : "Standort anlegen"}
        laeuft={laeuft}
        onAbbrechen={props.onAbbrechen}
      />
    </form>
  );
}

export function StandortKarte(props: {
  standort: LichtStandort;
  zonen: readonly Lichtzone[];
  onAendern: Speichern;
}) {
  const { standort } = props;
  const [aendern, setAendern] = useState(false);
  const zone = zonenName(props.zonen, standort.lichtzoneId);
  if (aendern)
    return (
      <li className="eintrag">
        <StandortFormular
          zonen={props.zonen}
          start={standort}
          onAbbrechen={() => setAendern(false)}
          onSpeichern={async (e) => {
            const f = await props.onAendern(e);
            if (!f) setAendern(false);
            return f;
          }}
        />
      </li>
    );
  return (
    <li className="eintrag">
      <h3>{standort.name}</h3>
      <p className="leise">
        {zone ?? "Keine Lichtzone"} · {artText(standort.art)}
      </p>
      <div className="aktionen">
        <button type="button" className="sekundaer" onClick={() => setAendern(true)}>
          {zone ? "Ändern" : "Lichtzone zuweisen"}
        </button>
      </div>
    </li>
  );
}
