import { expect, type BrowserContext, type Route } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { applyReply } from "../../../support/display/one-screen/fit.expect";
import type { Screen } from "../../../support/display/one-screen/register";
import { registerProblems } from "../../../support/display/one-screen/register.check";

// Self-test of the reply to a write that a step triggers (US-QS-15, QG-U8; issue 2622): pure, no browser. The gate aborts every
// write, so a register entry that needs the refusal of one (the notice "Schon angefragt") names its answer in `reply`.
// Registered from one-screen.spec.ts.

const entry = (over: Partial<Screen> & Pick<Screen, "id">): Screen => ({
  account: "test3",
  path: "/",
  kind: "deck",
  state: "card",
  ...over,
});

type Fulfill = Parameters<Route["fulfill"]>[0];

/** A context that keeps the one route that `applyReply` registers, and `ask`: what that route does with a request. */
function replyContext() {
  let match: (url: URL) => boolean = () => false;
  let handle: (route: Route) => unknown = () => undefined;
  const context = {
    route: async (m: typeof match, h: typeof handle) => {
      match = m;
      handle = h;
    },
  } as unknown as BrowserContext;
  const ask = (method: string, url: string) => {
    const sent: { fulfilled?: Fulfill; passed?: boolean } = {};
    if (!match(new URL(url))) return { routed: false, sent };
    const route = {
      request: () => ({
        method: () => method,
        headers: () => ({ origin: "http://localhost:5173" }),
      }),
      fulfill: async (options: Fulfill) => void (sent.fulfilled = options),
      fallback: async () => void (sent.passed = true),
    } as unknown as Route;
    void handle(route);
    return { routed: true, sent };
  };
  return { context, ask };
}

export function replySelfTests(): void {
  test.describe("QG-U8 US-QS-15 self-test: the reply to a write that a step triggers", () => {
    replyTests();
  });
}

function replyTests(): void {
  const reply = {
    method: "PUT" as const,
    path: "/exchange/match/*/answer",
    status: 409,
    body: { error: { code: "swap.already_requested", text: "x" } },
  };
  const api = "http://localhost:3000";
  const steps = [{ css: "button" }];

  test("US-QS-15 issue 2622 a reply answers the write of its step with its status and body, and the write never reaches the API", async () => {
    const { context, ask } = replyContext();
    await applyReply(context, entry({ id: "r", steps, reply }), api);
    const put = ask("PUT", `${api}/exchange/match/offer-1/answer`);
    expect(put.routed).toBe(true);
    expect(put.sent.fulfilled?.status).toBe(409);
    expect(JSON.parse(String(put.sent.fulfilled?.body))).toEqual(reply.body);
    expect(put.sent.fulfilled?.headers?.["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    // The preflight of the browser is answered too; another method on the path goes on to the routes before it.
    expect(ask("OPTIONS", `${api}/exchange/match/offer-1/answer`).sent.fulfilled?.status).toBe(204);
    expect(ask("DELETE", `${api}/exchange/match/offer-1/answer`).sent.passed).toBe(true);
  });

  test("US-QS-15 issue 2622 a reply covers its own path only: one segment for the star, never another path or origin", async () => {
    const { context, ask } = replyContext();
    await applyReply(context, entry({ id: "r", steps, reply }), api);
    expect(ask("PUT", `${api}/exchange/match/answer`).routed).toBe(false);
    expect(ask("PUT", `${api}/exchange/match/a/b/answer`).routed).toBe(false);
    expect(ask("PUT", `${api}/exchange/match/offer-1/yes`).routed).toBe(false);
    expect(ask("PUT", "http://localhost:4000/exchange/match/offer-1/answer").routed).toBe(false);
  });

  test("US-QS-15 issue 2622 a screen without a reply registers no route; a reply needs a step, an API path and an HTTP status", async () => {
    const { context, ask } = replyContext();
    await applyReply(context, entry({ id: "r" }), api);
    expect(ask("PUT", `${api}/exchange/match/offer-1/answer`).routed).toBe(false);
    expect(registerProblems([entry({ id: "ok", steps, reply })])).toEqual([]);
    expect(registerProblems([entry({ id: "a", reply })])[0]).toContain("but there is no step");
    const path = { ...reply, path: "x" };
    expect(registerProblems([entry({ id: "b", steps, reply: path })])[0]).toContain(
      "is no API path",
    );
    const status = { ...reply, status: 99 };
    expect(registerProblems([entry({ id: "c", steps, reply: status })])[0]).toContain(
      "is no HTTP status",
    );
  });
}
