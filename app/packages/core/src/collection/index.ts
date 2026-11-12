// Public interface of the `collection` module (ADR 0003): specimens (US-BES-02).
export { specimenCreate, specimenCorrectCatchDate } from "./specimen/create";
export { specimenCreateSchema, specimenCorrectCatchDateSchema } from "./specimen/create";
export type { CreateDependencies, CatchDateDependencies } from "./specimen/create";
export { specimenMark, specimenMarkSchema } from "./specimen/mark";
export type { MarkDependencies } from "./specimen/mark";
// The private notes of a specimen (US-BES-18): set or clear them, and the keeper's own read of them.
export { specimenSetNotes, specimenNotes } from "./notes/notes";
export type { NotesDependencies } from "./notes/notes";
// The repot of a specimen and its history (US-BES-04, US-BES-19): the operation, the observations and the plan.
export {
  REPOT_PLANNER_KEEPER_SWITCH,
  REPOT_SIGNS,
  GENERAL_STARTING_VALUE,
  REPOT_INTERVAL_STARTING_MONTHS,
  orderFreePots,
  repotPlan,
  specimenRepot,
  specimenTickRepotSign,
  specimenUntickRepotSign,
  wholeMonthsBetween,
} from "./specimen/repot";
export type {
  IntervalHint,
  OpenSign,
  PlanPhase,
  PlanPot,
  RepotDependencies,
  RepotHint,
  RepotPlan,
  RepotPlanInput,
  RepotSign,
  RepotStore,
  SignDependencies,
  SignHint,
  SignRefusal,
} from "./specimen/repot";
export {
  specimenSetLocation,
  specimenSetLightZone,
  LOCATE_ERROR,
  LIGHT_ZONE_ERROR,
} from "./placement/locate";
export { specimenSetLocationSchema, specimenSetLightZoneSchema } from "./placement/locate";
export type { LocateDependencies } from "./placement/locate";
export { cuttingLight } from "./placement/cutting-light";
export type { ZoneSource } from "./placement/effective-zone";
export { careProfileUpdate } from "./care-profile/care-profile";
export type { CareProfileDependencies } from "./care-profile/care-profile";
export { careProfileView } from "./profile-views/care-profile-view";
export type {
  CareProfileEntry,
  CareProfileViewDependencies,
  MergedSpeciesSource,
} from "./profile-views/care-profile-view";
export { careProfileZoneUsage } from "./profile-views/care-profile-zone-usage";
export type { ZoneUsageDependencies } from "./profile-views/care-profile-zone-usage";
export { effectiveProfile, effectiveDormancy } from "./care-profile/effective-profile";
export type {
  Dormancy,
  EffectiveInput,
  EffectiveProfile,
  Layered,
  ValueSource,
} from "./care-profile/effective-profile";
export { CARE_PROFILE_LIMITS, OVERRIDABLE_FIELDS } from "./care-profile/care-profile-types";
export type {
  CareProfile,
  CareProfileChanges,
  CareProfileReader,
  CareProfileStore,
  OverridableField,
} from "./care-profile/care-profile-types";
export { specimenArchive, specimenRestore, specimenRestoreSchema } from "./specimen/archive";
export type { ArchiveDependencies } from "./specimen/archive";
export { specimenArchived } from "./specimen/archived";
export type { ArchivedDependencies, ArchivedEntry } from "./specimen/archived";
export { specimenLoad, specimenList } from "./shared/read";
export { speciesDisplayName, specimenName } from "./shared/name";
export { planMarkers } from "./shared/markers";
export { NO_TARGET_LOCATION } from "./placement/target-location";
export {
  NO_TREATMENTS,
  NO_MEASUREMENTS,
  NO_PROVENANCE,
  NO_MEASURED,
  specimenCards,
  cardsOf,
  dueDate,
} from "./cards/cards";
export type { CardsDependencies } from "./cards/cards";
export {
  CARD_PAGE_MAX,
  CARD_PAGE_SIZE,
  decodeCardCursor,
  encodeCardCursor,
  parseCardPageQuery,
  specimenCardOf,
  specimenCardPage,
  specimenSummary,
  specimenTreatable,
} from "./cards/cards-page";
export type {
  CardPageDependencies,
  CardPageField,
  CardPageParams,
  CardPageParse,
} from "./cards/cards-page";
export { zoneDistribution } from "./distribution/distribution";
export { lightOverview } from "./distribution/light-overview";
export type { LightOverview, LightOverviewRow } from "./distribution/light-overview";
export { difficultyOverview } from "./distribution/difficulty-overview";
export type {
  DifficultyDependencies,
  DifficultyOverview,
  DifficultyRow,
} from "./distribution/difficulty-overview";
export { specimenHints } from "./cards/specimen-hints";
export type { HintsDependencies, SpecimenHint } from "./cards/specimen-hints";
export type {
  NotCounted,
  Distribution,
  DistributionDependencies,
  DistributionHint,
  ZoneCount,
} from "./distribution/distribution-types";
export { MEASUREMENT_QUALITIES } from "./cards/cards-types";
export type {
  TreatmentSource,
  SpecimenCard,
  DueDate,
  LastMeasurement,
  MeasurementQuality,
  CardMeasurementView,
  MeasurementSource,
  OpenTreatment,
  SpecimenProvenance,
  ProvenanceSource,
  MeasuredSource,
  CardCursor,
  CardPage,
  CardPageQuery,
  LocationGroup,
  SpecimenCountRows,
  SpecimenPage,
  SpecimenPageSource,
  SpecimenSummary,
  TreatableRow,
  TreatableSpecimen,
} from "./cards/cards-types";
export {
  ARCHIVED_REASONS,
  CREATE_STATUS,
  SPECIMEN_LIMITS,
  SPECIMEN_STATUS,
  isActive,
} from "./shared/types";
export type {
  CatchDateStore,
  CreateStatus,
  SpeciesSource,
  Specimen,
  MarkerAssignment,
  LocationAssignment,
  SpecimenStore,
  SpecimenStatus,
  SpecimenValues,
  SpecimenRow,
  TargetLocationSource,
} from "./shared/types";
export type { NotesStore, SpecimenNotes } from "./notes/types";
// The CSV import of plants (US-BES-18, FR-BES-26): the preview reads, the confirmation writes once.
export {
  CSV_IMPORT_KEEPER_SWITCH,
  IMPORT_CANDIDATES,
  IMPORT_LIMITS,
  parseImportCsv,
  specimenImport,
  specimenImportPreview,
} from "./bulk";
export type {
  ConfirmDependencies,
  ConfirmInput,
  ConfirmResult,
  ConfirmRow,
  Created,
  ImportDate,
  ImportOverride,
  ImportPreview,
  ImportSpeciesSource,
  LocationMatch,
  MarkerRequest,
  ParsedRow,
  PreviewDependencies,
  PreviewRow,
  Reason,
  RowState,
  SpeciesCandidate,
} from "./bulk";
