import { describe, expect, it } from "vitest";
import { appError, failed, ok, type SourceClient } from "../../kernel";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { InMemoryWishes } from "../test-helpers";
import { wishStoreImage } from "./store-image";

const ANNA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const W1 = "00000000-0000-4000-8000-000000000001";
const FILE = "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg";
const UPLOAD = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg";

const answer = (license = "CC BY-SA 4.0") => ({
  query: {
    pages: {
      "1": {
        imageinfo: [
          {
            url: UPLOAD,
            descriptionurl: FILE,
            extmetadata: {
              LicenseShortName: { value: license },
              Artist: { value: "Anna Beispiel" },
            },
          },
        ],
      },
    },
  },
});

function setup(
  over: {
    imageUrl?: string | null;
    data?: unknown;
    notFound?: boolean;
    sourceError?: boolean;
    downloadError?: boolean;
    putError?: boolean;
    objectName?: string | null;
  } = {},
) {
  const wishes = new InMemoryWishes({ [ANNA]: [] });
  wishes.seed(ANNA, {
    id: W1,
    name: "Monstera deliciosa",
    imageUrl: over.imageUrl === undefined ? FILE : over.imageUrl,
    imageSource: over.imageUrl === null ? null : "Wikipedia",
    imageObject: over.objectName ?? null,
  });
  const calls = {
    source: 0,
    download: [] as string[],
    put: [] as string[],
    removed: [] as string[],
  };
  const sources: SourceClient = {
    get: async (request) => {
      calls.source += 1;
      if (over.sourceError) return failed(appError("source.unavailable"));
      const provenance = { source: request.source, url: "u", retrievedAt: "2026-10-09T10:00:00Z" };
      return ok(
        over.notFound
          ? { kind: "not_found" as const, provenance, cached: false }
          : { kind: "found" as const, data: over.data ?? answer(), provenance, cached: false },
      );
    },
  };
  const download = {
    get: async (url: string) => {
      calls.download.push(url);
      return over.downloadError
        ? failed(appError("source.unavailable"))
        : ok({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
    },
  };
  const storage = {
    put: async (_account: string, name: string) => {
      calls.put.push(name);
      return over.putError ? failed(appError("media.not_an_image")) : ok({ width: 10, height: 8 });
    },
    remove: async (_account: string, name: string) => {
      calls.removed.push(name);
      return ok(undefined);
    },
  };
  let n = 0;
  const idem = new InMemoryIdempotencyStore();
  const run = (userId = ANNA, wishId = W1) =>
    execute(
      wishStoreImage({ wishes, sources, download, storage, newName: () => "img-1" }),
      { idempotency: idem },
      { context: { userId }, input: { wishId }, idempotencyKey: `k${++n}` },
    );
  return { wishes, calls, run };
}

describe("US-WUN-04 store the image of a wish locally, with source and license", () => {
  it("downloads the Commons original, stores the processed copy and records source and license", async () => {
    const { run, wishes, calls } = setup();
    const r = await run();
    expect(r.ok).toBe(true);
    expect(calls.download).toEqual([UPLOAD]);
    expect(calls.put).toEqual(["img-1.jpg"]);
    expect(wishes.rows[0]).toMatchObject({
      imageObject: "img-1.jpg",
      license: "CC BY-SA 4.0",
      imageSource: `Anna Beispiel, ${FILE}`,
    });
    expect(r.ok && r.value).toMatchObject({ changed: true, wish: { imageObject: "img-1.jpg" } });
  });

  it("a wish without an image address or with a foreign host is refused and nothing is fetched (no hotlink, no SSRF)", async () => {
    for (const imageUrl of [
      null,
      "https://example.com/a.jpg",
      "http://commons.wikimedia.org/wiki/File:A.jpg",
    ]) {
      const { run, calls } = setup({ imageUrl });
      const r = await run();
      expect(!r.ok && r.error.code).toBe("wish.image_source_unsupported");
      expect(calls.source + calls.download.length + calls.put.length).toBe(0);
    }
  });

  it("an image Commons does not know is wish.image_not_found, nothing is stored", async () => {
    const { run, calls } = setup({ notFound: true });
    const r = await run();
    expect(!r.ok && r.error.code).toBe("wish.image_not_found");
    expect(calls.put).toEqual([]);
  });

  it("a license that does not allow storing is refused before the image is downloaded", async () => {
    const { run, calls } = setup({ data: answer("CC BY-NC 4.0") });
    const r = await run();
    expect(!r.ok && r.error.code).toBe("wish.image_license_unsupported");
    expect(calls.download).toEqual([]);
  });

  it("an unreachable source or download fails with its own code and leaves the wish unchanged (P-10)", async () => {
    for (const over of [{ sourceError: true }, { downloadError: true }]) {
      const { run, wishes } = setup(over);
      const r = await run();
      expect(!r.ok && r.error.code).toBe("source.unavailable");
      expect(wishes.rows[0]?.imageObject).toBeNull();
    }
  });

  it("a file the media pipeline refuses is stored nowhere and the wish stays unchanged", async () => {
    const { run, wishes } = setup({ putError: true });
    const r = await run();
    expect(!r.ok && r.error.code).toBe("media.not_an_image");
    expect(wishes.rows[0]?.imageObject).toBeNull();
  });

  it("an image that is stored already is kept: nothing is fetched or written again", async () => {
    const { run, calls } = setup({ objectName: "old.jpg" });
    const r = await run();
    expect(r.ok && r.value.changed).toBe(false);
    expect(calls.source + calls.download.length + calls.put.length).toBe(0);
  });

  it("a wish of another account looks unknown (P-04)", async () => {
    const { run, calls } = setup();
    const r = await run(BEN);
    expect(!r.ok && r.error.code).toBe("wish.not_found");
    expect(calls.source).toBe(0);
  });
});
