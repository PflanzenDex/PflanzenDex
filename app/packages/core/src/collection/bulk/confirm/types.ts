// The shapes of the confirmation of an import (US-BES-18): the rows it writes, its result and its dependencies.
import type { ErrorCode } from "../../../kernel";
import type { LightLocationStore } from "../../../light";
import type { MarkerAnswer } from "../../shared/markers";
import type { CreateDependencies } from "../../specimen/create";

/** One row to write: the species and the values the keeper confirmed (a location as an ID or as a new name). */
export interface ConfirmRow {
  readonly line: number;
  readonly speciesId: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly newLocation: string | null;
  readonly catchDate: string | null;
  readonly notes: string | null;
}

export interface Created {
  readonly line: number;
  readonly id: string;
  readonly name: string;
}

/** What the import did (P-10): created, skipped (the specimen is there already) and refused, each with the reason's code. */
export interface ConfirmResult {
  readonly created: readonly Created[];
  readonly skipped: readonly { readonly line: number }[];
  readonly refused: readonly { readonly line: number; readonly code: ErrorCode }[];
  readonly locationsCreated: readonly string[];
  /** Answers no row used: the specimens they name keep their missing marker. */
  readonly unusedMarkers: readonly string[];
}

export interface ConfirmDependencies extends CreateDependencies {
  readonly locations: LightLocationStore;
  /** Whether the keeper switched the import off (US-ONB-09, P-12). */
  readonly keeperOff: (userId: string) => Promise<boolean>;
}

/** The input of the confirmation: the time zone decides "today" for every row (NFR-08). */
export interface ConfirmInput {
  readonly timeZone: string;
  readonly rows: readonly ConfirmRow[];
  readonly markers: readonly MarkerAnswer[];
}
