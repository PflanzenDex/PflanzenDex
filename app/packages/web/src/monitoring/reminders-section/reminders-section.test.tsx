// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { RemindersSection } from "./reminders-section";

const token = async () => "tok";

const show = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response("{}", { status: 404 })),
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <LayerHost>
          <RemindersSection api="http://api" token={token} />
        </LayerHost>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeAll(() => setViewportWidth(1024));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 the reminders section while push is not set up", () => {
  it("US-QS-32 says at the top that reminders appear in the inbox and not yet as a notification", () => {
    show();
    expect(
      screen.getByText("Erinnerungen erscheinen im Posteingang, noch nicht als Mitteilung."),
    ).toBeTruthy();
  });

  it("US-QS-32 renders no row Push-Geräte, and the rows of the inbox and the settings stay", () => {
    show();
    expect(screen.queryByText("Push-Geräte")).toBeNull();
    expect(screen.queryByText("Browser für Push abmelden")).toBeNull();
    expect(screen.getByRole("button", { name: /^Posteingang/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Wann erinnern\?/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Pausen je Anlass/ })).toBeTruthy();
  });
});
