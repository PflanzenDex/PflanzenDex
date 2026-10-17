import { describe, expect, it } from "vitest";
import {
  SOURCE_POLICY,
  backoffDelayMs,
  classifyStatus,
  exhaustedCode,
  parseRetryAfter,
} from "./index";
import { ERROR_TEXTS } from "../error";

describe("NFR-17 / TE-09 source policy", () => {
  it("allows at most 5 attempts and a backoff of at most 60 s", () => {
    expect(SOURCE_POLICY.maxAttempts).toBe(5);
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(20)).toBe(60_000);
  });

  it("caps a server hint at 60 s and honours a smaller one", () => {
    expect(backoffDelayMs(1, 500_000)).toBe(60_000);
    expect(backoffDelayMs(4, 2000)).toBe(2000);
  });

  it("classifies 404 as no hit, 429 and 5xx as retry, other 4xx as rejected", () => {
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(404)).toBe("not_found");
    expect(classifyStatus(429)).toBe("retry");
    expect(classifyStatus(503)).toBe("retry");
    expect(classifyStatus(400)).toBe("rejected");
    expect(classifyStatus(301)).toBe("rejected");
  });

  it("reads Retry-After as seconds or date, otherwise unknown", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter(new Date(5000).toUTCString(), 2000)).toBe(3000);
    expect(parseRetryAfter("soon", 0)).toBeUndefined();
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });

  it("maps the last failure to a stable error code with a text", () => {
    expect(exhaustedCode(429)).toBe("source.rate_limited");
    expect(exhaustedCode(503)).toBe("source.unavailable");
    expect(exhaustedCode("network")).toBe("source.unavailable");
    expect(exhaustedCode("timeout")).toBe("source.timeout");
    for (const code of ["source.rate_limited", "source.unavailable", "source.timeout"] as const) {
      expect(ERROR_TEXTS[code].length).toBeGreaterThan(0);
    }
  });
});
