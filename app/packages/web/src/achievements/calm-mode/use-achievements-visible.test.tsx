// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAchievementsVisible } from "./use-achievements-visible";

function Probe() {
  const visible = useAchievementsVisible("http://api", async () => "tok");
  return <p>{visible ? "sichtbar" : "versteckt"}</p>;
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

describe("US-ACH-08 the game elements show only while calm mode is off", () => {
  it("US-ACH-08 is hidden until the setting is known and then follows calm mode off", async () => {
    answer(200, { calmMode: false });
    render(<Probe />);
    expect(screen.getByText("versteckt")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("sichtbar")).toBeTruthy());
  });

  it("US-ACH-08 stays hidden in calm mode and when the setting cannot be read", async () => {
    answer(200, { calmMode: true });
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByText("versteckt")).toBeTruthy();
    cleanup();
    answer(500, { error: { code: "server.error", text: "x" } });
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByText("versteckt")).toBeTruthy();
  });
});
