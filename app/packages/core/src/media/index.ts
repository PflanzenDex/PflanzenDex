// Public interface of the module `media` (TE-05, ADR 0003): object store port, image processing port, upload pipeline.
export { MEDIA_LIMITS } from "./types";
export type { ObjectStore, ImageProcessor, ProcessedImage, StoredObject } from "./types";
export { objectKey, putKey } from "./keys";
export { storeImage } from "./store-image";
export type { StoreImageDependencies, StoredImage } from "./store-image";
/** Pure in-memory fake of the port for tests of this and higher modules. */
export { InMemoryObjectStore } from "./object-store.fake";
