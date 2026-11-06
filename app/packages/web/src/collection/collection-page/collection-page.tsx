import { useCallback } from "react";
import type { Specimen } from "@pflanzendex/core";
import { useInvalidate } from "../../shared/data";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { CollectionPageSkeleton } from "./collection-page.skeleton";
import { PageFrame, Status, Warning } from "../specimens/cards/parts/parts";
import { refusalText } from "@/shared/lib/error-text";
import { CreateWithSiblings } from "./create-with-siblings/create-with-siblings";
import type { Props } from "./collection-props";
import { ArchiveForm } from "../archived/archived-form/archived-form";
import {
  COLLECTION_KEY,
  useCollection,
  useHostReport,
  type Loaded,
} from "../specimens/hooks/use-collection";
import { useArchive } from "../specimens/hooks/use-archive";
import { useRepot } from "../specimens/hooks/use-repot";
import { RepotForm } from "../markers/repot/repot-form/repot-form";
import { useMarker } from "../markers/marker/use-marker";
import { useCreate } from "../specimens/create/use-create";
import { MarkerForm } from "../markers/marker/marker-form/marker-form";
import {
  CatchDateForm,
  useCatchDate,
} from "../markers/catch-date/catch-date-field/catch-date-field";
import { LightZoneForm, useLightZone } from "../markers/locate/light-zone-form/light-zone-form";
import { NotesForm } from "../plants-screen/plant-layers/plant-layer/plant-notes/notes-form/notes-form";
import { useNotes } from "../specimens/hooks/use-notes";
import { Created } from "./created/created";
import { ListHint } from "./hint-occasions/hint-occasions";
import { PlantsScreen } from "../plants-screen/plants-screen";
import { useListActions, type ListActions } from "../specimens/hooks/use-list-actions";
import { useCardPages, type CardPages } from "../specimens/cards/use-card-pages";

/**
 * Collection, create (US-BES-02), markers (US-BES-03), archive (US-BES-07): the form with a chosen species, otherwise the
 * list with the archive below. The species comes from the catalog; the app wires the two.
 */
export function CollectionPage(props: Props) {
  const { api, token, newSpecies } = props;
  const request = useCollection(api, token);
  // The plants are read page by page; the first page is part of the view, a failure of it fails the whole view (P-10).
  const plants = useCardPages(api, token);
  const afterAction = useInvalidate(COLLECTION_KEY);
  const archived = useArchive(api, token, afterAction);
  const potted = useRepot(api, token, afterAction);
  const marked = useMarker(api, token, afterAction);
  const caught = useCatchDate(api, token, afterAction);
  const zoned = useLightZone(api, token, afterAction);
  const noted = useNotes(api, token, afterAction);
  const clearMessages = useCallback(() => {
    for (const a of [archived, potted, marked, caught, zoned, noted]) a.setMessage(null);
  }, [archived, potted, marked, caught, zoned, noted]);
  const opened = [archived.open, potted.open, marked.open, caught.open, zoned.open, noted.open];
  const formOpen = !!newSpecies || opened.some(Boolean);
  useHostReport(props.host, request.value?.summary.total, formOpen);
  const create = useCreate(api, token, newSpecies, {
    after: afterAction,
    clearMessages,
    completed: props.onCompleted,
  });
  // The view waits for the summary and the first page; either failing fails the whole view with its text (P-10).
  const failed = request.status === "error" ? request.error : plants.error;
  const ready = request.status === "ready" && plants.status === "ready";
  const status = ready
    ? "ready"
    : request.status === "pending" || plants.status === "pending"
      ? "pending"
      : "error";
  return (
    // No min-h-0: the card is never shorter than what it holds, so at a larger text size it grows with its content
    // and the one-screen frame scrolls (issue 1113); at normal text the list inside takes the free height.
    <PageFrame className="flex flex-1 flex-col">
      <RequestState
        status={status}
        {...(failed ? { errorText: failed.text } : {})}
        onRetry={() => {
          request.retry();
          plants.retry();
        }}
        {...(props.host ? {} : { heading: "Sammlung" })}
        skeleton={<CollectionPageSkeleton label="Sammlung wird geladen …" />}
        offline={request.offline}
      >
        {request.value && (
          <Views
            data={request.value}
            plants={plants}
            create={create}
            actions={{ archived, potted, marked, caught, zoned, noted, clearMessages }}
            props={props}
          />
        )}
      </RequestState>
    </PageFrame>
  );
}

/** One view at a time: the create form, the archive form, the marker form or the list. */
function Views(p: {
  data: Loaded;
  plants: CardPages;
  create: ReturnType<typeof useCreate>;
  actions: ListActions;
  props: Props;
}) {
  const { data, create, props } = p;
  const { archived, potted, marked, caught, zoned, noted } = p.actions;
  if (props.newSpecies) {
    return (
      <CreateWithSiblings
        species={props.newSpecies}
        api={props.api}
        token={props.token}
        data={data}
        create={create}
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
  if (potted.open) return <RepotForm state={{ ...potted, open: potted.open }} />;
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
  if (noted.open) return <NotesForm state={{ ...noted, open: noted.open }} />;
  if (zoned.open) return <LightZoneForm state={{ ...zoned, open: zoned.open }} />;
  return (
    <List
      data={data}
      plants={p.plants}
      created={create.created}
      actions={p.actions}
      props={props}
    />
  );
}

function List(p: {
  data: Loaded;
  plants: CardPages;
  created: Specimen | null;
  actions: ListActions;
  props: Props;
}) {
  const { data, plants } = p;
  const { api, token } = p.props;
  const { message, error, handlers } = useListActions(api, token, p.actions);
  return (
    <>
      {message ? <Status>{message}</Status> : p.created && <Created specimen={p.created} />}
      {error && <Warning>{refusalText(error)}</Warning>}
      {p.created === null && <ListHint summary={data.summary} render={p.props.renderHint} />}
      <PlantsScreen
        cards={plants.cards}
        plants={plants}
        summary={data.summary}
        distribution={data.distribution}
        archived={data.archived}
        onSpeciesChoose={p.props.onAdd ?? p.props.onSpeciesChoose}
        onManage={p.props.onManage ?? p.props.onSpeciesChoose}
        embedded={p.props.host !== undefined}
        photoAccess={{ api, token }}
        {...(p.props.groupBy ? { groupBy: p.props.groupBy } : {})}
        slots={p.props.plantSlots}
        locations={data.locations}
        {...handlers}
        {...(p.props.onMeasure ? { onMeasure: p.props.onMeasure } : {})}
      />
    </>
  );
}
