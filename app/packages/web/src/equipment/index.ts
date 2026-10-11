// Public interface of the `equipment` module (ADR 0003): the page with the equipment list and the form (US-EQU-01).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const EquipmentPage = lazyPage(() =>
  import("./equipment-page/equipment-page").then((m) => ({ default: m.EquipmentPage })),
);
