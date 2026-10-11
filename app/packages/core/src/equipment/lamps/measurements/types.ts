// Measured light intensity per lamp (US-EQU-03, DM-EQU-02). Ports for persistence; adapters live in `db` (AB-1).

export interface LampMeasurement {
  readonly id: string;
  readonly equipmentId: string;
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly measuredOn: string;
  readonly lux: number;
  /** Distance between lamp and sensor; `null` when not noted (unknown, P-08). */
  readonly distanceCm: number | null;
  /** How it was measured, free text (lux meter, phone app); `null` when not noted. */
  readonly method: string | null;
}

export type LampMeasurementValues = Omit<LampMeasurement, "id">;

export interface LampMeasurementStore {
  add(
    userId: string,
    values: LampMeasurementValues,
  ): Promise<LampMeasurement | "not_found" | "not_lamp">;
  /** All measurements of the account, newest first. */
  list(userId: string): Promise<readonly LampMeasurement[]>;
}

/** The account's share (percent) by which a measurement may deviate from the zone ceiling; `null` = not set (open). */
export interface DeviationLimitStore {
  limit(userId: string): Promise<number | null>;
  setLimit(userId: string, percent: number | null): Promise<number | null>;
}
