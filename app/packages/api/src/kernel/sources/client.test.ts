import { describe, expect, it } from "vitest";
import { SOURCE_POLICY } from "@pflanzendex/core";
import {
  createMemorySourceCache,
  createSourceClient,
  gbifMatch,
  openTreeMatch,
  sourceUrl,
  wikidataEntity,
  wikipediaSummary,
} from "./index";
import type { SourceClientDeps } from "./index";

// TE-09 / NFR-17: no real network; fetch, clock and sleep are fakes.
type Reply = Response | Error;
function setup(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = Date.parse("2026-10-05T10:00:00Z");
  const queue = [...replies];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const now = () => clock;
  const deps: SourceClientDeps = {
    fetch: fakeFetch,
    now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    cache: createMemorySourceCache(now),
    userAgent: "PflanzenDex-test",
  };
  const client = createSourceClient(deps);
  return { client, calls, sleeps, advance: (ms: number) => (clock += ms) };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("TE-09 external source client", () => {
  it("returns a hit with the source and URL as provenance", async () => {
    const { client, calls } = setup([json({ title: "Ficus" })]);
    const r = await client.get(wikipediaSummary("Ficus elastica"));
    expect(r.ok && r.value.kind === "found" && r.value.data).toEqual({ title: "Ficus" });
    if (r.ok) {
      expect(r.value.provenance).toEqual({
        source: "wikipedia",
        url: "https://de.wikipedia.org/api/rest_v1/page/summary/Ficus_elastica",
        retrievedAt: "2026-10-05T10:00:00.000Z",
      });
    }
    expect((calls[0]?.init.headers as Record<string, string>)["user-agent"]).toBe(
      "PflanzenDex-test",
    );
  });

  it("builds the URLs of all four sources and posts the OpenTree request", async () => {
    expect(sourceUrl(gbifMatch("Ficus elastica"))).toBe(
      "https://api.gbif.org/v1/species/match?name=Ficus+elastica",
    );
    expect(sourceUrl(wikidataEntity("Q42"))).toBe(
      "https://www.wikidata.org/wiki/Special:EntityData/Q42.json",
    );
    const { client, calls } = setup([json({ results: [] })]);
    await client.get(openTreeMatch(["Ficus elastica"]));
    expect(calls[0]?.url).toBe("https://api.opentreeoflife.org/v3/tnrs/match_names");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ names: ["Ficus elastica"] }));
  });

  it("serves the second call from the cache without a request", async () => {
    const { client, calls } = setup([json({ a: 1 })]);
    await client.get(gbifMatch("Ficus"));
    const second = await client.get(gbifMatch("Ficus"));
    expect(calls).toHaveLength(1);
    expect(second.ok && second.value.cached).toBe(true);
  });

  it("caches 'no hit' as a result until it expires", async () => {
    const { client, calls, advance } = setup([json({}, 404), json({ a: 1 })]);
    const first = await client.get(gbifMatch("Nopeus"));
    expect(first.ok && first.value.kind).toBe("not_found");
    await client.get(gbifMatch("Nopeus"));
    expect(calls).toHaveLength(1);
    advance(SOURCE_POLICY.notFoundTtlMs + 1);
    const again = await client.get(gbifMatch("Nopeus"));
    expect(calls).toHaveLength(2);
    expect(again.ok && again.value.kind).toBe("found");
  });

  it("retries 5xx with exponential backoff and then succeeds", async () => {
    const { client, sleeps } = setup([json({}, 503), json({}, 500), json({ ok: true })]);
    const r = await client.get(gbifMatch("Ficus"));
    expect(r.ok && r.value.kind).toBe("found");
    expect(sleeps.filter((ms) => ms >= 1000)).toEqual([1000, 2000]);
  });

  it("gives up after 5 attempts on 429, caps the wait at 60 s and does not cache the error", async () => {
    const replies = Array.from({ length: 6 }, () => json({}, 429, { "retry-after": "999" }));
    const { client, calls, sleeps } = setup(replies);
    const r = await client.get(gbifMatch("Ficus"));
    expect(!r.ok && r.error.code).toBe("source.rate_limited");
    expect(!r.ok && r.error.data).toEqual({ source: "gbif", attempts: 5, status: 429 });
    expect(calls).toHaveLength(5);
    expect(Math.max(...sleeps)).toBe(60_000);
    await client.get(gbifMatch("Ficus"));
    expect(calls.length).toBeGreaterThan(5);
  });

  it("reports a timeout and a network failure with their own codes", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const a = setup(Array.from({ length: 5 }, () => timeout));
    const r1 = await a.client.get(gbifMatch("Ficus"));
    expect(!r1.ok && r1.error.code).toBe("source.timeout");
    const b = setup(Array.from({ length: 5 }, () => new TypeError("fetch failed")));
    const r2 = await b.client.get(gbifMatch("Ficus"));
    expect(!r2.ok && r2.error.code).toBe("source.unavailable");
  });

  it("does not retry other 4xx and unreadable bodies", async () => {
    const a = setup([json({}, 400)]);
    const r1 = await a.client.get(gbifMatch("Ficus"));
    expect(!r1.ok && r1.error.code).toBe("source.request_rejected");
    expect(a.calls).toHaveLength(1);
    const b = setup([new Response("<html>", { status: 200 })]);
    const r2 = await b.client.get(gbifMatch("Ficus"));
    expect(!r2.ok && r2.error.code).toBe("source.response_invalid");
    expect(b.calls).toHaveLength(1);
  });

  it("throttles two requests to the same source but not to different ones", async () => {
    const { client, sleeps } = setup([json({}), json({}), json({})]);
    await client.get(gbifMatch("A"));
    await client.get(gbifMatch("B"));
    expect(sleeps).toEqual([SOURCE_POLICY.minIntervalMs.gbif]);
    await client.get(openTreeMatch(["C"]));
    expect(sleeps).toHaveLength(1);
  });
});
