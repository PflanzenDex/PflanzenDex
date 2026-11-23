import { ERROR_TEXTS } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { applyServerError, errorText, GENERIC_ERROR_TEXT, refusalText } from "./error-text";

describe("error-text (US-QS-07 · DS-49, FR-QG-11)", () => {
  it("US-QS-07 · DS-49 maps a known code to its German text from ERROR_TEXTS", () => {
    expect(errorText("access.denied")).toBe(ERROR_TEXTS["access.denied"]);
  });

  it("US-QS-07 · DS-49 shows a generic German text for an unknown code, never raw server text (P-10)", () => {
    expect(errorText("made_up.code")).toBe(GENERIC_ERROR_TEXT);
    expect(errorText(undefined)).toBe(GENERIC_ERROR_TEXT);
    expect(errorText("toString")).toBe(GENERIC_ERROR_TEXT);
    expect(GENERIC_ERROR_TEXT).toMatch(/[Ff]ehler/);
    expect(GENERIC_ERROR_TEXT).not.toContain("Bitte");
  });

  it("US-QS-07 · DS-49 puts a detail code on its field and the main code on the form", () => {
    const setError = vi.fn();
    applyServerError(
      {
        code: "input.invalid",
        text: "raw server text",
        details: [{ field: "displayName", code: "access.denied" }],
      },
      setError,
    );
    expect(setError).toHaveBeenCalledWith("displayName", {
      type: "server",
      message: ERROR_TEXTS["access.denied"],
    });
    expect(setError).toHaveBeenCalledWith("root.server", {
      type: "server",
      message: ERROR_TEXTS["input.invalid"],
    });
  });

  it("US-QS-07 · DS-49 shows only the form-level text when there are no field details", () => {
    const setError = vi.fn();
    applyServerError({ code: "nope.nope", text: "raw" }, setError);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("root.server", {
      type: "server",
      message: GENERIC_ERROR_TEXT,
    });
  });

  it("US-QS-07 · DS-49 refusalText gives the German text of the code, and the own text only of an unreachable server", () => {
    expect(refusalText({ code: "access.denied", text: "raw server text" })).toBe(
      ERROR_TEXTS["access.denied"],
    );
    expect(refusalText({ code: "made_up.code", text: "raw server text" })).toBe(GENERIC_ERROR_TEXT);
    expect(refusalText({ code: "network.not_reachable", text: "Keine Verbindung." })).toBe(
      "Keine Verbindung.",
    );
  });

  it("US-QS-03 a key conflict that the repeat guard described shows its text, which names what is saved", () => {
    expect(
      refusalText({
        code: "idempotency.key_conflict",
        text: "raw server text",
        conflictText:
          "Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.",
      }),
    ).toBe("Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.");
  });

  it("US-QS-03 a key conflict without a description says the first entry is saved, and names no key (P-10)", () => {
    const text = refusalText({ code: "idempotency.key_conflict", text: "raw server text" });
    expect(text).toBe(
      "Deine erste Eingabe ist gesichert. Deine Änderung ist noch nicht gesichert.",
    );
    expect(text).not.toMatch(/Schlüssel|vielleicht/);
  });
});
