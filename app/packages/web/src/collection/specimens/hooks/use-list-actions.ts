import { useInvalidate, useWriteAction } from "../../../shared/data";
import type {
  CatchDateTarget,
  useCatchDate,
} from "../../markers/catch-date/catch-date-field/catch-date-field";
import type { useLightZone } from "../../markers/locate/light-zone-form/light-zone-form";
import type { MarkTarget, useMarker } from "../../markers/marker/use-marker";
import type { SpecimenCard } from "@pflanzendex/core";
import { setSpecimenLocation } from "../model/specimens-api";
import type { FormKind } from "../../plants-screen/plant-layers/plant-forms/address/form-address";
import type { useArchive } from "./use-archive";
import { COLLECTION_KEY, type Token } from "./use-collection";
import type { RepotTarget, useRepot } from "./use-repot";

export type ListActions = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  caught: ReturnType<typeof useCatchDate>;
  zoned: ReturnType<typeof useLightZone>;
  clearMessages: () => void;
  /** Opens the address of a form of a plant, so Back and a reload reach it (US-QS-15). */
  open: (kind: FormKind, plantId: string) => void;
};

type Named = { id: string; name: string };

/**
 * What the plants screen calls when a plant's layer asks for an action (US-BES-03, US-BES-04, US-BES-07, US-BES-11,
 * US-LIC-02, US-PHA-03): each clears the old message first, then opens its flow or writes through its operation (P-03).
 * The latest message and error of any of them are returned for the page to show (P-09, P-10).
 */
export function useListActions(api: string, token: Token, a: ListActions) {
  const { archived, potted, marked, caught, zoned, clearMessages, open } = a;
  const place = useWriteAction(token, useInvalidate(COLLECTION_KEY));
  const openCatchDate = (e: CatchDateTarget) => {
    clearMessages();
    caught.setOpen(e);
    open("catch-date", e.id);
  };
  return {
    message:
      place.message ??
      zoned.message ??
      caught.message ??
      marked.message ??
      archived.message ??
      potted.message,
    error: archived.error ?? place.error,
    handlers: {
      onLocate: (specimenId: string, locationId: string, success: string) => {
        clearMessages();
        void place.run((t) => setSpecimenLocation(api, t, { id: specimenId, locationId }), success);
      },
      onArchive: (e: Named) => {
        clearMessages();
        archived.setOpen(e);
        open("archive-plant", e.id);
      },
      onRepot: (e: RepotTarget) => {
        clearMessages();
        potted.setOpen(e);
        open("repot", e.id);
      },
      onMark: (e: MarkTarget) => {
        clearMessages();
        marked.setOpen(e);
        open("marker", e.id);
      },
      onCatchDate: openCatchDate,
      onLightZone: (e: SpecimenCard) => {
        clearMessages();
        zoned.setOpen(e);
        open("light-zone", e.id);
      },
      onRestore: (e: Named) => {
        clearMessages();
        void archived.restore(e);
      },
      onArchivedCatchDate: openCatchDate,
    },
  };
}
