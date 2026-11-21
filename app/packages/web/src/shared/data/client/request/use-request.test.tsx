// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequestFailure } from "./query-client";
import { SIGN_IN } from "../../write-action/use-write-action";
import { requestQueryFn, useInvalidate, useRequest } from "./use-request";

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

describe("DS-09 · US-QS-23 the query function of a request is one function, for the hook and for a prefetch (issue 2384)", () => {
  it("DS-09 · US-QS-23 it gives the value of an answer that is ok", async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: "Monstera" }));
    expect(await requestQueryFn(token, load)()).toBe("Monstera");
    expect(load).toHaveBeenCalledWith("tok");
  });

  it("DS-09 · US-QS-23 it throws a RequestFailure with the error of a refusal (P-10), and with the sign-in error without a token", async () => {
    const error = { code: "specimen.not_found", text: "Nicht gefunden." };
    const refused = requestQueryFn(token, async () => ({ ok: false as const, error }))();
    await expect(refused).rejects.toBeInstanceOf(RequestFailure);
    await expect(refused).rejects.toMatchObject({ error });
    const load = vi.fn();
    const noToken = requestQueryFn(async () => undefined, load)();
    await expect(noToken).rejects.toMatchObject({ error: SIGN_IN });
    expect(load).not.toHaveBeenCalled();
  });
});
