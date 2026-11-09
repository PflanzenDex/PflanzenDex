// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalmMode } from "./use-calm-mode";

/** The three states as text: loading or unreadable, calm mode on, calm mode off. */
function Probe() {
  const calm = useCalmMode("http://api", async () => "tok");
  return <p>{calm === undefined ? "unbekannt" : calm ? "ruhig" : "aktiv"}</p>;
}

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-27 the calm mode setting as three states (US-ACH-08)", () => {
  it("US-QS-27 is unknown while the setting loads, then follows calm mode off", async () => {
    answer(200, { calmMode: false });
    render(<Probe />);
    expect(screen.getByText("unbekannt")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("aktiv")).toBeTruthy());
  });

  it("US-QS-27 reports calm mode on as true", async () => {
    answer(200, { calmMode: true });
    render(<Probe />);
    await waitFor(() => expect(screen.getByText("ruhig")).toBeTruthy());
  });

  it("US-QS-27 stays unknown when the setting cannot be read", async () => {
    answer(500, { error: { code: "server.error", text: "x" } });
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByText("unbekannt")).toBeTruthy();
  });
});
