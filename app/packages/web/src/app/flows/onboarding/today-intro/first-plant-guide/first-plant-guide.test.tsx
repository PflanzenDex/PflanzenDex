// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, FeaturesProvider } from "@/shared/data";
import { FirstPlantGuide } from "./first-plant-guide";

// US-BES-18 (FR-BES-26): the entry "Aus Datei importieren" on the first-plant guide of "Heute", through what the keeper sees.
const LOOKUP = {
  search: async () => ({ ok: true as const, value: [] }),
  load: async () => ({ ok: false as const, error: { code: "species.not_found", text: "x" } }),
};

function view(features?: Record<string, boolean>) {
  const guide = (
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <FirstPlantGuide
          lookup={LOOKUP as never}
          api="http://api"
          token={async () => "tok"}
          counts={["counts"]}
          onOpen={vi.fn()}
          onLeave={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    features ? <FeaturesProvider features={features}>{guide}</FeaturesProvider> : guide,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        zones: [],
        locations: [],
        species: [],
        cards: [],
        hint: null,
        guideEnded: false,
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-18 the first-plant guide offers the import where the first plant is added", () => {
  it("US-BES-18 the species step of the guide offers Aus Datei importieren as a link to the import page", async () => {
    view();
    const link = await screen.findByRole("link", { name: "Aus Datei importieren" });
    expect(link.getAttribute("href")).toBe("/collection/import");
  });

  it("US-BES-18 with the keeper switch csv_import off the guide hides the entry", async () => {
    view({ csv_import: false });
    await screen.findByRole("heading", { level: 1, name: "Heute" });
    expect(screen.queryByRole("link", { name: "Aus Datei importieren" })).toBeNull();
  });
});
