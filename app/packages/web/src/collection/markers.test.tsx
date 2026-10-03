// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "./CollectionPage";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";
import { markSpecimen, createSpecimen } from "./specimens-api";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
} as Species;
const card = (
  id: string,
  marker: string | null,
  extra: Partial<SpecimenCard> = {},
): SpecimenCard => ({
  id,
  name: marker ? `Bogenhanf – ${marker}` : "Bogenhanf",
  speciesId: "a1",
  marker,
  speciesName: "Bogenhanf",
  status: "plant",
  location: null,
  lightZone: null,
  caughtAt: "2026-10-03",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  ...extra,
});

type Post = { path: string; body: Record<string, unknown>; key: string | undefined };

function fakeServer(cards: SpecimenCard[], answer?: () => Promise<Response>) {
  const posts: Post[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        posts.push({
          path,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        return answer ? answer() : response(200, { id: "e1", name: "x" });
      }
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      return response(200, { cards });
    }),
  );
  return posts;
}

const page = (extra: Partial<Parameters<typeof CollectionPage>[0]> = {}) => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={null}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
    {...extra}
  />
);
const apiError = (code: string, text: string) =>
  response(409, { error: { code, text, data: { name: "Bogenhanf", existing: [] } } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-03 client of the API", () => {
  it("marks a specimen with bearer token, marker and a fresh Idempotency-Key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { id: "e 1", name: "x" }));
    const r = await markSpecimen("http://api", "tok", { id: "e 1", marker: "rot" }, fetchFn);
    expect(r.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e%201/marker");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ marker: "rot" });
    const header = init?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
    expect(header["Idempotency-Key"]).toBeTruthy();
  });

  it("creating passes the markers of existing specimens", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(201, { id: "e3", name: "x" }));
    await createSpecimen(
      "http://api",
      "tok",
      { speciesId: "a1", marker: "rot", markers: [{ specimenId: "e1", marker: "blau" }] },
      fetchFn,
    );
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ marker: "rot", markers: [{ specimenId: "e1", marker: "blau" }] });
  });
});

describe("US-BES-03 form: the marker of the 2nd and 3rd specimen", () => {
  it("1st specimen: the marker stays optional and empty", async () => {
    fakeServer([]);
    render(page({ newSpecies: species }));
    const field = await screen.findByLabelText("Kennzeichen (optional)");
    expect((field as HTMLInputElement).value).toBe("");
  });

  it('2nd specimen: the marker is required and preset to "Klammer", freely changeable', async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page({ newSpecies: species }));
    const field = (await screen.findByLabelText("Kennzeichen")) as HTMLInputElement;
    expect(field.value).toBe("Klammer");
    expect(field.required).toBe(true);
    expect(screen.getByText("Name: Bogenhanf – Klammer")).toBeTruthy();
    await userEvent.clear(field);
    await userEvent.type(field, "rot");
    expect(screen.getByText("Name: Bogenhanf – rot")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({ speciesId: "a1", marker: "rot" });
    expect(posts[0]?.body["markers"]).toBeUndefined();
  });

  it("2nd specimen with an empty marker: not sent, the form says why (P-10)", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page({ newSpecies: species }));
    await userEvent.clear(await screen.findByLabelText("Kennzeichen"));
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Kennzeichen");
    expect(posts).toHaveLength(0);
  });

  it("the preset is not offered when a specimen already carries it", async () => {
    fakeServer([card("e1", null), card("e2", "Klammer")]);
    render(page({ newSpecies: species }));
    const field = (await screen.findByLabelText("Kennzeichen")) as HTMLInputElement;
    expect(field.value).toBe("");
  });

  it("from the 3rd on: asks for the missing marker of the plain specimen before saving", async () => {
    const posts = fakeServer([card("e1", null), card("e2", "Klammer")]);
    render(page({ newSpecies: species }));
    const missing = (await screen.findByLabelText(
      "Kennzeichen für „Bogenhanf“",
    )) as HTMLInputElement;
    expect(missing.required).toBe(true);
    await userEvent.type(screen.getByLabelText("Kennzeichen"), "rot");

    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect(posts).toHaveLength(0);
    expect((await screen.findByRole("alert")).textContent).toContain("fehlenden Kennzeichen");

    await userEvent.type(missing, "blau");
    expect(screen.getByText(/„Bogenhanf“ heißt dann „Bogenhanf – blau“/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({
      marker: "rot",
      markers: [{ specimenId: "e1", marker: "blau" }],
    });
  });

  it("an error of the server stays visible with its text", async () => {
    const posts = fakeServer([card("e1", null)], () =>
      apiError("specimen.marker_taken", "Dieses Kennzeichen gibt es bei dieser Art schon."),
    );
    render(page({ newSpecies: species }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "gibt es bei dieser Art schon",
    );
    expect(posts).toHaveLength(1);
  });
});

describe("US-BES-03 rename: change the marker on the card", () => {
  const open = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Kennzeichen ändern: Bogenhanf" }),
    );
  };

  it("renames via the form, says the new name and reloads the list", async () => {
    const cards = [card("e1", null), card("e2", "Klammer")];
    const posts = fakeServer(cards, () => response(200, { id: "e1", name: "Bogenhanf – rot" }));
    render(page());
    await open();
    expect(await screen.findByRole("heading", { name: "Kennzeichen ändern" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Kennzeichen"), "rot");
    expect(screen.getByText("Name: Bogenhanf – rot")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Kennzeichen speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: "/specimens/e1/marker", body: { marker: "rot" } });
    expect(posts[0]?.key).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toContain(
      "„Bogenhanf“ heißt jetzt „Bogenhanf – rot“",
    );
  });

  it("starts with the current marker", async () => {
    fakeServer([card("e2", "Klammer")]);
    render(page());
    await userEvent.click(
      await screen.findByRole("button", { name: "Kennzeichen ändern: Bogenhanf – Klammer" }),
    );
    expect(((await screen.findByLabelText("Kennzeichen")) as HTMLInputElement).value).toBe(
      "Klammer",
    );
  });

  it("an empty marker is not sent", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page());
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Kennzeichen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Kennzeichen");
    expect(posts).toHaveLength(0);
  });

  it("a duplicate marker shows the server text, nothing is reported as changed", async () => {
    fakeServer([card("e1", null), card("e2", "Klammer")], () =>
      apiError("specimen.marker_taken", "Dieses Kennzeichen gibt es bei dieser Art schon."),
    );
    render(page());
    await open();
    await userEvent.type(screen.getByLabelText("Kennzeichen"), "klammer");
    await userEvent.click(screen.getByRole("button", { name: "Kennzeichen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "gibt es bei dieser Art schon",
    );
    expect(screen.queryByText(/heißt jetzt/)).toBeNull();
  });

  it("cancel goes back to the list without a request", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page());
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(
      await screen.findByRole("button", { name: "Kennzeichen ändern: Bogenhanf" }),
    ).toBeTruthy();
    expect(posts).toHaveLength(0);
  });
});
