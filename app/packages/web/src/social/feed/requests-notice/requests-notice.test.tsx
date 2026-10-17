// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestsNotice } from "./requests-notice";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const request = (id: string, name: string | null) => ({
  id,
  otherName: name,
  direction: "received",
  status: "requested",
  requestedAt: "2026-10-06T10:00:00.000Z",
});

function show(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(status, body)),
  );
  return render(
    <MemoryRouter>
      <RequestsNotice api="http://api" token={token} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-12 notice about open friendship requests", () => {
  it("US-SOZ-12 names the people and leads to the answer (P-09)", async () => {
    show({ incoming: [request("r1", "Anna"), request("r2", null)], outgoing: [] });
    const region = await screen.findByRole("region", { name: "Offene Freundschaftsanfragen" });
    expect(region.textContent).toContain("Du hast 2 offene Freundschaftsanfragen:");
    expect(region.textContent).toContain("Anna, Name unbekannt");
    expect(screen.getByRole("link", { name: "Anfragen ansehen" }).getAttribute("href")).toBe(
      "/friends",
    );
  });

  it("US-SOZ-12 one request is singular", async () => {
    show({ incoming: [request("r1", "Anna")], outgoing: [] });
    expect((await screen.findByRole("region")).textContent).toContain(
      "Du hast 1 offene Freundschaftsanfrage:",
    );
  });

  it("US-SOZ-12 nothing waits for my answer: nothing is shown; requests I sent do not count", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(200, { incoming: [], outgoing: [{ ...request("r3", "Ben"), direction: "sent" }] }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const { container } = render(
      <MemoryRouter>
        <RequestsNotice api="http://api" token={token} />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("US-SOZ-12 a failed load stays quiet here; the page Freunde says it (P-10)", async () => {
    const { container } = show({ error: { code: "system.unexpected", text: "x" } }, 500);
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });
});
