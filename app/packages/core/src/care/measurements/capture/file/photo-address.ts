// The private address of a measurement photo (US-WAC-05, NFR-12). Pure: the server and the web build every address of a
// photo through these helpers, so the version is never left out.

/**
 * The version of a stored photo: its object name without the extension. A replacement stores a new object under a new
 * random name (US-WAC-06), so the version changes with every replacement.
 */
export const photoVersion = (photo: string): string => photo.replace(/\.webp$/, "");

/**
 * The private address of a measurement photo: `/specimens/:id/measurements/:measurementId/photo?v=<version>`. A replaced
 * photo has a new address, so neither the browser's HTTP cache nor the picture cache of the web answers the old picture
 * (NFR-12). The read route answers the current photo and ignores `v`.
 */
export function measurementPhotoPath(target: {
  readonly specimenId: string;
  readonly measurementId: string;
  readonly photo: string;
}): string {
  const specimen = encodeURIComponent(target.specimenId);
  const measurement = encodeURIComponent(target.measurementId);
  const version = encodeURIComponent(photoVersion(target.photo));
  return `/specimens/${specimen}/measurements/${measurement}/photo?v=${version}`;
}
