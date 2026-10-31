import { useCallback, type ReactNode } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { useInvalidate } from "../../kernel";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { CollectionPageSkeleton } from "./collection-page.skeleton";
import { PageFrame, Status, Warning } from "../specimens/cards/parts/parts";
import { refusalText } from "../specimens/model/refusal";
import { CreateForm } from "../specimens/create/create-form/create-form";
import { ArchiveForm } from "../archived/archived-form/archived-form";
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
import { RepotForm } from "../markers/repot/repot-form/repot-form";
import { useMarker } from "../markers/marker/use-marker";
import { useCreate } from "../specimens/create/use-create";
import { MarkerForm } from "../markers/marker/marker-form/marker-form";
import {
  CatchDateForm,
  useCatchDate,
} from "../markers/catch-date/catch-date-field/catch-date-field";
import { LightZoneForm, useLightZone } from "../markers/locate/light-zone-form/light-zone-form";
import { Created } from "./created/created";
import { ListHint } from "./hint-occasions/hint-occasions";
import { PlantsScreen } from "../plants-screen/plants-screen";
import type { PlantSlots } from "../plants-screen/plant-layers/layer-ids";
import { useListActions, type ListActions } from "../specimens/hooks/use-list-actions";
type Props = {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onAdd?: () => void; // quick flow for a further plant instead of the catalog (US-ONB-01)
  onCompleted: (specimen: Specimen) => void;
  onMeasure?: (e: { id: string; name: string }) => void;
  /** Set when the destination "Sammlung" shows the page below its title: demoted heading, count line (US-QS-14). */
  host?: Host;
  /** Opens the management of locations and light zones from the layers of the plants (US-QS-19). */
  onManage?: () => void;
  groupBy?: "location"; // grouping by location and zone (US-QS-14)
  renderHint?: (applicable: readonly string[]) => ReactNode; // calm hint (US-ONB-07)
  /** Parts of the plant layer that belong to other modules, wired by the app (US-QS-23). */
  plantSlots?: PlantSlots;
};

/**
 * Collection, create (US-BES-02), markers (US-BES-03), archive (US-BES-07): the form with a chosen species, otherwise the
 * list with the archive below. The species comes from the catalog; the app wires the two.
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
  const formOpen = !!(
    newSpecies ||
    archived.open ||
    potted.open ||
    marked.open ||
    caught.open ||
    zoned.open
  );
  useHostReport(props.host, request.value?.cards.length, formOpen);
  const create = useCreate(api, token, newSpecies, {
    after: afterAction,
    clearMessages,
    completed: props.onCompleted,
  });
  return (
    <PageFrame className="flex min-h-0 flex-1 flex-col">
      <RequestState
        status={request.status}
        {...(request.error ? { errorText: request.error.text } : {})}
        onRetry={request.retry}
        {...(props.host ? {} : { heading: "Sammlung" })}
        skeleton={<CollectionPageSkeleton label="Sammlung wird geladen …" />}
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

/** One view at a time: the create form, the archive form, the marker form or the list. */
function Views(p: {
  data: Loaded;
  create: ReturnType<typeof useCreate>;
  actions: ListActions;
  props: Props;
}) {
  const { data, create, props } = p;
  const { archived, potted, marked, caught, zoned } = p.actions;
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
  if (zoned.open) return <LightZoneForm state={{ ...zoned, open: zoned.open }} />;
  return <List data={data} created={create.created} actions={p.actions} props={props} />;
}

function List(p: { data: Loaded; created: Specimen | null; actions: ListActions; props: Props }) {
  const { data } = p;
  const { api, token } = p.props;
  const { message, error, handlers } = useListActions(api, token, p.actions);
  return (
    <>
      {message ? <Status>{message}</Status> : p.created && <Created specimen={p.created} />}
      {error && <Warning>{refusalText(error)}</Warning>}
      {p.created === null && <ListHint cards={data.cards} render={p.props.renderHint} />}
      <PlantsScreen
        cards={data.cards}
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
