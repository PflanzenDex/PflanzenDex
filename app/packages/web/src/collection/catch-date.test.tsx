// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpecimenCard } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setProfileTimeZone, type ApiError } from "../kernel";
import { CollectionPage } from "./CollectionPage";
import { CreateForm } from "./create-form";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";
import { correctCatchDate, createSpecimen } from "./specimens-api";

// US-BES-02 / FR-BES-04: back-dating the catch date in the create form.
const species = { id: "a1", latinName: "Dracaena trifasciata", germanName: "Bogenhanf" } as Species;
// 2026-10-02 23:30 UTC: already the 3rd in Berlin, still the 2nd in New York.
const NOW = new Date("2026-10-02T23:30:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  setProfileTimeZone("Europe/Berlin");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setProfileTimeZone(null);
  cleanup();
});

const show = (onSend = vi.fn(async (): Promise<ApiError | null> => null)) => {
  render(
    <CreateForm
      species={species}
      siblings={[]}
      locations={[]}
      onSend={onSend}
      onCancel={vi.fn()}
    />,
  );
  return onSend;
};
const field = () => screen.getByLabelText("Fangdatum") as HTMLInputElement;

describe("US-BES-02 FR-BES-04 catch date field", () => {
  it("is a labelled date input, preset to the keeper's local today and capped at it", () => {
    show();
    expect(field().type).toBe("date");
    expect(field().value).toBe("2026-10-03");
    expect(field().max).toBe("2026-10-03");
    expect(field().required).toBe(false);
  });

  it("follows the profile time zone, not UTC", () => {
    setProfileTimeZone("America/New_York");
    show();
    expect(field().value).toBe("2026-10-02");
    expect(field().max).toBe("2026-10-02");
  });

  it("says that back-dating is allowed and the future is not, linked by aria-describedby", () => {
    show();
    const hintId = field().getAttribute("aria-describedby") ?? "";
    const hint = document.getElementById(hintId.split(" ")[0] ?? "");
    expect(hint?.textContent).toContain("schon länger");
    expect(hint?.textContent).toContain("früheres Datum");
    expect(hint?.textContent).toContain("Zukunft");
    expect(document.body.textContent).not.toContain("Gefangen am: heute");
  });

  it("untouched, nothing is sent: the server uses today's local date", async () => {
    const onSend = show();
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect(onSend).toHaveBeenCalledWith({});
  });

  it("a back-dated value is sent as catchDate", async () => {
    const onSend = show();
    fireEvent.change(field(), { target: { value: "2022-02-03" } });
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect(onSend).toHaveBeenCalledWith({ catchDate: "2022-02-03" });
  });

  it("a cleared field sends nothing (default applies)", async () => {
    const onSend = show();
    fireEvent.change(field(), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect(onSend).toHaveBeenCalledWith({});
  });

  it("a refusal marks the field visibly (aria-invalid), names the error via aria-describedby and moves focus to it", async () => {
    const error: ApiError = {
      code: "specimen.caught_in_future",
      text: "Das Fangdatum liegt in der Zukunft. Wähle heute oder ein früheres Datum.",
      details: [{ field: "catchDate", code: "specimen.caught_in_future" }],
    };
    const onSend = show(vi.fn(async () => error));
    fireEvent.change(field(), { target: { value: "2026-10-04" } });
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(onSend).toHaveBeenCalledWith({ catchDate: "2026-10-04" });
    expect(field().getAttribute("aria-invalid")).toBe("true");
    const ids = (field().getAttribute("aria-describedby") ?? "").split(" ");
    const texts = ids.map((id) => document.getElementById(id)?.textContent ?? "");
    expect(texts.join(" ")).toContain("Das Fangdatum liegt in der Zukunft.");
    expect(field().value).toBe("2026-10-04"); // the input stays (P-10)
  });

  it("an error about something else does not mark the date field", async () => {
    const error: ApiError = { code: "species.not_found", text: "Diese Art gibt es nicht." };
    show(vi.fn(async () => error));
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    expect(field().getAttribute("aria-invalid")).not.toBe("true");
  });
});

describe("US-BES-02 FR-BES-04 client of the specimen API", () => {
  it("sends catchDate together with the profile's time zone", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "e1" }), { status: 201 }),
    );
    await createSpecimen(
      "http://api",
      "tok",
      { speciesId: "a1", catchDate: "2022-02-03" },
      fetchFn,
    );
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ catchDate: "2022-02-03", timeZone: "Europe/Berlin" });
  });
});

