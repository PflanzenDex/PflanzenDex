import { describe, expect, it, vi } from "vitest";
import {
  addressFromState,
  SIGN_OUT_UNREACHABLE,
  signOutEverywhere,
  getAccount,
  oidcSettings,
  returnAddress,
  returnState,
} from "./account-api";

describe("OIDC settings (US-ACC-01)", () => {
  it("have defaults for local development (make auth-up)", () => {
    const e = oidcSettings({}, "http://localhost:5173");
    expect(e.authority).toBe("http://localhost:18081/realms/pflanzendex");
    expect(e.client_id).toBe("pflanzendex-web");
    expect(e.redirect_uri).toBe("http://localhost:5173/");
    expect(e.response_type).toBe("code");
    expect(e.ui_locales).toBe("de");
  });

  it("can be overridden via the environment", () => {
    const e = oidcSettings(
      { VITE_OIDC_AUTHORITY: "https://id.example/realms/x" },
      "https://app.example",
    );
    expect(e.authority).toBe("https://id.example/realms/x");
    expect(e.post_logout_redirect_uri).toBe("https://app.example/");
  });

  it("US-ACC-01 a sign-in request gives up after 15 seconds (starting value, assumption)", () => {
    expect(oidcSettings({}, "http://localhost:5173").requestTimeoutInSeconds).toBe(15);
  });
});

describe("US-BES-17 the return address after the sign-in (#1619)", () => {
  const origin = "http://localhost:5173";

  it("US-BES-17 keeps the path the person is on, such as a scanned label", () => {
    expect(returnAddress(origin, "/label/abc")).toBe(`${origin}/label/abc`);
  });

  it("US-BES-17 the start page stays the start page", () => {
    expect(returnAddress(origin, "/")).toBe(`${origin}/`);
  });

  it("US-BES-17 a path that leads to another origin falls back to the start page", () => {
    expect(returnAddress(origin, "//evil.example/x")).toBe(`${origin}/`);
    expect(returnAddress(origin, "/\\evil.example/x")).toBe(`${origin}/`);
  });

  it("US-BES-17 the query and the hash are not kept, the callback adds its own", () => {
    expect(returnAddress(origin, "/label/abc?code=x&state=y#top")).toBe(`${origin}/label/abc`);
  });
});

describe("US-BES-17 the sign-in state keeps the query of the address (#1639)", () => {
  const origin = "http://localhost:5173";

  it("US-BES-17 the state is the path with its query, relative to the origin", () => {
    expect(returnState(origin, "/collection", "?view=plants")).toBe("/collection?view=plants");
    expect(returnState(origin, "/", "")).toBe("/");
  });

  it("US-BES-17 a state for a path that leads to another origin is the start page", () => {
    expect(returnState(origin, "//evil.example/x", "?y=1")).toBe("/");
  });

  it("US-BES-17 the address from the state keeps the query of a layer", () => {
    expect(addressFromState(origin, "/today?sheet=hints&x=1")).toBe("/today?sheet=hints&x=1");
    expect(addressFromState(origin, "/")).toBe("/");
  });

  it("US-BES-17 the address from the state drops the parameters of the sign-in", () => {
    expect(
      addressFromState(
        origin,
        "/collection?view=plants&code=c&state=s&session_state=x&iss=i&error=e&error_description=d",
      ),
    ).toBe("/collection?view=plants");
  });

  it.each<[string, string]>([
    ["a host after two slashes", "//evil.example/x"],
    ["a host after a slash and a backslash", "/\\evil.example/x"],
    ["an absolute address", "https://evil.example/x"],
    ["a script address", "javascript:alert(1)"],
    ["a path without a leading slash", "collection?view=plants"],
  ])("US-BES-17 a state with %s is ignored", (_label, state) => {
    expect(addressFromState(origin, state)).toBeUndefined();
  });

  it("US-BES-17 a state that is not text is ignored", () => {
    expect(addressFromState(origin, undefined)).toBeUndefined();
    expect(addressFromState(origin, { path: "/collection" })).toBeUndefined();
  });
});

