import type { Pool } from "pg";
import type {
  TreatmentSource,
  ProvenanceSource,
  MeasurementSource,
  TargetLocationSource,
  PhaseLocationSource,
  ZoneStockSource,
  ObjectStore,
  ImageProcessor,
} from "@pflanzendex/core";
import type { TokenVerifier } from "./account";
import type { AiAccessOptions } from "./ai";
import type { WishImageSources } from "./wishlist";

export type AppOptions = {
  /** Verifies access tokens of the sign-in service; without it there are no protected routes. */
  reviewer?: TokenVerifier;
  pool?: Pool;
  /** The AI interface for the keeper's AI client (US-KI-07); without it there are no routes for connections. */
  ai?: AiAccessOptions;
  /** Origin of the web app for CORS (the API sets no cookies, sign-in runs via bearer token). */
  webOrigin?: string;
  /** Version of the running build: `git describe --tags --always`, e.g. v0.1.0 or v0.1.0-3-gabc1234 (from the build, not secret). */
  version?: string | undefined;
  /** Short commit hash of the running build (from the build, not secret). */
  commit?: string | undefined;
  /** Forces the registration mode (tests only); without it the setting of the operator decides (US-ACC-05). */
  invitationOnly?: boolean;
  /** The clock for "today" (NFR-08); defaults to system time. */
  clock?: () => Date;
  /** Replaces the care profile as source of the target location of new specimens (tests). */
  targetLocation?: TargetLocationSource;
  /** Measurements and treatments for the specimen cards (US-BES-06); without it `care` supplies the measurements (WAC-01) and the planned treatments (BEH-01). */
  measurements?: MeasurementSource;
  treatments?: TreatmentSource;
  /** From whom received specimens came (US-SOZ-13); without it `swap` supplies it. */
  provenance?: ProvenanceSource;
  /** Object store and image processing for measurement photos (US-WAC-06); without them uploading a photo answers 502. */
  media?: { store: ObjectStore; processor: ImageProcessor };
  /** Source client and downloader for the local copy of wish images (US-WUN-04); without them storing an image answers 502. */
  wishImage?: WishImageSources;
  /** Replaces the care profile as source of the location per phase (tests); without it the keeper's own care profile (US-BES-09) answers. */
  phaseLocation?: PhaseLocationSource;
  /** Replaces the light distribution as source of the stock per zone for the wishlist (tests); without it `collection` answers (US-LIC-02). */
  zoneStock?: ZoneStockSource;
};
