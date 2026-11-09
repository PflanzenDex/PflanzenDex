import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Specimen } from "@pflanzendex/core";
import { CreateWithSiblings } from "../../../../collection-page/create-with-siblings/create-with-siblings";
import type { Props } from "../../../../collection-page/collection-props";
import { ArchiveForm } from "../../../../archived/archived-form/archived-form";
import type { Loaded } from "../../../../specimens/hooks/use-collection";
import { RepotForm } from "../../../../markers/repot/repot-form/repot-form";
import type { useCreate } from "../../../../specimens/create/use-create";
import { MarkerForm } from "../../../../markers/marker/marker-form/marker-form";
import { CatchDateForm } from "../../../../markers/catch-date/catch-date-field/catch-date-field";
import { LightZoneForm } from "../../../../markers/locate/light-zone-form/light-zone-form";
import { ListHint } from "../../../../collection-page/hint-occasions/hint-occasions";
import { PlantsScreen } from "../../../plants-screen";
import { useListActions, type ListActions } from "../../../../specimens/hooks/use-list-actions";
import type { CardPages } from "../../../../specimens/cards/use-card-pages";
import { formText, type FormAddress, type FormPlant } from "../address/form-address";
import {
  DelayedSkeleton,
  useHeldLoader,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";

/**
 * A close of a form by its own control goes through the address: with unsaved input it asks first (US-QS-15). The state
 * setter keeps its shape, so the form's state type stays as it is.
 */
export function closeThrough<T>(
  set: Dispatch<SetStateAction<T | null>>,
  requestLeave: () => void,
): Dispatch<SetStateAction<T | null>> {
  return (next) => {
    if (next === null) requestLeave();
    else set(next);
  };
}

/** The open form of a plant that keeps its own state, or nothing (US-BES-03, US-BES-04, US-BES-07, US-BES-11, US-LIC-02). */
function OpenForm(p: { actions: ListActions; form: FormAddress }): ReactNode {
  const { archived, potted, marked, caught, zoned } = p.actions;
  const { form } = p;
  if (archived.open) {
    return (
      <ArchiveForm
        name={archived.open.name}
        onSend={archived.archive}
        onCancel={form.requestLeave}
      />
    );
  }
  if (potted.open)
    return (
      <RepotForm
        state={{
          ...potted,
          open: potted.open,
          setOpen: closeThrough(potted.setOpen, form.requestLeave),
        }}
      />
    );
  if (marked.open) {
    return (
      <MarkerForm
        name={marked.open.name}
        speciesName={marked.open.speciesName}
        marker={marked.open.marker}
        onSend={marked.send}
        onCancel={form.requestLeave}
      />
    );
  }
  if (caught.open)
    return (
      <CatchDateForm
        state={{
          ...caught,
          open: caught.open,
          setOpen: closeThrough(caught.setOpen, form.requestLeave),
        }}
      />
    );
  if (zoned.open)
    return (
      <LightZoneForm
        state={{
          ...zoned,
          open: zoned.open,
          setOpen: closeThrough(zoned.setOpen, form.requestLeave),
        }}
      />
    );
  return null;
}

/** One view at a time: the create form, a form of a plant or the list. */
export function Views(p: {
  data: Loaded;
  plants: CardPages;
  create: ReturnType<typeof useCreate>;
  actions: ListActions;
  form: FormAddress;
  formPlant: FormPlant;
  props: Props;
}) {
  const { data, create, props, form, formPlant } = p;
  // An addressed form whose plant is still read: the list waits for it (a reload), and then holds the loader (D5).
  const reading = useHeldLoader(
    form.kind !== null && formPlant.card === undefined && !formPlant.failed,
  );
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
  if (hasOpenForm(p.actions)) return <OpenForm actions={p.actions} form={form} />;
  // An addressed form whose plant is still read: the list waits for it (a reload); once read, the form or the list shows.
  if (reading) {
    return (
      <DelayedSkeleton>
        <p role="status" className="text-sm text-muted-foreground">
          {formText("loading")}
        </p>
      </DelayedSkeleton>
    );
  }
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

const hasOpenForm = (a: ListActions): boolean =>
  Boolean(a.archived.open || a.potted.open || a.marked.open || a.caught.open || a.zoned.open);

function List(p: {
  data: Loaded;
  plants: CardPages;
  created: Specimen | null;
  actions: ListActions;
  props: Props;
}) {
  const { data, plants } = p;
  const { api, token } = p.props;
  const { handlers } = useListActions(api, token, p.actions);
  return (
    <>
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
