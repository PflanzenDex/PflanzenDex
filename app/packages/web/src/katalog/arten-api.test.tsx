import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ladeArt, schlageVor, sucheArten } from "./arten-api";
import { ArtenSeite } from "./ArtenSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-BES-01 Client der Arten-API", () => {
  it("sucht mit Bearer-Token und kodiertem Suchtext", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { arten: [{ id: "a1" }] }));
    const r = await sucheArten("http://api", "tok", "Königin & Co", abruf);
    expect(r).toEqual({ ok: true, wert: [{ id: "a1" }] });
    expect(String(abruf.mock.calls[0]?.[0])).toBe("http://api/arten?q=K%C3%B6nigin%20%26%20Co");
    const kopf = abruf.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe("Bearer tok");
  });

  it("lädt eine Art; 404 kommt als Fehler mit Code an", async () => {
    const abruf = vi.fn<typeof fetch>(async () =>
      antwort(404, { fehler: { code: "art.nicht_gefunden", text: "Diese Art gibt es nicht." } }),
    );
    const r = await ladeArt("http://api", "tok", "x", abruf);
    expect(r).toMatchObject({ ok: false, fehler: { code: "art.nicht_gefunden" } });
  });

  it("der Vorschlag trägt einen frischen Idempotency-Key; eine Dublette bleibt ein Fehler", async () => {
    const abruf = vi.fn<typeof fetch>(async () =>
      antwort(409, { fehler: { code: "art.dublette", text: "Gibt es schon." } }),
    );
    const r = await schlageVor("http://api", "tok", { lateinischerName: "Aloe" }, abruf);
    expect(r).toMatchObject({ ok: false, fehler: { code: "art.dublette" } });
    const init = abruf.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("die Seite beginnt mit der Suche und lädt, ohne etwas zu erfinden", () => {
    const h = renderToString(<ArtenSeite api="http://api" token={async () => "tok"} />);
    expect(h).toContain("Art wählen");
    expect(h).toContain("Suche läuft");
  });
});
