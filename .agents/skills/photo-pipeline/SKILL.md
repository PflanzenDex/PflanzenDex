---
name: photo-pipeline
description: Use when a story stores, changes or reads a photo: upload, EXIF or GPS removal, WebP re-encoding, thumbnail, object name, or a route that takes an image (US-WAC-06, FR-WAC-09, NFR-12, QG-D3).
---

# Photo pipeline

Every stored photo is processed the same way and holds no metadata: the original is never stored (FR-WAC-09, QG-D3). The rules come from US-WAC-06 in `docs/specs/product/05-growth-and-photos.md`: rotate by the EXIF orientation, long side at most 1600 px, stored as WebP at quality 82, a 256 px WebP thumbnail at quality 72 (starting values, assumption), no EXIF, GPS, XMP, IPTC or ICC data. The numbers are `MEDIA_LIMITS` in `app/packages/core/src/media/types.ts`; change one there only together with its spec value.

1. Use the pipeline, do not build a second one. Core `storeImage` (`app/packages/core/src/media/store-image.ts`) checks name, size and type, runs the processor, writes the copy and its thumbnail, and removes the copy again when the thumbnail write fails. `thumbnailName` (`app/packages/core/src/media/keys.ts`) derives the thumbnail's name.
2. Core has no I/O (AB-1). The image library is used for processing only in `app/packages/api/src/media/sharp-processor.ts` (`createSharpProcessor`), and the bucket only in `app/packages/api/src/media/s3-store.ts`. Tests and the demo seed import `sharp` to build sample images; production code must not.
3. Object names: `objectKey` (`app/packages/core/src/media/keys.ts`) puts every object under the account's prefix (P-04). The name is `[a-z0-9-]` plus `.webp`, enforced by `namePattern` in `MEDIA_LIMITS`. Never take a name from the client.
4. Routes that take images so far: a measurement photo, `POST /specimens/:id/measurements/photo` (`app/packages/api/src/care/care-routes.ts`, operation `measurement.photo` in `app/packages/core/src/care/measurements/capture/photo.ts`), and a wish image, `POST /wishes/:id/image` (`app/packages/api/src/wishlist/wishlist-routes.ts`, Wikimedia Commons addresses only). A new route follows the same pattern and takes an `Idempotency-Key`.
5. Storage configuration: the `S3_*` variables (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, read in `s3-store.ts`). Without them the photo routes answer 502 `media.storage_unavailable`; do not invent a local fallback.
6. Tests with real bytes: `app/packages/api/src/media/sharp-processor.contract.test.ts` builds a JPEG with GPS EXIF and proves the stored WebP has no EXIF, XMP or ICC chunk and no "TestCam" text; it proves the orientation is applied and dropped, the qualities 82 and 72 byte for byte (quality 80 must give other bytes), and the refusals `media.not_an_image` and `media.too_large`. A new input type or rule gets its case there, named with the story ID.
7. Route tests: `app/packages/api/src/photo-upload.test.ts` covers the measurement of the same day, the 409 `measurement.photo_exists` without `replace=true`, the 404 without a measurement, the tenant boundary and that only the owner reads the photo back.
8. Changing a quality or a size: change the constant and the spec value in the same PR. The contract test compares `MEDIA_LIMITS` with the literal numbers 82 and 72, so a silent change fails it.

## Check

```bash
make test
```

Expected: `sharp-processor.contract.test.ts` (the "QG-D3 NFR-12" and "US-WAC-06" cases) and `photo-upload.test.ts` pass. The route tests need Docker; without it they run only in CI (`make ci`).
