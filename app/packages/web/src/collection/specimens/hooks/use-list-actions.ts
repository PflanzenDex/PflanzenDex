import { useInvalidate, useWriteAction } from "../../../kernel";
import type {
  CatchDateTarget,
  useCatchDate,
} from "../../markers/catch-date/catch-date-field/catch-date-field";
import type { useLightZone } from "../../markers/locate/light-zone-form/light-zone-form";
import type { useMarker } from "../../markers/marker/use-marker";
import { setSpecimenLocation } from "../model/specimens-api";
import type { useArchive } from "./use-archive";
import { COLLECTION_KEY, type Token } from "./use-collection";
import type { useRepot } from "./use-repot";

export type ListActions = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  caught: ReturnType<typeof useCatchDate>;
  zoned: ReturnType<typeof useLightZone>;
  clearMessages: () => void;
};

type Named = { id: string; name: string };

/**
 * What the plants screen calls when a plant's layer asks for an action (US-BES-03, US-BES-04, US-BES-07, US-BES-11,
 * US-LIC-02, US-PHA-03): each clears the old message first, then opens its flow or writes through its operation (P-03).
 * The latest message and error of any of them are returned for the page to show (P-09, P-10).
 */
export function useListActions(api: string, token: Token, a: ListActions) {
  const { archived, potted, marked, caught, zoned, clearMessages } = a;
  const place = useWriteAction(token, useInvalidate(COLLECTION_KEY));
  const openCatchDate = (e: CatchDateTarget) => {
    clearMessages();
    caught.setOpen(e);
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
      },
      onRepot: (e: Named) => {
        clearMessages();
        potted.setOpen(e);
      },
      onMark: (e: Parameters<typeof marked.setOpen>[0] & object) => {
        clearMessages();
        marked.setOpen(e);
      },
      onCatchDate: openCatchDate,
      onLightZone: (e: Parameters<typeof zoned.setOpen>[0] & object) => {
        clearMessages();
        zoned.setOpen(e);
      },
      onRestore: (e: Named) => {
        clearMessages();
        void archived.restore(e);
      },
      onArchivedCatchDate: openCatchDate,
    },
  };
}
