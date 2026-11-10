// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useInvalidate, useRequest } from "./use-request";

const KEY = ["NFR-12", "US-ONB-01", "1795", "refetch"];
const token = async () => "tok";

/** Lets the refetch and the renders it causes run to their end. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 20)));

function Again() {
  const again = useInvalidate(KEY);
  return (
    <button type="button" onClick={again}>
      Neu laden
    </button>
  );
}

describe("NFR-12 · US-ONB-01 · #1795 a view that reads only the value of a request", () => {
  it("NFR-12 · US-ONB-01 · #1795 is not re-rendered when its refetch starts and ends", async () => {
    let loads = 0;
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));
    const renders = { n: 0 };
    // The first answer comes at once; the refetch waits until the test releases it.
    const load = async () => {
      loads += 1;
      if (loads > 1) await held;
      return { ok: true as const, value: "Monstera" };
    };
    function ValueOnly() {
      renders.n += 1;
      const r = useRequest({ queryKey: KEY, token, load });
      return <p>{r.value ?? "wird geladen"}</p>;
    }
    render(
      <>
        <ValueOnly />
        <Again />
      </>,
    );
    await screen.findByText("Monstera");
    await settle();
    const before = renders.n;

    await userEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    await vi.waitFor(() => expect(loads).toBe(2));
    await settle();
    expect(renders.n).toBe(before);

    release();
    await settle();
    expect(renders.n).toBe(before);
    expect(screen.getByText("Monstera")).toBeTruthy();
  });
});
