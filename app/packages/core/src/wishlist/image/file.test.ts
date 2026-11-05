import { describe, expect, it } from "vitest";
import { appError, failed, ok } from "../../kernel";
import { InMemoryWishes } from "../test-helpers";
import { wishImageFile } from "./file";

const ANNA = "anna";
const BEN = "ben";
const W1 = "00000000-0000-4000-8000-000000000001";
const W2 = "00000000-0000-4000-8000-000000000002";

const setup = () => {
  const wishes = new InMemoryWishes({});
  wishes.seed(ANNA, { id: W1, name: "Mit Bild", imageObject: "img-1.webp" });
  wishes.seed(ANNA, { id: W2, name: "Ohne Bild" });
  /** Every read the operation asks the image port for: the name and the size (NFR-12). */
  const reads: [string, string][] = [];
  const images = {
    read: async (accountId: string, name: string, size: "full" | "thumb") => {
      reads.push([name, size]);
      return accountId === ANNA && name === "img-1.webp"
        ? ok({ bytes: new Uint8Array([9]), contentType: "image/webp" })
        : failed(appError("media.not_found"));
    },
  };
  const read = (userId: string, id: string, ...sizes: string[]) =>
    wishImageFile({ wishes, images }, userId, id, sizes);
  return { read, reads };
};

describe("US-WUN-04 the stored wish image is private to its owner (P-05)", () => {
  it("US-WUN-04 the owner gets the stored copy", async () => {
    const { read } = setup();
    const r = await read(ANNA, W1);
    expect(r.ok && r.value.contentType).toBe("image/webp");
  });

  it("US-WUN-04 a wish without a stored copy answers wish.image_not_found", async () => {
    const { read } = setup();
    const r = await read(ANNA, W2);
    expect(!r.ok && r.error.code).toBe("wish.image_not_found");
  });

  it("US-WUN-04 another account sees nothing: it looks like an unknown wish (P-04)", async () => {
    const { read } = setup();
    const r = await read(BEN, W1);
    expect(!r.ok && r.error.code).toBe("wish.not_found");
  });
});

describe("NFR-12 US-WUN-04 the wish card reads the thumbnail of the stored wish image", () => {
  it("NFR-12 US-WUN-04 the thumbnail size asks the image port for the thumbnail", async () => {
    const { read, reads } = setup();
    const r = await read(ANNA, W1, "thumb");
    expect(r.ok && r.value.contentType).toBe("image/webp");
    expect(reads).toEqual([["img-1.webp", "thumb"]]);
  });

  it("NFR-12 US-WUN-04 without a size the stored copy is asked for", async () => {
    const { read, reads } = setup();
    await read(ANNA, W1);
    expect(reads).toEqual([["img-1.webp", "full"]]);
  });

  it("NFR-12 US-WUN-04 a size other than thumb, or a repeated size, is input.invalid on the field size, and nothing is read", async () => {
    const { read, reads } = setup();
    for (const sizes of [["big"], ["full"], [""], ["THUMB"], ["thumb", "thumb"]]) {
      const r = await read(ANNA, W1, ...sizes);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(!r.ok && r.error.details).toEqual([{ field: "size", code: "input.invalid" }]);
    }
    expect(reads).toEqual([]);
  });

  it("NFR-12 US-WUN-04 another account or an unknown wish asking for the thumbnail still sees wish.not_found (P-04)", async () => {
    const { read, reads } = setup();
    const foreign = await read(BEN, W1, "thumb");
    const unknown = await read(ANNA, "00000000-0000-4000-8000-0000000000ff", "thumb");
    expect(!foreign.ok && foreign.error.code).toBe("wish.not_found");
    expect(!unknown.ok && unknown.error.code).toBe("wish.not_found");
    expect(reads).toEqual([]);
  });
});
