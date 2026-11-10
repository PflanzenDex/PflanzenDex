// Public interface of the module `care` (ADR 0003): page "Measure" of a specimen, and the parts of the plant layer (US-QS-23).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
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
/** The tab "Verlauf" of a plant: the measurements, and the leaf log behind the switch "Messungen | Blätter" (US-WAC-07). */
export const PlantCourse = lazyPage(() =>
  import("./plant-course/plant-course").then((m) => ({ default: m.PlantCourse })),
);
export const PlantCare = lazyPage(() =>
  import("./plant-detail/plant-care/plant-care").then((m) => ({ default: m.PlantCare })),
);
// The skeleton of the open treatments in the shape of two entries, the layer's skeleton on "Heute" (US-QS-14, issue 1697).
export { OpenTreatmentsSkeleton } from "./treatments/open-treatments/open-treatments.skeleton";
// The skeleton of the care phases, the mode's skeleton of "Sammlung" grouped by phase (US-QS-14, issue 1727).
export { CarePhasesSkeleton } from "./phases/care-phases-page/care-phases-page.skeleton";
// The open treatments as a count, the same request and key as the layer: the app icon's number (US-QS-29).
export { useOpenCount } from "./shared/api/open-count/open-count";
