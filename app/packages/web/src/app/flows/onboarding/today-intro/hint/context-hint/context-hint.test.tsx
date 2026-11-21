// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, type QueryClient } from "@/shared/data";
import table from "../hint.de.json";
import { hintsKey } from "../hint-api";
import { ContextHint, prefetchHints } from "./context-hint";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** The hint state of the account: `due` is the one occasion the server picks; every write answers at once. */
function server(due: string | null, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
      if (u.pathname === "/onboarding/hints")
        return status === 200
          ? response(200, { hint: due, guideEnded: false })
          : response(status, { error: { code: "server.error" } });
      return response(200, { occasion: u.pathname.split("/").at(-1) });
    }),
  );
  return calls;
}

/** The layer's places: the note of an occasion stands in its own place, as the plant layer puts it. */
function places(
  applicable: string[],
  token = async () => "tok",
  client: QueryClient = createQueryClient(),
) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContextHint api="http://api" token={token} applicable={applicable}>
          {(note) => (
            <>
              <div data-place="messen">{note("first_plant_saved")}</div>
              <div data-place="growth">{note("first_measurement")}</div>
              <p>Der Rest der Ansicht</p>
            </>
          )}
        </ContextHint>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-07 · US-QS-32 the calm hint of the plant layer asks once for its occasions", () => {
  it("US-ONB-07 · US-QS-32 one request carries both occasions that apply, and the due note stands in its own place", async () => {
    const calls = server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    const note = await screen.findByRole("status", { name: "Hinweis" });
    expect(note.textContent).toBe("Miss sie, um ihr Wachstum zu sehen.");
    expect(note.parentElement?.getAttribute("data-place")).toBe("messen");
    const asked = calls.filter((c) => c.startsWith("GET /onboarding/hints"));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("applicable=first_plant_saved%2Cfirst_measurement");
  });

  it("US-ONB-07 · US-QS-32 only one note at a time: the growth note does not show while the Messen note is due", async () => {
    server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    await screen.findByRole("status", { name: "Hinweis" });
    expect(screen.queryByText(table.firstMeasurement)).toBeNull();
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 · US-QS-32 the growth note stands in its own place when first_measurement is due", async () => {
    server("first_measurement");
    render(places(["first_plant_saved", "first_measurement"]));
    const note = await screen.findByRole("status", { name: "Hinweis" });
    expect(note.textContent).toBe("Foto und Größe zeigen ihr Wachstum.");
    expect(note.parentElement?.getAttribute("data-place")).toBe("growth");
  });

  it("US-ONB-07 nothing is asked when no occasion applies, and the layer still shows its content", async () => {
    const calls = server("first_plant_saved");
    render(places([]));
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
    await waitFor(() => expect(calls).toEqual([]));
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
  });

  it("US-ONB-07 nothing is due (dismissed, expired, calm mode or style many): no note, the content stays", async () => {
    const calls = server(null);
    render(places(["first_plant_saved"]));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 · P-10 a failed request fails open: no note, and the layer keeps its content", async () => {
    server("first_plant_saved", 500);
    render(places(["first_plant_saved"]));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 dismissing the note stores it for the account and the note leaves its place", async () => {
    const calls = server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis schließen" }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull());
    expect(calls).toContain("PUT /onboarding/hints/first_plant_saved");
    // the other occasion waits for a later visit; the same layer does not ask again
    expect(calls.filter((c) => c.startsWith("GET /onboarding/hints"))).toHaveLength(1);
  });

  it("US-ONB-07 · NFR-13 the note is announced as text and its close control is reachable by keyboard", async () => {
    server("first_measurement");
    render(places(["first_measurement"]));
    expect((await screen.findByRole("status")).textContent).toContain(table.firstMeasurement);
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Hinweis schließen");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("US-ONB-07 · SG-ONB-02 the note is never above the content it sits in: the child places keep their order", async () => {
    server("first_measurement");
    const content: ReactNode = places(["first_measurement"]);
    render(content);
    const growth = await screen.findByRole("status", { name: "Hinweis" });
    const rest = screen.getByText("Der Rest der Ansicht");
    expect(growth.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe("US-ONB-07 · US-QS-23 the hint answer is fetched before the layer opens, so the note is there on its first render (issue 2384)", () => {
    const hintGets = (calls: string[]) =>
      calls.filter((c) => c.startsWith("GET /onboarding/hints"));

    it("US-ONB-07 · US-QS-23 a prefetched answer sits in the cache before the layer mounts, and the layer shows the note on its first render without a request", async () => {
      const calls = server("first_plant_saved");
      const client = createQueryClient();
      await prefetchHints(client, "http://api", async () => "tok", [
        "first_plant_saved",
        "first_measurement",
      ]);
      expect(hintGets(calls)).toHaveLength(1);
      // The first render already holds the note: no waiting for a request, no waiting for the note's chunk.
      render(places(["first_plant_saved", "first_measurement"], undefined, client));
      const note = screen.getByRole("status", { name: "Hinweis" });
      expect(note.textContent).toBe(table.firstPlantSaved);
      expect(note.parentElement?.getAttribute("data-place")).toBe("messen");
      await waitFor(() => expect(calls).toContain("PUT /onboarding/hints/first_plant_saved"));
      expect(hintGets(calls)).toHaveLength(1);
    });

    it("US-ONB-07 · US-QS-23 a prefetch without a due hint leaves no note and the layer asks no second time inside the screen window", async () => {
      const calls = server(null);
      const client = createQueryClient();
      await prefetchHints(client, "http://api", async () => "tok", ["first_plant_saved"]);
      render(places(["first_plant_saved"], undefined, client));
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
      expect(hintGets(calls)).toHaveLength(1);
    });

    it("US-ONB-07 · P-10 a failed prefetch fails open: the layer asks itself and shows the note when that answer is there", async () => {
      server("first_plant_saved", 500);
      const client = createQueryClient();
      await prefetchHints(client, "http://api", async () => "tok", ["first_plant_saved"]);
      cleanup();
      vi.unstubAllGlobals();
      server("first_plant_saved");
      render(places(["first_plant_saved"], undefined, client));
      expect(await screen.findByRole("status", { name: "Hinweis" })).toBeTruthy();
    });

    it("US-ONB-07 a note dismissed in the layer does not come back when the layer opens again inside the window", async () => {
      server("first_plant_saved");
      const client = createQueryClient();
      await prefetchHints(client, "http://api", async () => "tok", ["first_plant_saved"]);
      const first = render(places(["first_plant_saved"], undefined, client));
      await userEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
      await waitFor(() => expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull());
      first.unmount();
      render(places(["first_plant_saved"], undefined, client));
      expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
    });

    it("US-ONB-07 · US-QS-23 a refetch that started before the dismissal cannot bring the dismissed note back", async () => {
      let gets = 0;
      let release: (r: Response) => void = () => undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => {
          const u = new URL(String(url));
          if (u.pathname !== "/onboarding/hints") return response(200, { occasion: "x" });
          gets += 1;
          const answer = { hint: "first_plant_saved", guideEnded: false };
          // The first answer comes at once; the refetch waits until the test releases it.
          return gets === 1
            ? response(200, answer)
            : new Promise<Response>((resolve) => (release = resolve));
        }),
      );
      const client = createQueryClient();
      const applicable = ["first_plant_saved"];
      await prefetchHints(client, "http://api", async () => "tok", applicable);
      render(places(applicable, undefined, client));
      expect(screen.getByRole("status", { name: "Hinweis" })).toBeTruthy();
      void client.invalidateQueries({ queryKey: hintsKey(applicable) });
      await waitFor(() => expect(gets).toBe(2));
      await userEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
      await waitFor(() => expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull());
      release(new Response(JSON.stringify({ hint: "first_plant_saved", guideEnded: false })));
      await new Promise((done) => setTimeout(done, 30));
      expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
      expect(client.getQueryData(hintsKey(applicable))).toMatchObject({ hint: null });
    });

    it("US-ONB-07 · US-QS-23 the prefetched answer outlives the screen: nobody observes it for ten minutes and it is still in the cache", async () => {
      server("first_plant_saved");
      vi.useFakeTimers();
      try {
        const client = createQueryClient();
        const applicable = ["first_plant_saved", "first_measurement"];
        await prefetchHints(client, "http://api", async () => "tok", applicable);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(client.getQueryData(hintsKey(applicable))).toMatchObject({
          hint: "first_plant_saved",
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
