// Public interface of the `equipment` module (ADR 0003): the page with the equipment list and the form (US-EQU-01).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const EquipmentPage = lazyPage(() =>
  import("./equipment-page/equipment-page").then((m) => ({ default: m.EquipmentPage })),
);
// The skeleton of the equipment mode, the mode's skeleton on "Sammlung" (US-QS-14, issue 1727).
export { EquipmentPageSkeleton } from "./equipment-page/equipment-page.skeleton";
