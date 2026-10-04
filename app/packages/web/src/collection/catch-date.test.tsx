// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setProfileTimeZone, type ApiError } from "../kernel";
import { CreateForm } from "./create-form";
import { createSpecimen } from "./specimens-api";

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
