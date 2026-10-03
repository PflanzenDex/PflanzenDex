import { describe, expect, it, vi } from "vitest";
import { abmeldenUeberall, holeKonto, oidcEinstellungen } from "./konto-api";

describe("OIDC-Einstellungen (US-ACC-01)", () => {
  it("haben Voreinstellungen für die lokale Entwicklung (make auth-up)", () => {
    const e = oidcEinstellungen({}, "http://localhost:5173");
    expect(e.authority).toBe("http://localhost:18081/realms/pflanzendex");
    expect(e.client_id).toBe("pflanzendex-web");
    expect(e.redirect_uri).toBe("http://localhost:5173/");
    expect(e.response_type).toBe("code");
    expect(e.ui_locales).toBe("de");
  });

  it("lassen sich über die Umgebung überschreiben", () => {
    const e = oidcEinstellungen(
      { VITE_OIDC_AUTHORITY: "https://id.example/realms/x" },
      "https://app.example",
    );
    expect(e.authority).toBe("https://id.example/realms/x");
    expect(e.post_logout_redirect_uri).toBe("https://app.example/");
  });
});

describe("Konto von der API holen", () => {
  it("sendet das Token als Bearer und liefert das Konto", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "1", email: "a@b.test" }), { status: 200 }),
      );
    const k = await holeKonto("http://api", "tok", f);
    expect(k.email).toBe("a@b.test");
    expect(f).toHaveBeenCalledWith("http://api/konto", {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("meldet 401 als nicht angemeldet", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(holeKonto("http://api", "tok", f)).rejects.toThrow("nicht_angemeldet");
  });
});

describe("Auf allen Geräten abmelden", () => {
  it("löscht beim Anmeldedienst alle Sitzungen des Kontos", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await abmeldenUeberall("http://id/realms/x", "tok", f);
    expect(f).toHaveBeenCalledWith("http://id/realms/x/account/sessions", {
      method: "DELETE",
      headers: { Authorization: "Bearer tok", Accept: "application/json" },
    });
  });

  it("wirft bei Fehlern, damit die Oberfläche nichts Falsches meldet", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(abmeldenUeberall("http://id/realms/x", "tok", f)).rejects.toThrow(
      "abmelden_fehlgeschlagen",
    );
  });
});
