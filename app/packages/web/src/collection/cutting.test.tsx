// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "./CollectionPage";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";
import { createSpecimen, repotSpecimen } from "./specimens-api";

// US-BES-04: create a cutting and repot it in the UI (jsdom, server simulated).
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
} as Species;
const card = (id: string, name: string, status: SpecimenCard["status"]): SpecimenCard => ({
  id,
  name,
  speciesId: "other",
  marker: null,
  speciesName: "Bogenhanf",
  status,
  location: null,
  lightZone: status === "cutting" ? "Lampe 1" : null,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
});

type Post = { path: string; body: Record<string, unknown>; key: string | undefined };
function fakeServer(opts: { repotError?: Response } = {}) {
  const cards = [card("e1", "Ableger", "cutting"), card("e2", "Alte Pflanze", "plant")];
  const posts: Post[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({
        path,
        body,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (path.endsWith("/repot")) {
        if (opts.repotError) return opts.repotError.clone();
        const k = cards.find((x) => x.id === path.split("/")[2]);
        if (k) cards[cards.indexOf(k)] = { ...k, status: "plant", lightZone: null };
      }
      return response(201, { id: "new", name: "Bogenhanf", locationId: null, status: "cutting" });
    }
    if (path === "/locations") return response(200, { locations: [] });
    if (path === "/specimens/archived") return response(200, { archived: [] });
    if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
    return response(200, { cards });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { posts };
}
const page = (newSpecies: Species | null = null) => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={newSpecies}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-04 client of the specimen API", () => {
  it("US-BES-04: creates a cutting with a status", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(201, { id: "e1" }));
    await createSpecimen("http://api", "tok", { speciesId: "a1", status: "cutting" }, fetchFn);
    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ speciesId: "a1", status: "cutting" });
  });

  it("US-BES-04: repots with a bearer token and a fresh Idempotency-Key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { id: "e1", status: "plant" }));
    const r = await repotSpecimen("http://api", "tok", "e1", fetchFn);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e1/repot");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(r).toMatchObject({ ok: true, value: { status: "plant" } });
  });

  it("US-BES-04: a server error stays an error with a code (P-10)", async () => {
    const error = { code: "specimen.not_a_cutting", text: "Kein Steckling." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(409, { error }));
    expect(await repotSpecimen("http://api", "tok", "e1", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "specimen.not_a_cutting" },
    });
  });
});

describe("US-BES-04 create a cutting in the form", () => {
  it("US-BES-04: without the tick it is a plant, the tick sends status cutting", async () => {
    const { posts } = fakeServer();
    render(page(species));
    const tick = await screen.findByRole("checkbox", { name: /Das ist ein Steckling/ });
    expect((tick as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).not.toHaveProperty("status");
    await userEvent.click(tick);
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.body["status"]).toBe("cutting");
  });

  it("US-BES-04: the form explains what a cutting means (P-09)", async () => {
    fakeServer();
    render(page(species));
    const hint = (await screen.findByText(/Stecklingslicht/)).textContent;
    expect(hint).toContain("Phasen");
    expect(hint).toContain("Lichtverteilung");
  });
});

describe("US-BES-04 repotted on the card", () => {
  it("US-BES-04: only a cutting has 'Eingetopft'", async () => {
    fakeServer();
    render(page());
    expect(await screen.findByRole("button", { name: "Eingetopft: Ableger" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eingetopft: Alte Pflanze" })).toBeNull();
  });

  it("US-BES-04: repotting sends the request, reloads and says what happens next (P-09)", async () => {
    const { posts } = fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Eingetopft: Ableger" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: "/specimens/e1/repot", body: {} });
    expect(posts[0]?.key).toBeTruthy();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("„Ableger“ ist eingetopft");
    expect(status.textContent).toContain("Lichtzone");
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Eingetopft: Ableger" })).toBeNull(),
    );
  });

  it("US-BES-04: when repotting fails the card stays and the error text is shown (P-10)", async () => {
    fakeServer({
      repotError: new Response(
        JSON.stringify({
          error: { code: "specimen.not_a_cutting", text: "Dieses Exemplar ist kein Steckling." },
        }),
        { status: 409 },
      ),
    });
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Eingetopft: Ableger" }));
    expect((await screen.findByRole("alert")).textContent).toContain("kein Steckling");
    expect(screen.getByRole("button", { name: "Eingetopft: Ableger" })).toBeTruthy();
  });
});
