// Public interface of the module `media` (TE-05, ADR 0003): object store port, image processing port, upload pipeline.
export { MEDIA_LIMITS } from "./types";
export type {
  ObjectStore,
  ImageProcessor,
  ImageSize,
  ImageVariant,
  ProcessedImage,
  StoredObject,
} from "./types";
export { objectKey, putKey, thumbnailName } from "./keys";
export { storeImage } from "./store-image";
export type { StoreImageDependencies, StoredImage } from "./store-image";
/** Pure in-memory fake of the port for tests of this and higher modules. */
export { InMemoryObjectStore } from "./object-store.fake";
export { imageReader, imageStorage } from "./image-storage";
export type { ImageReader, ImageStorage } from "./image-storage";
