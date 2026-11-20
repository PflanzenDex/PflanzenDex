import { useInvalidate, useWriteAction } from "../../../shared/data";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
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
  /** Shows the result of a write as a toast (US-QS-07, DS-54). */
  say: Say;
  /** Opens the address of a form of a plant, so Back and a reload reach it (US-QS-15). */
  open: (kind: FormKind, plantId: string) => void;
};

type Named = { id: string; name: string };

/**
 * What the plants screen calls when a plant's layer asks for an action (US-BES-03, US-BES-04, US-BES-07, US-BES-11,
 * US-LIC-02, US-PHA-03): each opens its flow or writes through its operation (P-03). The result of a write is a toast,
 * so the list keeps its place (DS-54).
 */
export function useListActions(api: string, token: Token, a: ListActions) {
  const { archived, potted, marked, caught, zoned, say, open } = a;
  const place = useWriteAction(token, useInvalidate(COLLECTION_KEY), say);
  const openCatchDate = (e: CatchDateTarget) => {
    caught.setOpen(e);
    open("catch-date", e.id);
  };
  return {
    handlers: {
      onLocate: (specimenId: string, locationId: string, success: string) => {
        void place.run((t) => setSpecimenLocation(api, t, { id: specimenId, locationId }), success);
      },
      onArchive: (e: Named) => {
        archived.setOpen(e);
        open("archive-plant", e.id);
      },
      onRepot: (e: RepotTarget) => {
        potted.setOpen(e);
        open("repot", e.id);
      },
      onMark: (e: MarkTarget) => {
        marked.setOpen(e);
        open("marker", e.id);
      },
      onCatchDate: openCatchDate,
      onLightZone: (e: SpecimenCard) => {
        zoned.setOpen(e);
        open("light-zone", e.id);
      },
      onRestore: (e: Named) => {
        void archived.restore(e);
      },
      onArchivedCatchDate: openCatchDate,
    },
  };
}
