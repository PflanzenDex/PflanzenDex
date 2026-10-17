// What is derived from the keeper's own records on every request, nothing stored (P-01): the need (US-EQU-07), the costs (US-EQU-09) and the recommendations (US-EQU-10).
export { equipmentNeeds } from "./needs";
export type { Need, NeedKind, NeedsDependencies } from "./needs";
export { equipmentCosts } from "./costs";
export type { CostLine, CostView } from "./costs";
export { equipmentRecommendations } from "./recommendations";
export type { ProductEntry, ProductPrice, Recommendation } from "./recommendations";
