import { useCallback } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { useInvalidate } from "../kernel";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { CollectionPageSkeleton } from "./CollectionPage.skeleton";
import { PageFrame, Status, Warning } from "./parts";
import { refusalText } from "./refusal";
import { CreateForm } from "./create-form";
import { ArchivedList } from "./archived-list";
import { ArchiveForm } from "./archived-form";
import { CollectionList } from "./collection-list";
import { COLLECTION_KEY, useCollection, type Loaded, type Token } from "./use-collection";
import { useArchive } from "./use-archive";
import { useRepot } from "./use-repot";
import { useMarker } from "./use-marker";
import { useCreate } from "./use-create";
import { MarkerForm } from "./marker-form";
import { CatchDateForm, useCatchDate } from "./catch-date-field";
import { DistributionView } from "./distribution-view";

function Created({ specimen }: { specimen: Specimen }) {
  return (
    <Status>
      {specimen.status === "cutting" ? "Steckling" : "Exemplar"} „{specimen.name}“ ist angelegt.
      {specimen.status === "cutting" &&
        " Er steht unter Stecklingslicht; tippe auf der Karte „Eingetopft“, sobald du ihn eintopfst."}
      {specimen.locationId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </Status>
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
  const request = useCollection(api, token);
  const afterAction = useInvalidate(COLLECTION_KEY);
  const archived = useArchive(api, token, afterAction);
  const potted = useRepot(api, token, afterAction);
  const marked = useMarker(api, token, afterAction);
  const caught = useCatchDate(api, token, afterAction);
  const clearMessages = useCallback(() => {
    for (const a of [archived, potted, marked, caught]) a.setMessage(null);
  }, [archived, potted, marked, caught]);
  const create = useCreate(api, token, newSpecies, {
    after: afterAction,
    clearMessages,
    completed: props.onCompleted,
  });
  return (
    <PageFrame>
      <RequestState
        status={request.status}
        {...(request.error ? { errorText: request.error.text } : {})}
        onRetry={request.retry}
        skeleton={<CollectionPageSkeleton label="Bestand wird geladen …" />}
        offline={request.offline}
      >
        {request.value && (
          <Views
            data={request.value}
            create={create}
            actions={{ archived, potted, marked, caught, clearMessages }}
            props={props}
          />
        )}
      </RequestState>
    </PageFrame>
  );
}

type Actions = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  caught: ReturnType<typeof useCatchDate>;
  clearMessages: () => void;
};

/** One view at a time: the create form, the archive form, the marker form or the list. */
function Views(p: {
  data: Loaded;
  create: ReturnType<typeof useCreate>;
  actions: Actions;
  props: Props;
}) {
  const { data, create, props } = p;
  const { archived, marked, caught } = p.actions;
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
  if (caught.open) return <CatchDateForm state={{ ...caught, open: caught.open }} />;
  return <List data={data} created={create.created} actions={p.actions} props={props} />;
}

function List(p: { data: Loaded; created: Specimen | null; actions: Actions; props: Props }) {
  const { data, actions } = p;
  const { archived, potted, marked, caught, clearMessages } = actions;
  const message = caught.message ?? marked.message ?? archived.message ?? potted.message;
  const error = archived.error ?? potted.error;
  return (
    <>
      {message ? <Status>{message}</Status> : p.created && <Created specimen={p.created} />}
      {error && (
        <Warning>
          <p>{refusalText(error)}</p>
        </Warning>
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
          caught.setMessage(null);
          void potted.repot(e);
        }}
        onMark={(e) => {
          clearMessages();
          marked.setOpen(e);
        }}
        onCatchDate={(e) => {
          clearMessages();
          caught.setOpen(e);
        }}
        {...(p.props.onMeasure ? { onMeasure: p.props.onMeasure } : {})}
      />
      <ArchivedList
        entries={data.archived}
        onRestore={(e) => {
          marked.setMessage(null);
          caught.setMessage(null);
          void archived.restore(e);
        }}
      />
    </>
  );
}
