// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWrite } from "../../../../kernel";
import { UnlocksProvider, useUnlocks } from "./unlocks";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const Have = () => {
  const reason = useUnlocks().entries[0]?.reasons[0];
  return <p>{reason && reason.kind === "specimens" ? `have ${reason.have}` : "none"}</p>;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-05 lock states refresh after every write", () => {
  it("US-ONB-05 a plant saved through any write is counted in the lock reasons without a reload", async () => {
    let have = 0;
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/onboarding/unlocks"
        ? json(200, {
            functions: [
              {
                id: "wishlist",
                state: "locked",
                announced: true,
                reasons: [{ kind: "specimens", needed: 5, have }],
                ways: [],
                mayUnlockNow: true,
              },
            ],
          })
        : json(201, {}),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UnlocksProvider api="http://api.test" token={async () => "tok"}>
        <Have />
      </UnlocksProvider>,
    );
    await screen.findByText("have 0");
    have = 1;
    await createWrite("http://api.test", "tok")("POST", "/specimens", {});
    await waitFor(() => expect(screen.getByText("have 1")).toBeTruthy());
  });
});
