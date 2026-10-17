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
  wishes.seed(ANNA, { id: W1, name: "Mit Bild", imageObject: "img-1.jpg" });
  wishes.seed(ANNA, { id: W2, name: "Ohne Bild" });
  const objects = {
    get: async (account: string, name: string) =>
      account === ANNA && name === "img-1.jpg"
        ? ok({ bytes: new Uint8Array([9]), contentType: "image/jpeg" })
        : failed(appError("media.not_found")),
  };
  return (userId: string, id: string) => wishImageFile({ wishes, objects }, userId, id);
};

describe("US-WUN-04 the stored wish image is private to its owner (P-05)", () => {
  it("the owner gets the stored copy", async () => {
    const r = await setup()(ANNA, W1);
    expect(r.ok && r.value.contentType).toBe("image/jpeg");
  });

  it("a wish without a stored copy answers wish.image_not_found", async () => {
    const r = await setup()(ANNA, W2);
    expect(!r.ok && r.error.code).toBe("wish.image_not_found");
  });

  it("another account sees nothing: it looks like an unknown wish (P-04)", async () => {
    const r = await setup()(BEN, W1);
    expect(!r.ok && r.error.code).toBe("wish.not_found");
  });
});
