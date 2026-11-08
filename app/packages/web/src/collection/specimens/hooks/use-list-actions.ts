import { useInvalidate, useWriteAction } from "../../../shared/data";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import type {
  CatchDateTarget,
  useCatchDate,
} from "../../markers/catch-date/catch-date-field/catch-date-field";
import type { useLightZone } from "../../markers/locate/light-zone-form/light-zone-form";
import type { useMarker } from "../../markers/marker/use-marker";
import { setSpecimenLocation } from "../model/specimens-api";
import type { useArchive } from "./use-archive";
import { COLLECTION_KEY, type Token } from "./use-collection";
import type { RepotTarget, useRepot } from "./use-repot";

export type ListActions = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  caught: ReturnType<typeof useCatchDate>;
  zoned: ReturnType<typeof useLightZone>;
  /** Shows the result of a write as a toast (US-QS-07). */
  say: Say;
};

type Named = { id: string; name: string };

/**
 * What the plants screen calls when a plant's layer asks for an action (US-BES-03, US-BES-04, US-BES-07, US-BES-11,
 * US-LIC-02, US-PHA-03): each opens its flow or writes through its operation (P-03). The result of a write is a toast,
 * so the list keeps its place (DS-54).
 */
export function useListActions(api: string, token: Token, a: ListActions) {
  const { archived, potted, marked, caught, zoned } = a;
  const place = useWriteAction(token, useInvalidate(COLLECTION_KEY), a.say);
  return {
    handlers: {
      onLocate: (specimenId: string, locationId: string, success: string) =>
        void place.run((t) => setSpecimenLocation(api, t, { id: specimenId, locationId }), success),
      onArchive: (e: Named) => archived.setOpen(e),
      onRepot: (e: RepotTarget) => potted.setOpen(e),
      onMark: (e: Parameters<typeof marked.setOpen>[0] & object) => marked.setOpen(e),
      onCatchDate: (e: CatchDateTarget) => caught.setOpen(e),
      onLightZone: (e: Parameters<typeof zoned.setOpen>[0] & object) => zoned.setOpen(e),
      onRestore: (e: Named) => void archived.restore(e),
      onArchivedCatchDate: (e: CatchDateTarget) => caught.setOpen(e),
    },
  };
}
