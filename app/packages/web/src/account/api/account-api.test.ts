import { describe, expect, it, vi } from "vitest";
import { signOutEverywhere, getAccount, oidcSettings } from "./account-api";

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

describe("sign out on all devices", () => {
  it("deletes all sessions of the account at the sign-in service", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await signOutEverywhere("http://id/realms/x", "tok", f);
    expect(f).toHaveBeenCalledWith("http://id/realms/x/account/sessions", {
      method: "DELETE",
      headers: { Authorization: "Bearer tok", Accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });

  it("US-ACC-01 signing out on all devices gives up after the same 15 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await signOutEverywhere("http://id/realms/x", "tok", f);
    expect(timeout).toHaveBeenCalledWith(15_000);
    timeout.mockRestore();
  });

  it("throws on errors so the UI reports nothing wrong", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(signOutEverywhere("http://id/realms/x", "tok", f)).rejects.toThrow(
      "sign_out_failed",
    );
  });
});
