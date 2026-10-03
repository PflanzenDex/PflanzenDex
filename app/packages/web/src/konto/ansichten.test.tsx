import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KontoAnsicht, Willkommen } from "./ansichten";
import type { Konto } from "./konto-api";

const konto: Konto = {
  id: "1",
  email: "lena@example.test",
  anzeigename: "Lena",
  emailBestaetigt: true,
  darfMitFreundenTeilen: true,
};
const nichts = () => undefined;

describe("Willkommen (US-ACC-01)", () => {
  it("bietet Registrieren und Anmelden an", () => {
    const html = renderToString(<Willkommen onRegistrieren={nichts} onAnmelden={nichts} />);
    expect(html).toContain("Konto anlegen");
    expect(html).toContain("Anmelden");
  });

  it("nennt nach dem Abmelden die nächste Handlung", () => {
    const html = renderToString(
      <Willkommen onRegistrieren={nichts} onAnmelden={nichts} hinweis="Du bist abgemeldet." />,
    );
    expect(html).toContain("Du bist abgemeldet.");
    expect(html).toContain('role="status"');
  });
});

describe("Angemeldete Ansicht (US-ACC-01)", () => {
  const props = { onAbmelden: nichts, onUeberallAbmelden: nichts };

  it("zeigt Name und E-Mail und beide Abmelde-Wege", () => {
    const html = renderToString(<KontoAnsicht konto={konto} {...props} />);
    expect(html).toContain("Lena");
    expect(html).toContain("lena@example.test");
    expect(html).toContain("Abmelden");
    expect(html).toContain("Auf allen Geräten abmelden");
  });

  it("weist bei unbestätigter E-Mail darauf hin, was zu tun ist", () => {
    const html = renderToString(
      <KontoAnsicht
        konto={{ ...konto, emailBestaetigt: false, darfMitFreundenTeilen: false }}
        {...props}
      />,
    );
    expect(html).toContain("E-Mail-Adresse bestätigen");
    expect(html).toContain("Teilen mit Freunden");
  });

  it("zeigt bei bestätigter E-Mail keine Warnung", () => {
    const html = renderToString(<KontoAnsicht konto={konto} {...props} />);
    expect(html).not.toContain("bestätigen");
  });
});
