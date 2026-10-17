import { describe, expect, it } from "vitest";
import { appError, failed, ok, type Result } from "../../kernel";
import { aiCheckImageSource, type ImageSourceChecker } from "./image-source";
import { InMemoryAiLog } from "../test-helpers";

const now = new Date("2026-10-17T08:00:00Z");
const FILE = "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg";
const seen: (string | null)[] = [];
// The checker is a port; the Commons reading itself is tested with the wish image (US-WUN-04).
const checker = (answer: Result<{ license: string; source: string }>): ImageSourceChecker => ({
  check: async (address) => {
    seen.push(address);
    return answer;
  },
});
const run = (images: ImageSourceChecker, imageUrl: unknown) => {
  const log = new InMemoryAiLog();
  return aiCheckImageSource(
    { images, log },
    { userId: "anna", connectionId: "c1", rights: "read", now, imageUrl },
  ).then((r) => ({ r, log }));
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("US-KI-05 image sources are checked by the server", () => {
  it("US-KI-05 the license and source found by the server are returned as checked, and logged", async () => {
    const { r, log } = await run(checker(ok({ license: "CC BY 4.0", source: FILE })), FILE);
    expect(r.ok && r.value).toEqual({ checked: true, license: "CC BY 4.0", source: FILE });
    expect(log.rows.map((l) => l.operation)).toEqual(["check_image_source"]);
  });

  it("US-KI-05 a refusal of the server keeps its code and is logged too (P-10)", async () => {
    const { r, log } = await run(checker(failed(appError("wish.image_not_found"))), FILE);
    expect(code(r)).toBe("wish.image_not_found");
    expect(log.rows[0]?.effect).toContain("wish.image_not_found");
  });

  it("US-KI-05 anything that is not a short text reaches the check as no address", async () => {
    seen.length = 0;
    await run(checker(failed(appError("wish.image_source_unsupported"))), 42);
    await run(checker(failed(appError("wish.image_source_unsupported"))), "x".repeat(501));
    expect(seen).toEqual([null, null]);
  });
});
