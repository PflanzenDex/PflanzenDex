import { appError, type ObjectStore } from "@pflanzendex/core";

/** Used when no object store is configured: photos then can be neither read nor removed, and export and deletion say so instead of skipping them (P-10). */
export const NO_STORE: ObjectStore = {
  put: async () => ({ ok: false, error: appError("media.storage_unavailable") }),
  get: async () => ({ ok: false, error: appError("media.storage_unavailable") }),
  delete: async () => ({ ok: false, error: appError("media.storage_unavailable") }),
  exists: async () => ({ ok: false, error: appError("media.storage_unavailable") }),
  deleteAll: async () => ({ ok: false, error: appError("media.storage_unavailable") }),
};
