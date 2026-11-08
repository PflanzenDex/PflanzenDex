import type { ArchivedEntry } from "@pflanzendex/core";
import type { useArchive } from "../../../../specimens/hooks/use-archive";
import type { useRepot } from "../../../../specimens/hooks/use-repot";
import type { useMarker } from "../../../../markers/marker/use-marker";
import type { useCatchDate } from "../../../../markers/catch-date/catch-date-field/catch-date-field";
import type { useLightZone } from "../../../../markers/locate/light-zone-form/light-zone-form";
import type { FormAddress, FormPlant } from "../address/form-address";
import { useAddressedForm } from "./use-addressed-form";

/** The hooks of the forms that keep their own state; the address follows each of them (US-QS-15). */
export type FormHooks = {
  archived: ReturnType<typeof useArchive>;
  potted: ReturnType<typeof useRepot>;
  marked: ReturnType<typeof useMarker>;
  caught: ReturnType<typeof useCatchDate>;
  zoned: ReturnType<typeof useLightZone>;
};

/**
 * Keeps each form of a plant in step with the address: the plant of the address is the target of the form (a reload
 * reads it first), and an archived plant gives its catch date from the archive (the card is not read for it).
 */
export function useFormMirrors(p: {
  form: FormAddress;
  plant: FormPlant | undefined;
  archivedEntry: ArchivedEntry | undefined;
  hooks: FormHooks;
}): void {
  const { form, plant, archivedEntry, hooks } = p;
  const { archived, potted, marked, caught, zoned } = hooks;
  const card = plant?.card;
  const failed = plant?.failed ?? false;
  useAddressedForm({
    kind: "marker",
    form,
    open: marked.open,
    setOpen: marked.setOpen,
    failed,
    target: card
      ? { id: card.id, name: card.name, marker: card.marker, speciesName: card.speciesName }
      : undefined,
  });
  useAddressedForm({
    kind: "catch-date",
    form,
    open: caught.open,
    setOpen: caught.setOpen,
    failed,
    target: card
      ? { id: card.id, name: card.name, caughtAt: card.caughtAt }
      : archivedEntry
        ? { id: archivedEntry.id, name: archivedEntry.name, caughtAt: archivedEntry.caughtAt }
        : undefined,
  });
  useAddressedForm({
    kind: "archive-plant",
    form,
    open: archived.open,
    setOpen: archived.setOpen,
    failed,
    target: card ? { id: card.id, name: card.name } : undefined,
  });
  useAddressedForm({
    kind: "repot",
    form,
    open: potted.open,
    setOpen: potted.setOpen,
    failed,
    target: card ? { id: card.id, name: card.name, status: card.status } : undefined,
  });
  useAddressedForm({
    kind: "light-zone",
    form,
    open: zoned.open,
    setOpen: zoned.setOpen,
    failed,
    target: card,
  });
}