describe("US-BES-11 client: correct the catch date", () => {
  it("posts catchDate with the profile's time zone, bearer token and a fresh Idempotency-Key", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "e 1" }), { status: 200 }),
    );
    const r = await correctCatchDate(
      "http://api",
      "tok",
      { id: "e 1", catchDate: "2021-04-12" },
      fetchFn,
    );
    expect(r.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e%201/catch-date");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      catchDate: "2021-04-12",
      timeZone: "Europe/Berlin",
    });
    const header = init?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
    expect(header["Idempotency-Key"]).toBeTruthy();
  });
});

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: null,
  lightZone: null,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  ...extra,
});

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function fakeServer(cards: SpecimenCard[], answer: () => Promise<Response>) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        posts.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return answer();
      }
      if (path === "/locations") return json(200, { locations: [] });
      if (path === "/specimens/archived") return json(200, { archived: [] });
      if (path === "/specimens/distribution") return json(200, EMPTY_DISTRIBUTION);
      return json(200, { cards });
    }),
  );
  return posts;
}

const page = () => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={null}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
  />
);
const openForm = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Fangdatum korrigieren: Bogenhanf" }),
  );
  return screen.getByLabelText("Fangdatum") as HTMLInputElement;
};

describe("US-BES-11 correct the catch date on the card", () => {
  it("US-BES-11 the form shows the stored date, is capped at the local today and names the specimen", async () => {
    fakeServer([card()], () => json(200, {}));
    render(page());
    const input = await openForm();
    expect(screen.getByRole("heading", { name: "Fangdatum korrigieren" })).toBeTruthy();
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-09-01");
    expect(input.max).toBe("2026-10-03");
    expect(document.body.textContent).toContain("Bisher: 01.09.2026");
  });

  it("US-BES-11 an unknown catch date is shown as unknown and the field is preset to today (P-08)", async () => {
    fakeServer([card({ caughtAt: null })], () => json(200, {}));
    render(page());
    const input = await openForm();
    expect(input.value).toBe("2026-10-03");
    expect(document.body.textContent).toContain("Bisher: unbekannt");
  });

  it("US-BES-11 saving sends the date and says what changed (P-09)", async () => {
    const posts = fakeServer([card()], () =>
      json(200, { id: "e1", name: "Bogenhanf", caughtAt: "2021-04-12" }),
    );
    render(page());
    fireEvent.change(await openForm(), { target: { value: "2021-04-12" } });
    await userEvent.click(screen.getByRole("button", { name: "Fangdatum speichern" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      path: "/specimens/e1/catch-date",
      body: { catchDate: "2021-04-12", timeZone: "Europe/Berlin" },
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Das Fangdatum von „Bogenhanf“ ist jetzt der 12.04.2021.",
    );
  });

  it("US-BES-11 an empty field is not sent; the form says why", async () => {
    const posts = fakeServer([card()], () => json(200, {}));
    render(page());
    fireEvent.change(await openForm(), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "Fangdatum speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Fangdatum");
    expect(posts).toHaveLength(0);
  });

  it("US-BES-11 a refusal marks the field with the German text of its code, the input stays (P-10)", async () => {
    fakeServer([card()], () =>
      json(400, {
        error: {
          code: "specimen.caught_in_future",
          text: "server text",
          details: [{ field: "catchDate", code: "specimen.caught_in_future" }],
        },
      }),
    );
    render(page());
    const input = await openForm();
    fireEvent.change(input, { target: { value: "2026-10-04" } });
    await userEvent.click(screen.getByRole("button", { name: "Fangdatum speichern" }));
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(document.body.textContent).toContain("Das Fangdatum liegt in der Zukunft.");
    expect(document.body.textContent).not.toContain("server text");
    expect(input.value).toBe("2026-10-04");
  });

  it("US-BES-11 a refusal without a field (unknown specimen) is shown as a form alert", async () => {
    fakeServer([card()], () =>
      json(404, { error: { code: "specimen.not_found", text: "server text" } }),
    );
    render(page());
    await openForm();
    await userEvent.click(screen.getByRole("button", { name: "Fangdatum speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Dieses Exemplar gibt es nicht.",
    );
  });

  it("US-BES-11 cancel goes back to the list without sending", async () => {
    const posts = fakeServer([card()], () => json(200, {}));
    render(page());
    await openForm();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(await screen.findByRole("heading", { name: "Bestand" })).toBeTruthy();
    expect(posts).toHaveLength(0);
  });
});
