// Query keys of the care module, hierarchical so a write can invalidate a whole branch (DS-09).
export const TREATMENTS = ["care", "treatments"] as const;
export const SPECIMENS_KEY = [...TREATMENTS, "specimens"] as const;
export const OPEN_KEY = [...TREATMENTS, "open"] as const;
export const historyKey = (specimenId: string) => [...TREATMENTS, "history", specimenId] as const;
