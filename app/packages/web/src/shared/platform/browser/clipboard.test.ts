// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

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
