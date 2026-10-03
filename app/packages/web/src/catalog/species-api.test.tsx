import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadSpecies, propose, searchSpecies } from "./species-api";
import { SpeciesPage } from "./SpeciesPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-BES-01 client of the species API", () => {
  it("searches with bearer token and encoded search text", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { species: [{ id: "a1" }] }));
    const r = await searchSpecies("http://api", "tok", "Königin & Co", fetchFn);
    expect(r).toEqual({ ok: true, value: [{ id: "a1" }] });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/species?q=K%C3%B6nigin%20%26%20Co");
    const header = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
  });

  it("loads a species; 404 arrives as an error with code", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(404, { error: { code: "species.not_found", text: "Diese Art gibt es nicht." } }),
    );
    const r = await loadSpecies("http://api", "tok", "x", fetchFn);
    expect(r).toMatchObject({ ok: false, error: { code: "species.not_found" } });
  });

  it("the proposal carries a fresh Idempotency-Key; a duplicate stays an error", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(409, { error: { code: "species.duplicate", text: "Gibt es schon." } }),
    );
    const r = await propose("http://api", "tok", { latinName: "Aloe" }, fetchFn);
    expect(r).toMatchObject({ ok: false, error: { code: "species.duplicate" } });
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("the page starts with the search and loads, without inventing anything", () => {
    const h = renderToString(
      <SpeciesPage api="http://api" token={async () => "tok"} onChoose={vi.fn()} />,
    );
    expect(h).toContain("Art wählen");
    expect(h).toContain("Suche läuft");
  });
});
