// @vitest-environment jsdom
// US-BES-17 (issue 1823): after the return from the sign-in the router shows the address the person was at, with the
// layer or form of its query, and not the callback's address with the sign-in parameters.
import { render, screen, waitFor } from "@testing-library/react";
import type { UserManager } from "oidc-client-ts";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { TransitionRouter } from "@/shared/platform/routing/route-transition/transition-router/transition-router";
import { processReturn } from "./sign-in-client";

function Probe() {
  const location = useLocation();
  return <p data-testid="router-address">{location.pathname + location.search}</p>;
}

describe("US-BES-17 the router follows the restored address (issue 1823)", () => {
  it("US-BES-17 after the return to a form address the router has the form's query and no sign-in parameter", async () => {
    window.history.replaceState({}, "", "/collection?state=s&session_state=x&iss=i&code=c");
    render(
      <TransitionRouter>
        <Probe />
      </TransitionRouter>,
    );
    const mgr = {
      signinCallback: async () => ({ state: "/collection?form=measure&plant=p1" }),
      getUser: async () => null,
    } as unknown as UserManager;
    await processReturn(mgr);
    expect(window.location.pathname + window.location.search).toBe(
      "/collection?form=measure&plant=p1",
    );
    await waitFor(() =>
      expect(screen.getByTestId("router-address").textContent).toBe(
        "/collection?form=measure&plant=p1",
      ),
    );
  });
});
