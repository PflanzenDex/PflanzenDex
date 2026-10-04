import "./collection.css";
import { useCallback, useState } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { LoadError } from "../kernel";
import { CreateForm } from "./create-form";
import { ArchivedList } from "./archived-list";
import { ArchiveForm } from "./archived-form";
import { CollectionList } from "./collection-list";
import { useCollection, type Data, type Token } from "./use-collection";
import { useArchive } from "./use-archive";
import { useRepot } from "./use-repot";
import { useMarker } from "./use-marker";
import { useCreate } from "./use-create";
import { MarkerForm } from "./marker-form";
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

type Props = {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: () => void;
  onMeasure?: (e: { id: string; name: string }) => void;
};

/**
 * Collection, create a specimen (US-BES-02), tell specimens apart by marker (US-BES-03) and archive (US-BES-07). With a
 * chosen species the page shows the form, otherwise the list with the archive below. The choice of the species comes
 * from the catalog (`catalog` does not know `collection`, the wiring is done by the app).
 */
export function CollectionPage(props: Props) {
  const { api, token, newSpecies } = props;
  const [reload, setReload] = useState(0);
  const data = useCollection(api, token, reload);
  const afterAction = useCallback(() => setReload((n) => n + 1), []);
  const archived = useArchive(api, token, afterAction);
  const potted = useRepot(api, token, afterAction);
  const marked = useMarker(api, token, afterAction);
  const clearMessages = useCallback(() => {
    archived.setMessage(null);
    potted.setMessage(null);
    marked.setMessage(null);
  }, [archived, potted, marked]);
  const create = useCreate(api, token, newSpecies, {
    after: afterAction,
    clearMessages,
    completed: props.onCompleted,
  });
  return (
    <div className="light collection">
      {data.kind === "loading" && <p role="status">Bestand wird geladen …</p>}
      {data.kind === "error" && <LoadError error={data.error} onReload={afterAction} />}
      {data.kind === "da" && (
        <Views
          data={data}
          create={create}
          actions={{ archived, potted, marked, clearMessages }}
          props={props}
        />
      )}
    </div>
  );
}

type Actions = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  clearMessages: () => void;
};

/** One view at a time: the create form, the archive form, the marker form or the list. */
function Views(p: {
  data: Extract<Data, { kind: "da" }>;
  create: ReturnType<typeof useCreate>;
  actions: Actions;
  props: Props;
}) {
  const { data, create, props } = p;
  const { archived, marked } = p.actions;
  if (props.newSpecies) {
    const id = props.newSpecies.id;
    return (
      <CreateForm
        species={props.newSpecies}
        siblings={data.cards.filter((k) => k.speciesId === id)}
        locations={data.locations}
        onSend={create.send}
        onCancel={props.onSpeciesChoose}
      />
    );
  }
  if (archived.open) {
    return (
      <ArchiveForm
        name={archived.open.name}
        onSend={archived.archive}
        onCancel={() => archived.setOpen(null)}
      />
    );
  }
  if (marked.open) {
    return (
      <MarkerForm
        name={marked.open.name}
        speciesName={marked.open.speciesName}
        marker={marked.open.marker}
        onSend={marked.send}
        onCancel={() => marked.setOpen(null)}
      />
    );
  }
  return <List data={data} created={create.created} actions={p.actions} props={props} />;
}

function List(p: {
  data: Extract<Data, { kind: "da" }>;
  created: Specimen | null;
  actions: Actions;
  props: Props;
}) {
  const { data, actions } = p;
  const { archived, potted, marked, clearMessages } = actions;
  const message = marked.message ?? archived.message ?? potted.message;
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
          clearMessages();
          archived.setOpen(e);
        }}
        onRepot={(e) => {
          archived.setMessage(null);
          marked.setMessage(null);
          void potted.repot(e);
        }}
        onMark={(e) => {
          clearMessages();
          marked.setOpen(e);
        }}
        {...(p.props.onMeasure ? { onMeasure: p.props.onMeasure } : {})}
      />
      <ArchivedList
        entries={data.archived}
        onRestore={(e) => {
          marked.setMessage(null);
          void archived.restore(e);
        }}
      />
    </>
  );
}
