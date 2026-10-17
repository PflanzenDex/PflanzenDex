// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { Anniversaries, anniversaryText } from "./anniversaries";

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
  first: { url: "/specimens/s1/measurements/m1/photo", date: "2025-04-12" },
  latest: { url: "/specimens/s1/measurements/m2/photo", date: "2026-03-01" },
  ...over,
});

/** Answers the list and the private photos; `list` can be an error status. */
function server(list: { status: number; body: unknown }) {
  const paths: string[] = [];
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.endsWith("/photo")) return new Response(new Blob(["x"]), { status: 200 });
      return new Response(JSON.stringify(list.body), { status: list.status });
    }),
  );
  return paths;
}
const show = (onOpen = () => undefined) =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Anniversaries api="http://api" token={token} onOpen={onOpen} />
    </QueryClientProvider>,
  );

describe("US-ACH-06 anniversaries on the Today list", () => {
  it("US-ACH-06 names the time with the plant in words", () => {
    expect(anniversaryText(6)).toBe("ein halbes Jahr");
    expect(anniversaryText(12)).toBe("1 Jahr");
    expect(anniversaryText(18)).toBe("1,5 Jahre");
    expect(anniversaryText(24)).toBe("2 Jahre");
  });

  it("US-ACH-06 shows '<Specimen> is 1 year with you' with the first and the latest photo and a next step (P-09)", async () => {
    const paths = server({ status: 200, body: { calmMode: false, items: [item()] } });
    const onOpen = vi.fn();
    show(onOpen);
    expect(await screen.findByText("„Aloe“ ist 1 Jahr bei dir.")).toBeTruthy();
    expect(screen.getByText(/Seit dem 10\.04\.2025/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(paths).toContain("/specimens/s1/measurements/m1/photo");
    expect(paths).toContain("/specimens/s1/measurements/m2/photo");
    await userEvent.click(screen.getByRole("button", { name: /Aloe/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("US-ACH-06 without a photo no image is shown", async () => {
    server({
      status: 200,
      body: { calmMode: false, items: [item({ first: null, latest: null })] },
    });
    show();
    expect(await screen.findByText("„Aloe“ ist 1 Jahr bei dir.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("US-ACH-08 calm mode, no anniversary or a read error show nothing and no error", async () => {
    for (const reply of [
      { status: 200, body: { calmMode: true } },
      { status: 200, body: { calmMode: false, items: [] } },
      { status: 500, body: { error: { code: "internal" } } },
    ]) {
      server(reply);
      const view = show();
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(view.container.textContent).toBe("");
      cleanup();
    }
  });
});
