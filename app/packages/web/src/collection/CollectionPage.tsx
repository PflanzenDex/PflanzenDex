import "./collection.css";
import { useCallback, useState } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { LoadError, type ApiError } from "../kernel";
import { CreateForm, type CreateInput } from "./create-form";
import { ArchivedList } from "./archived-list";
import { ArchiveForm } from "./archived-form";
import { CollectionList } from "./collection-list";
import { createSpecimen } from "./specimens-api";
import { SIGN_IN, useCollection, type Data, type Token } from "./use-collection";
import { useArchive } from "./use-archive";
import { useRepot } from "./use-repot";
import { DistributionView } from "./distribution-view";

function Created({ specimen }: { specimen: Specimen }) {
  return (
    <p role="status" className="hint">
      {specimen.status === "cutting" ? "Steckling" : "Exemplar"} „{specimen.name}“ ist angelegt.
      {specimen.status === "cutting" &&
        " Er steht unter Stecklingslicht; tippe auf der Karte „Eingetopft“, sobald du ihn eintopfst."}
      {specimen.locationId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </p>
  );
}

/**
 * Collection, create a specimen (US-BES-02) and archive (US-BES-07). With a chosen species the page shows the form,
 * otherwise the list with the archive below. The choice of the species comes from the catalog (`catalog` does not know
 * `collection`, the wiring is done by the app).
 */
export function CollectionPage(props: {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: () => void;
  onMeasure?: (e: { id: string; name: string }) => void;
}) {
  const { api, token, newSpecies, onCompleted } = props;
  const [reload, setReload] = useState(0);
  const [created, setCreated] = useState<Specimen | null>(null);
  const data = useCollection(api, token, reload);
  const afterAction = useCallback(() => setReload((n) => n + 1), []);
  const archived = useArchive(api, token, afterAction);
  const potted = useRepot(api, token, afterAction);
  const send = useCallback(
    async (input: CreateInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !newSpecies) return SIGN_IN;
      const r = await createSpecimen(api, t, { speciesId: newSpecies.id, ...input });
      if (!r.ok) return r.error;
      archived.setMessage(null);
      potted.setMessage(null);
      setCreated(r.value);
      afterAction();
      onCompleted();
      return null;
    },
    [api, token, newSpecies, onCompleted, afterAction, archived, potted],
  );
  return (
    <div className="light collection">
      {data.kind === "loading" && <p role="status">Bestand wird geladen …</p>}
      {data.kind === "error" && <LoadError error={data.error} onReload={afterAction} />}
      {data.kind === "da" && newSpecies && (
        <CreateForm
          species={newSpecies}
          locations={data.locations}
          onSend={send}
          onCancel={props.onSpeciesChoose}
        />
      )}
      {data.kind === "da" && !newSpecies && archived.open && (
        <ArchiveForm
          name={archived.open.name}
          onSend={archived.archive}
          onCancel={() => archived.setOpen(null)}
        />
      )}
      {data.kind === "da" && !newSpecies && !archived.open && (
        <List data={data} archived={archived} potted={potted} created={created} props={props} />
      )}
    </div>
  );
}

function List(p: {
  data: Extract<Data, { kind: "da" }>;
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  created: Specimen | null;
  props: Parameters<typeof CollectionPage>[0];
}) {
  const { data, archived, potted } = p;
  const message = archived.message ?? potted.message;
  const error = archived.error ?? potted.error;
  return (
    <>
      {message ? (
        <p role="status" className="hint">
          {message}
        </p>
      ) : (
        p.created && <Created specimen={p.created} />
      )}
      {error && (
        <div role="alert" className="warning">
          <p>{error.text}</p>
        </div>
      )}
      <DistributionView distribution={data.distribution} />
      <CollectionList
        cards={data.cards}
        onSpeciesChoose={p.props.onSpeciesChoose}
        onArchive={(e) => {
          archived.setMessage(null);
          potted.setMessage(null);
          archived.setOpen(e);
        }}
        onRepot={(e) => {
          archived.setMessage(null);
          void potted.repot(e);
        }}
        {...(p.props.onMeasure ? { onMeasure: p.props.onMeasure } : {})}
      />
      <ArchivedList entries={data.archived} onRestore={archived.restore} />
    </>
  );
}