describe("fetch account from the API", () => {
  it("sends the token as bearer and returns the account", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "1", email: "a@b.test" }), { status: 200 }),
      );
    const k = await getAccount("http://api", "tok", f);
    expect(k.email).toBe("a@b.test");
    expect(f).toHaveBeenCalledWith("http://api/account", {
      headers: { Authorization: "Bearer tok" },
      signal: expect.any(AbortSignal),
    });
  });

  it("US-ACC-01 loading the account gives up after the same 15 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const f = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "1", email: "a@b.test" }), { status: 200 }),
        );
      await getAccount("http://api", "tok", f);
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("US-ACC-01 an API that never answers makes the account load reject once the limit passes", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(1));
    try {
      // Answers only by the abort, the way a request ends when its signal fires.
      const never = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init?.signal?.reason));
          }),
      );
      const error = await getAccount("http://api", "tok", never).catch((e: unknown) => e);
      expect((error as Error).name).toBe("TimeoutError");
    } finally {
      timeout.mockRestore();
    }
  });

  it("reports 401 as not signed in", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(getAccount("http://api", "tok", f)).rejects.toThrow("not_signed_in");
  });
});

describe("US-ACC-01 sign out on all devices goes through the API (issue 2065)", () => {
  it("US-ACC-01 posts to the API's session route with the token and a repeat-guard key, not to the sign-in service", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ended: true }), { status: 200 }));
    const r = await signOutEverywhere("http://api", "tok", f);
    expect(r).toEqual({ ok: true, value: { ended: true } });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith("http://api/account/sessions/end", {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Idempotency-Key": expect.any(String) },
      signal: expect.any(AbortSignal),
    });
  });

  it("US-ACC-01 signing out on all devices gives up after the same 15 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ended: true }), { status: 200 }));
    await signOutEverywhere("http://api", "tok", f);
    expect(timeout).toHaveBeenCalledWith(15_000);
    timeout.mockRestore();
  });

  it("US-ACC-01 a refusal of the API comes back with its code and its text, never as a thrown error", async () => {
    const text =
      "Abmelden auf allen Geräten ist auf diesem Server nicht eingerichtet. Melde dich hier ab; andere Geräte bleiben dann angemeldet.";
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "account.sign_out_everywhere_unavailable", text } }),
          { status: 503 },
        ),
      );
    expect(await signOutEverywhere("http://api", "tok", f)).toEqual({
      ok: false,
      error: { code: "account.sign_out_everywhere_unavailable", text },
    });
  });

  it("US-ACC-01 a request that gets no answer comes back as the server not reachable, like the other writes", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await signOutEverywhere("http://api", "tok", f);
    expect(r.ok ? null : r.error.code).toBe("network.not_reachable");
  });
});

describe("US-ACC-01 sign out on all devices: the answers the dialog can show", () => {
  it("US-ACC-01 a request that times out gets no answer, so the dialog says the connection is missing", async () => {
    const f = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const r = await signOutEverywhere("http://api-timeout", "tok", f);
    expect(r).toEqual({ ok: false, error: { code: SIGN_OUT_UNREACHABLE, text: "" } });
  });

  it("US-ACC-01 an answer without a text is the generic failure code, with no text of its own", async () => {
    const f = vi.fn().mockResolvedValue(new Response("<html>gateway</html>", { status: 502 }));
    const r = await signOutEverywhere("http://api-no-text", "tok", f);
    expect(r).toEqual({
      ok: false,
      error: { code: "account.sign_out_everywhere_failed", text: "" },
    });
  });

  it("US-ACC-01 a repeat after no answer sends the same Idempotency-Key, so the server ends the sessions once", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await signOutEverywhere("http://api-repeat", "tok", f);
    await signOutEverywhere("http://api-repeat", "tok", f);
    const keys = f.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>,
    );
    expect(keys[0]?.["Idempotency-Key"]).toBeDefined();
    expect(keys[1]?.["Idempotency-Key"]).toBe(keys[0]?.["Idempotency-Key"]);
  });

  it("US-ACC-01 a refusal frees the key, so the next press sends a new one", async () => {
    const refusal = () =>
      new Response(
        JSON.stringify({ error: { code: "account.sign_out_everywhere_failed", text: "x" } }),
        {
          status: 502,
        },
      );
    const f = vi.fn().mockResolvedValueOnce(refusal()).mockResolvedValueOnce(refusal());
    await signOutEverywhere("http://api-refused", "tok", f);
    await signOutEverywhere("http://api-refused", "tok", f);
    const keys = f.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>,
    );
    expect(keys[1]?.["Idempotency-Key"]).not.toBe(keys[0]?.["Idempotency-Key"]);
  });
});
