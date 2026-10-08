import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`../../../../../deploy/${name}`, import.meta.url), "utf8");
const web = read("web.Caddyfile");
const proxy = read("Caddyfile");

/** The body of the `handle` block that starts with the given matcher. */
function block(header: string): string {
  const start = web.indexOf(header);
  expect(start, `block "${header}" exists`).toBeGreaterThan(-1);
  return web.slice(start, web.indexOf("\n\t}", start));
}

describe("NFR-12 · compression and cache headers of the serving layer", () => {
  it("NFR-12 the proxy compresses text responses with zstd and gzip", () => {
    expect(proxy).toMatch(/^\s*encode\s+zstd\s+gzip\s*$/m);
  });

  it("NFR-12 hashed assets are cached for a year as immutable and a missing one is no HTML fallback", () => {
    const assets = block("handle /assets/*");
    expect(assets).toContain('Cache-Control "public, max-age=31536000, immutable"');
    expect(assets).not.toContain("try_files");
  });

  it("NFR-12 index.html, service worker and manifest are revalidated (no-cache)", () => {
    const entry = block("handle @revalidate");
    expect(entry).toContain('Cache-Control "no-cache"');
    const matcher = /@revalidate path (.*)/.exec(web)?.[1] ?? "";
    for (const f of ["/index.html", "/sw.js", "/manifest.webmanifest"])
      expect(matcher).toContain(f);
  });

  it("NFR-12 SPA routes fall back to the shell with no-cache", () => {
    const fallback = web.slice(web.lastIndexOf("handle {"));
    expect(fallback).toContain('Cache-Control "no-cache"');
    expect(fallback).toContain("try_files {path} /index.html");
  });

  it("NFR-12 an error response (such as a missing hashed file) is never cached", () => {
    expect(block("handle_errors")).toContain('Cache-Control "no-store"');
  });
});
