import type {
  TreatmentSource,
  CardMeasurementView,
  MeasurementSource,
  OpenTreatment,
} from "./cards-types";

type Call = { userId: string; ids: readonly string[] };
const selection = <T>(data: Readonly<Record<string, T>>, ids: readonly string[]) =>
  new Map(ids.flatMap((id) => (data[id] ? [[id, data[id]] as const] : [])));

/** Measurements stub (tests only): remembers whom the port was asked about. */
export class MeasurementsStub implements MeasurementSource {
  readonly calls: Call[] = [];
  constructor(private readonly data: Readonly<Record<string, CardMeasurementView>>) {}

  async forSpecimens(userId: string, ids: readonly string[]) {
    this.calls.push({ userId, ids });
    return selection(this.data, ids);
  }
}

/** Treatments stub (tests only): remembers whom the port was asked about. */
export class TreatmentStub implements TreatmentSource {
  readonly calls: Call[] = [];
  constructor(private readonly data: Readonly<Record<string, readonly OpenTreatment[]>>) {}

  async open(userId: string, ids: readonly string[]) {
    this.calls.push({ userId, ids });
    return selection(this.data, ids);
  }
}
