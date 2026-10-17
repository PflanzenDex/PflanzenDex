import { useCallback } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { useInvalidate } from "../../kernel";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { CollectionPageSkeleton } from "./collection-page.skeleton";
import { PageFrame, Status, Warning } from "../specimens/cards/parts/parts";
import { refusalText } from "../specimens/model/refusal";
import { CreateForm } from "../specimens/create/create-form/create-form";
import { ArchivedList } from "../archived/archived-list/archived-list";
import { ArchiveForm } from "../archived/archived-form/archived-form";
import { CollectionList } from "../specimens/cards/collection-list/collection-list";
import {
  COLLECTION_KEY,
  useCollection,
  useHostReport,
  type Host,
  type Loaded,
  type Token,
} from "../specimens/hooks/use-collection";
import { useArchive } from "../specimens/hooks/use-archive";
import { useRepot } from "../specimens/hooks/use-repot";
import { useMarker } from "../markers/use-marker";
import { useCreate } from "../specimens/create/use-create";
import { MarkerForm } from "../markers/marker/marker-form/marker-form";
import {
  CatchDateForm,
  useCatchDate,
  type CatchDateTarget,
} from "../markers/catch-date/catch-date-field/catch-date-field";
import { LightZoneForm, useLightZone } from "../markers/locate/light-zone-form/light-zone-form";
import { Created } from "./created/created";
import { DistributionView } from "../insights/distribution-view/distribution-view";
type Props = {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: (specimen: Specimen) => void;
  onMeasure?: (e: { id: string; name: string }) => void;
  /** Set when the destination "Sammlung" shows the page below its title: demoted heading, count line (US-QS-14). */
  host?: Host;
  groupBy?: "location"; // grouping by location and zone (US-QS-14)
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
  const zoned = useLightZone(api, token, afterAction);
  const clearMessages = useCallback(() => {
    for (const a of [archived, potted, marked, caught, zoned]) a.setMessage(null);
  }, [archived, potted, marked, caught, zoned]);
  const formOpen = !!(newSpecies || archived.open || marked.open || caught.open || zoned.open);
  useHostReport(props.host, request.value?.cards.length, formOpen);
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
        {...(props.host ? {} : { heading: "Bestand" })}
        skeleton={<CollectionPageSkeleton label="Bestand wird geladen …" />}
        offline={request.offline}
      >
        {request.value && (
          <Views
            data={request.value}
            create={create}
            actions={{ archived, potted, marked, caught, zoned, clearMessages }}
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
  zoned: ReturnType<typeof useLightZone>;
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
  const { archived, marked, caught, zoned } = p.actions;
  if (props.newSpecies) {
    const id = props.newSpecies.id;
    return (
      <CreateForm
        species={props.newSpecies}
        siblings={data.cards.filter((k) => k.speciesId === id)}
        locations={data.locations}
        zones={create.zones}
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
  if (zoned.open) return <LightZoneForm state={{ ...zoned, open: zoned.open }} />;
  return <List data={data} created={create.created} actions={p.actions} props={props} />;
}

function List(p: { data: Loaded; created: Specimen | null; actions: Actions; props: Props }) {
  const { data, actions } = p;
  const { archived, potted, marked, caught, zoned, clearMessages } = actions;
  const message =
    zoned.message ?? caught.message ?? marked.message ?? archived.message ?? potted.message;
  const error = archived.error ?? potted.error;
  const openCatchDate = (e: CatchDateTarget) => {
    clearMessages();
    caught.setOpen(e);
  };
  return (
    <>
      {message ? <Status>{message}</Status> : p.created && <Created specimen={p.created} />}
      {error && <Warning>{refusalText(error)}</Warning>}
      <DistributionView distribution={data.distribution} />
      <CollectionList
        cards={data.cards}
        onSpeciesChoose={p.props.onSpeciesChoose}
        embedded={p.props.host !== undefined}
        photoAccess={{ api: p.props.api, token: p.props.token }}
        {...(p.props.groupBy ? { groupBy: p.props.groupBy } : {})}
        onArchive={(e) => {
          clearMessages();
          archived.setOpen(e);
        }}
        onRepot={(e) => {
          clearMessages();
          void potted.repot(e);
        }}
        onMark={(e) => {
          clearMessages();
          marked.setOpen(e);
        }}
        onCatchDate={openCatchDate}
        onLightZone={(e) => {
          clearMessages();
          zoned.setOpen(e);
        }}
        {...(p.props.onMeasure ? { onMeasure: p.props.onMeasure } : {})}
      />
      <ArchivedList
        entries={data.archived}
        onRestore={(e) => {
          clearMessages();
          void archived.restore(e);
        }}
        onCatchDate={openCatchDate}
      />
    </>
  );
}
