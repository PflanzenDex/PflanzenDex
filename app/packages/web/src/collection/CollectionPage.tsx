import "./collection.css";
import { useCallback, useEffect, useState } from "react";
import type { Species, Specimen, LightLocation } from "@pflanzendex/core";
import { loadLocations } from "../light";
import type { ApiError } from "../kernel";
import { CreateForm, type CreateInput } from "./create-form";
import { CollectionList } from "./collection-list";
import { loadSpecimens, createSpecimen } from "./specimens-api";

type Token = () => Promise<string | undefined>;
const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; specimens: readonly Specimen[]; locations: readonly LightLocation[] };

/** Loads specimens and locations; if one fails, loading fails as a whole (show nothing half-way). */
function useCollection(api: string, token: Token, reload: number) {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return current && setData({ kind: "error", error: SIGN_IN });
      const [e, s] = await Promise.all([loadSpecimens(api, t), loadLocations(api, t)]);
      if (!current) return;
      if (!e.ok) return setData({ kind: "error", error: e.error });
      if (!s.ok) return setData({ kind: "error", error: s.error });
      setData({ kind: "da", specimens: e.value, locations: s.value });
    })();
    return () => {
      current = false;
    };
  }, [api, token, reload]);
  return data;
}

function Created({ specimen }: { specimen: Specimen }) {
  return (
    <p role="status" className="hint">
      Exemplar „{specimen.name}“ ist angelegt.
      {specimen.locationId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </p>
  );
}

/**
 * Collection and create specimen (US-BES-02). With a chosen species the page shows the form, otherwise the list.
 * The choice of species comes from the catalog (`catalog` does not know `collection`, the app does the wiring).
 */
export function CollectionPage(props: {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: () => void;
}) {
  const { api, token, newSpecies, onCompleted } = props;
  const [reload, setReload] = useState(0);
  const [created, setCreated] = useState<Specimen | null>(null);
  const data = useCollection(api, token, reload);
  const send = useCallback(
    async (input: CreateInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !newSpecies) return SIGN_IN;
      const r = await createSpecimen(api, t, { speciesId: newSpecies.id, ...input });
      if (!r.ok) return r.error;
      setCreated(r.value);
      setReload((n) => n + 1);
      onCompleted();
      return null;
    },
    [api, token, newSpecies, onCompleted],
  );
  return (
    <div className="light collection">
      {data.kind === "loading" && <p role="status">Bestand wird geladen …</p>}
      {data.kind === "error" && (
        <div role="alert" className="warning">
          <p>{data.error.text}</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setReload((n) => n + 1)}>
              Erneut laden
            </button>
          </div>
        </div>
      )}
      {data.kind === "da" && newSpecies && (
        <CreateForm
          species={newSpecies}
          locations={data.locations}
          onSend={send}
          onCancel={props.onSpeciesChoose}
        />
      )}
      {data.kind === "da" && !newSpecies && (
        <>
          {created && <Created specimen={created} />}
          <CollectionList
            specimens={data.specimens}
            locations={data.locations}
            onSpeciesChoose={props.onSpeciesChoose}
          />
        </>
      )}
    </div>
  );
}
