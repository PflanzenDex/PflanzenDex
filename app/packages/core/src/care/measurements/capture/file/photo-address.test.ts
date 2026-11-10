import { describe, expect, it } from "vitest";
import { measurementPhotoPath, photoVersion } from "./photo-address";

const SPECIMEN = "00000000-0000-4000-8000-000000000001";
const MEASUREMENT = "00000000-0000-4000-8000-0000000000aa";

describe("NFR-12 US-WAC-06 the photo address carries the version of the stored object", () => {
  it("NFR-12 the version is the object name without its extension", () => {
    expect(photoVersion("2f1c9a.webp")).toBe("2f1c9a");
    expect(photoVersion("no-extension")).toBe("no-extension");
  });

  it("NFR-12 US-WAC-06 a replaced photo gets a new address: the version follows the stored object", () => {
    const first = measurementPhotoPath({
      specimenId: SPECIMEN,
      measurementId: MEASUREMENT,
      photo: "first.webp",
    });
    const second = measurementPhotoPath({
      specimenId: SPECIMEN,
      measurementId: MEASUREMENT,
      photo: "second.webp",
    });
    expect(first).toBe(`/specimens/${SPECIMEN}/measurements/${MEASUREMENT}/photo?v=first`);
    expect(second).toBe(`/specimens/${SPECIMEN}/measurements/${MEASUREMENT}/photo?v=second`);
  });
});
