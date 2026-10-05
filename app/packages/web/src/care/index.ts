// Public interface of the module `care` (ADR 0003): page "Measure" of a specimen.
import { lazyPage } from "@/components/shared/lazy-page";
export const MeasurePage = lazyPage(() =>
  import("./MeasurePage").then((m) => ({ default: m.MeasurePage })),
);
export const CarePhasesPage = lazyPage(() =>
  import("./CarePhasesPage").then((m) => ({ default: m.CarePhasesPage })),
);
export const TreatmentsPage = lazyPage(() =>
  import("./TreatmentsPage").then((m) => ({ default: m.TreatmentsPage })),
);
