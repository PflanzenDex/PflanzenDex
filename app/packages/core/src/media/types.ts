import type { Result } from "../kernel";

// Port and value types for photo storage and image processing (TE-05, FR-WAC-09, QG-D3). `core` only describes them:
// the S3 adapter and the image library live in the API (AB-1). Numbers marked "assumption" are starting values.

export const MEDIA_LIMITS = {
  /** Long side of a stored image in px, JPEG quality: set by US-WAC-06. */
  maxEdgePx: 1600,
  jpegQuality: 82,
  /** Largest accepted upload in bytes (assumption: a current phone photo is 2 to 8 MB). */
  uploadMaxBytes: 15 * 1024 * 1024,
  /** Largest processed object the store accepts (assumption: 1600 px at quality 82 stays well below 1 MB). */
  storedMaxBytes: 5 * 1024 * 1024,
  /** Decoder guard against decompression bombs, in pixels (assumption: above any phone camera of today). */
  inputMaxPixels: 50_000_000,
  /** Upload types the processor reads; everything stored is JPEG. */
  uploadTypes: ["image/jpeg", "image/png", "image/webp"],
  storedType: "image/jpeg",
  /** Object name below the account prefix: no slash, no dots except the extension. */
  namePattern: /^[a-z0-9][a-z0-9-]{0,63}\.jpg$/,
} as const;

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Port of the object store. Every call names the account: adapters derive the key from `objectKey` only, so one
 * account can never address another's object (P-04, QG-D3). `get` of an unknown or foreign object is `media.not_found`;
 * `delete` of a missing object succeeds. Contract test: `object-store.contract.test.ts`.
 */
export interface ObjectStore {
  put(
    accountId: string,
    name: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Result<void>>;
  get(accountId: string, name: string): Promise<Result<StoredObject>>;
  delete(accountId: string, name: string): Promise<Result<void>>;
  exists(accountId: string, name: string): Promise<Result<boolean>>;
}

/** An image after processing: JPEG, rotated upright, shrunk, free of EXIF/GPS and all other metadata. */
export interface ProcessedImage {
  readonly bytes: Uint8Array;
  readonly contentType: typeof MEDIA_LIMITS.storedType;
  readonly width: number;
  readonly height: number;
}

/** Port of the processing stage. Unreadable input is `media.not_an_image`. */
export interface ImageProcessor {
  process(input: Uint8Array): Promise<Result<ProcessedImage>>;
}
