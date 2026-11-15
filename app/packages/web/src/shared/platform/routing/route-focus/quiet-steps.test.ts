import { describe, expect, it } from "vitest";
import { quietFrom, takeQuiet } from "./quiet-steps";

describe("US-QS-15 a step that the app takes over is quiet once (issue 2165)", () => {
  it("US-QS-15 the arrival from a listed entry is quiet once: it takes the entry off the list (issue 2165)", () => {
    quietFrom("entry-a");
    expect(takeQuiet("entry-a")).toBe(true);
    expect(takeQuiet("entry-a")).toBe(false);
  });

  it("US-QS-15 an entry that is not listed gives a step with the focus as usual (issue 2165)", () => {
    expect(takeQuiet("entry-b")).toBe(false);
  });
});
