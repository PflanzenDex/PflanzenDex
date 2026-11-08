// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../shared/data";
import { setViewportWidth } from "../../../shared/testing/viewport-mock";
import { AnnouncerProvider } from "../../../shared/platform/announcer/announcer";
import { RouteFocus } from "../../../shared/platform/routing/route-focus/route-focus";
import { LayerOpener } from "../../../shared/patterns/responsive/layer-sheet/layer-sheet";
import { AnniversaryLayer, AnniversaryTile } from "./anniversary-tile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const token = async () => "tok";
const item = (over: object = {}) => ({
  specimenId: "s1",
  name: "Aloe",
  months: 12,
  date: "2026-04-10",
  caughtOn: "2025-04-10",
  first: null,
  latest: null,
  ...over,
});

/** Answers the anniversaries with `body` and counts the reads. */
function server(body: unknown) {
  const reads = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
  vi.stubGlobal("fetch", reads);
  return reads;
}

/** The area's tile (a layer opener, named by its count and label) and the layer, as "Heute" draws them. */
function today(onOpen = () => undefined) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AnnouncerProvider>
        <MemoryRouter initialEntries={["/"]}>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={() => "Heute"} />
            <h1>Heute</h1>
            <AnniversaryTile
              api="http://api"
              token={token}
              tile={(count, label, layer) => (
                <LayerOpener id={layer}>{`${count} ${label}`}</LayerOpener>
              )}
            />
            <AnniversaryLayer api="http://api" token={token} onOpen={onOpen} />
          </main>
        </MemoryRouter>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe("US-ACH-06 anniversaries as a tile on Heute (issue 1662)", () => {
  it("US-ACH-06 shows the tile with the number of anniversaries, opens the layer with the entries and returns the focus to the tile on Escape (issue 1662)", async () => {
    setViewportWidth(360);
    server({
      calmMode: false,
      items: [item(), item({ specimenId: "s2", name: "Farn", months: 6 })],
    });
    today();
    const opener = await screen.findByRole("button", { name: "2 Jubiläen" });
    await userEvent.click(opener);
    expect(await screen.findByRole("dialog", { name: "Jubiläen" })).toBeTruthy();
    expect(screen.getByText("„Aloe“ ist 1 Jahr bei dir.")).toBeTruthy();
    expect(screen.getByText("„Farn“ ist ein halbes Jahr bei dir.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zur Sammlung: Aloe" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(opener);
  });

  it("US-ACH-06 shows no tile without anniversaries and none in calm mode (issue 1662)", async () => {
    setViewportWidth(360);
    for (const body of [{ calmMode: false, items: [] }, { calmMode: true }]) {
      const reads = server(body);
      const view = today();
      await waitFor(() => expect(reads).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 100));
      expect(screen.queryByRole("button", { name: /Jubiläen/ })).toBeNull();
      view.unmount();
      cleanup();
    }
  });
});
