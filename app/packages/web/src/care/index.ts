// Public interface of the module `care` (ADR 0003): page "Measure" of a specimen, and the parts of the plant layer (US-QS-23).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const MeasurePage = lazyPage(() =>
  import("./measure/measure-page/measure-page").then((m) => ({ default: m.MeasurePage })),
);
export const CarePhasesPage = lazyPage(() =>
  import("./phases/care-phases-page/care-phases-page").then((m) => ({ default: m.CarePhasesPage })),
);
export const TreatmentsPage = lazyPage(() =>
  import("./treatments/treatments-page/treatments-page").then((m) => ({
    default: m.TreatmentsPage,
  })),
);
/** The layer "Behandlung planen" above "Heute" (`?sheet=plan`, US-QS-18); it loads its plants only while open. */
export const PlanLayer = lazyPage(() =>
  import("./treatments/planning/plan-layer/plan-layer").then((m) => ({
    default: m.PlanLayer,
  })),
);
export const PlantGrowth = lazyPage(() =>
  import("./plant-detail/plant-growth/plant-growth").then((m) => ({ default: m.PlantGrowth })),
);
export const PlantHistory = lazyPage(() =>
  import("./plant-detail/plant-history/plant-history").then((m) => ({ default: m.PlantHistory })),
);
export const PlantCare = lazyPage(() =>
  import("./plant-detail/plant-care/plant-care").then((m) => ({ default: m.PlantCare })),
);
