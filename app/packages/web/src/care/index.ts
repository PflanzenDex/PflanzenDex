// Public interface of the module `care` (ADR 0003): page "Measure" of a specimen.
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
