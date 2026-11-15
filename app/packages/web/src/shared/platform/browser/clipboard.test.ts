// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, shareText } from "./clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "share");
});

describe("US-KI-07 clipboard adapter", () => {
  it("US-KI-07 copies the text and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("https://x/mcp")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x/mcp");
  });

  it("US-KI-07 reports false when the browser refuses or has no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyText("x")).toBe(false);
  });
});

/** Gives the test a Web Share API of its own (jsdom has none); the afterEach removes it again. */
const withShare = (share: () => Promise<void>) =>
  Object.defineProperty(navigator, "share", { configurable: true, value: share });

describe("US-ACC-05 share adapter (US-QS-32 share or copy)", () => {
  it("US-ACC-05 shares only the text and reports shared", async () => {
    const share = vi.fn(async () => undefined);
    withShare(share);
    expect(await shareText("ABCD-EFGH-JKMN")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "ABCD-EFGH-JKMN" });
  });

  it("US-ACC-05 a share sheet the keeper closes (AbortError) is cancelled, not a failure", async () => {
    withShare(async () => {
      throw Object.assign(new Error("closed"), { name: "AbortError" });
    });
    expect(await shareText("x")).toBe("cancelled");
  });

  it("US-ACC-05 any other refusal of the share sheet is failed", async () => {
    withShare(async () => {
      throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
    });
    expect(await shareText("x")).toBe("failed");
  });

  it("US-ACC-05 without the Web Share API the result is unsupported and nothing is sent", async () => {
    expect(await shareText("x")).toBe("unsupported");
  });
});
