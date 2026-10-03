import { describe, expect, it } from "vitest";
import { darfMitFreundenTeilen, kontoAusAnspruechen } from "./index";

describe("Kontodaten aus den Ansprüchen des Anmeldedienstes (US-ACC-01)", () => {
  it("übernimmt Subjekt, E-Mail, Anzeigename und Bestätigung", () => {
    const k = kontoAusAnspruechen({
      sub: "abc",
      email: "Lena@Example.test",
      name: "Lena",
      email_verified: true,
    });
    expect(k).toEqual({
      subjekt: "abc",
      email: "lena@example.test",
      anzeigename: "Lena",
      emailBestaetigt: true,
    });
  });

  it("ohne Bestätigungsangabe gilt die E-Mail als unbestätigt (sicherer Ausgang)", () => {
    const k = kontoAusAnspruechen({ sub: "abc", email: "a@example.test" });
    expect(k?.emailBestaetigt).toBe(false);
    expect(k?.anzeigename).toBeNull();
  });

  it("nur der Wert true bestätigt, Zeichenketten nicht", () => {
    const k = kontoAusAnspruechen({ sub: "a", email: "a@b.test", email_verified: "true" });
    expect(k?.emailBestaetigt).toBe(false);
  });

  it("ohne Subjekt oder ohne E-Mail ist das Token unbrauchbar", () => {
    expect(kontoAusAnspruechen({ email: "a@b.test" })).toBeNull();
    expect(kontoAusAnspruechen({ sub: "a" })).toBeNull();
    expect(kontoAusAnspruechen({ sub: "", email: "a@b.test" })).toBeNull();
  });
});

describe("Teilen mit Freunden braucht eine bestätigte E-Mail-Adresse (US-ACC-01)", () => {
  it("bestätigt: erlaubt, unbestätigt: nicht erlaubt", () => {
    const basis = { subjekt: "a", email: "a@b.test", anzeigename: null };
    expect(darfMitFreundenTeilen({ ...basis, emailBestaetigt: true })).toBe(true);
    expect(darfMitFreundenTeilen({ ...basis, emailBestaetigt: false })).toBe(false);
  });
});
