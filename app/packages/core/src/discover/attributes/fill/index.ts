// Public interface of the attribute fill (US-ENT-09): fills `taxon_attribute` from the open sources already stored.
export { ATTRIBUTE_FILL_JOB_TYPE, orderAttributeFill, runAttributeFill } from "./fill";
export type { AttributeFillStore } from "./fill";
export { deriveGrowthSize, GROWTH_SIZE_LIMITS_M } from "./derive";
export type { HeightCandidate } from "./derive";
