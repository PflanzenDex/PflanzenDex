import { describe, expect, it } from "vitest";
import { labelAddress, qrModules } from "./label-code";

describe("US-BES-17 a label holds only the address of its plant", () => {
  it("US-BES-17 the address is the app's label address with the opaque specimen id and nothing else (FR-BES-25)", () => {
    expect(labelAddress("https://pflanzen.example", "0f8b-42")).toBe(
      "https://pflanzen.example/label/0f8b-42",
    );
  });

  it("US-BES-17 the QR matrix is a square with its quiet zone (medium error correction)", () => {
    const modules = qrModules("https://pflanzen.example/label/0f8b-42");
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.every((row) => row.length === modules.length)).toBe(true);
    // The quiet zone is light: the outermost row is never dark.
    expect(modules[0]?.some(Boolean)).toBe(false);
  });
});
