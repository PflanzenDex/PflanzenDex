import { useCallback } from "react";
import { useInvalidate } from "../../shared/data";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { CollectionPageSkeleton } from "./collection-page.skeleton";
import { PageFrame } from "../specimens/cards/parts/parts";
import type { Props } from "./collection-props";
import { COLLECTION_KEY, useCollection, useHostReport } from "../specimens/hooks/use-collection";
import { useArchive } from "../specimens/hooks/use-archive";
import { useRepot } from "../specimens/hooks/use-repot";
import { useMarker } from "../markers/marker/use-marker";
import { useCreate } from "../specimens/create/use-create";
import { useCatchDate } from "../markers/catch-date/catch-date-field/catch-date-field";
import { useLightZone } from "../markers/locate/light-zone-form/light-zone-form";
import { useCardPages } from "../specimens/cards/use-card-pages";
import { usePageAddress } from "../plants-screen/plant-layers/plant-forms/use-page-address";
import { useFormMirrors } from "../plants-screen/plant-layers/plant-forms/mirror/use-form-mirrors";
import { Views } from "../plants-screen/plant-layers/plant-forms/collection-views/collection-views";

/** The state of the page from its two reads: ready only when both are ready, pending while one waits, else an error. */
function pageStatus(summary: string, first: string): "ready" | "pending" | "error" {
  if (summary === "ready" && first === "ready") return "ready";
  return summary === "pending" || first === "pending" ? "pending" : "error";
}

/**
 * Collection, create (US-BES-02), markers (US-BES-03), archive (US-BES-07): the form with a chosen species, otherwise the
 * list with the archive below. The species comes from the catalog; the app wires the two. The forms of a plant are full
 * views with an address (US-QS-15): the address opens them, Back closes them, and their state follows the address.
 */
export function CollectionPage(props: Props) {
  const { api, token, newSpecies } = props;
  const { form, formPlant } = usePageAddress(api, token, props);
  const request = useCollection(api, token);
  // The plants are read page by page; the first page is part of the view, a failure of it fails the whole view (P-10).
  const plants = useCardPages(api, token);
  const afterAction = useInvalidate(COLLECTION_KEY);
  const archived = useArchive(api, token, afterAction);
  const potted = useRepot(api, token, afterAction);
  const marked = useMarker(api, token, afterAction);
  const caught = useCatchDate(api, token, afterAction);
  const zoned = useLightZone(api, token, afterAction);
  const hooks = { archived, potted, marked, caught, zoned };
  const clearMessages = useCallback(() => {
    for (const a of [archived, potted, marked, caught, zoned]) a.setMessage(null);
  }, [archived, potted, marked, caught, zoned]);
  const opened = [archived.open, potted.open, marked.open, caught.open, zoned.open];
  const formOpen = !!newSpecies || opened.some(Boolean);
  useHostReport(props.host, request.value?.summary.total, formOpen);
  useFormMirrors({
    form,
    plant: formPlant,
    archivedEntry: request.value?.archived.find((e) => e.id === form.plantId),
    hooks,
  });
  const create = useCreate(api, token, newSpecies, {
    after: afterAction,
    clearMessages,
    completed: props.onCompleted,
  });
  // The view waits for the summary and the first page; either failing fails the whole view with its text (P-10).
  const requestFailed = request.status === "error" ? request.error : plants.error;
  const status = pageStatus(request.status, plants.status);
  return (
    // No min-h-0: the card is never shorter than what it holds, so at a larger text size it grows with its content
    // and the one-screen frame scrolls (issue 1113); at normal text the list inside takes the free height.
    <PageFrame className="flex flex-1 flex-col">
      <RequestState
        status={status}
        {...(requestFailed ? { errorText: requestFailed.text } : {})}
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
            actions={{ ...hooks, clearMessages, open: form.open }}
            form={form}
            formPlant={formPlant}
            props={props}
          />
        )}
      </RequestState>
    </PageFrame>
  );
}
