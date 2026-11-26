import { useCallback, useEffect, useState } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import type { MeasureStart } from "../../layer-ids";
import { formText, useFormPlant, type FormPlant } from "./form-address";
import { useFormAddress } from "./use-form-address";

type Token = () => Promise<string | undefined>;
type Plant = { id: string; name: string };

/**
 * The plant of the measure view: the one the list handed over (known at once), else the plant the address names, read
 * first on a reload. Nothing while it loads.
 */
function measureTarget(
  open: boolean,
  plantId: string | null,
  picked: Plant | null,
  card: SpecimenCard | undefined,
): Plant | null {
  if (!open || plantId === null) return null;
  if (picked?.id === plantId) return picked;
  return card ? { id: card.id, name: card.name } : null;
}

/**
 * The forms of the plants of the area (US-QS-15): the address, the plant the address names and the measure view. A plant
 * that is not there closes its view with a notice (P-10), never with a blank page.
 */
export function usePlantForm(api: string, token: Token, enabled: boolean) {
  const form = useFormAddress(enabled);
  const { leave } = form;
  const plant = useFormPlant(api, token, form.plantId);
  const [picked, setPicked] = useState<Plant | null>(null);
  const measureOpen = form.kind === "measure";
  const measure = measureTarget(measureOpen, form.plantId, picked, plant.card);
  const missing = measureOpen && measure === null && plant.failed;
  useEffect(() => {
    if (missing) leave(formText("notFound"), true);
  }, [missing, leave]);
  // "Foto" of the quick actions opens the same form with the photo picker started (US-QS-15, issue 2424): the form takes it once.
  const [photo, setPhoto] = useState(false);
  const openMeasure = (m: Plant, start?: MeasureStart) => {
    setPicked(m);
    setPhoto(start?.photo === true);
    form.open("measure", m.id);
  };
  const photoStarted = useCallback(() => setPhoto(false), []);
  const formPlant: FormPlant = { card: plant.card, failed: plant.failed };
  return {
    form,
    formPlant,
    measure,
    measureOpen,
    openMeasure,
    measureStart: { photo, started: photoStarted },
    leaveMeasure: form.requestLeave,
    measureSaved: form.settle,
  };
}
