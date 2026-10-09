import { describe, expect, it } from "vitest";
import { commonsRequest, commonsTitle, readCommons } from "./commons";

const page = (extra: Record<string, unknown> = {}, meta: Record<string, string> = {}) => ({
  query: {
    pages: {
      "42": {
        title: "File:Monstera deliciosa.jpg",
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg",
            mime: "image/jpeg",
            extmetadata: Object.fromEntries(
              Object.entries({
                LicenseShortName: "CC BY-SA 4.0",
                LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
                Artist: '<a href="//commons.wikimedia.org/wiki/User:Anna">Anna Beispiel</a>',
                ...meta,
              }).map(([k, v]) => [k, { value: v }]),
            ),
            ...extra,
          },
        ],
      },
    },
  },
});

describe("US-WUN-04 which addresses count as a Wikimedia Commons file", () => {
  it("accepts the file page and the upload address and names the same file", () => {
    expect(commonsTitle("https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg")).toBe(
      "File:Monstera deliciosa.jpg",
    );
    expect(
      commonsTitle("https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg"),
    ).toBe("File:Monstera deliciosa.jpg");
    expect(commonsTitle("https://commons.wikimedia.org/wiki/File:Caf%C3%A9_Pflanze.png")).toBe(
      "File:Café Pflanze.png",
    );
  });

  it("refuses every other host, scheme and shape, so nothing foreign is ever fetched (no hotlink, no SSRF)", () => {
    for (const url of [
      "http://commons.wikimedia.org/wiki/File:A.jpg",
      "https://example.com/wiki/File:A.jpg",
      "https://commons.wikimedia.org.evil.test/wiki/File:A.jpg",
      "https://user:pw@commons.wikimedia.org/wiki/File:A.jpg",
      "https://commons.wikimedia.org/wiki/Category:Plants",
      "https://upload.wikimedia.org/wikipedia/en/a/ab/A.jpg",
      "https://de.wikipedia.org/wiki/Datei:A.jpg",
      "not a url",
    ])
      expect(commonsTitle(url), url).toBeNull();
  });

  it("asks the Commons API for url, license and author of exactly that file", () => {
    expect(commonsRequest("File:A b.jpg")).toMatchObject({
      source: "commons",
      path: "/w/api.php",
      query: { action: "query", titles: "File:A b.jpg", prop: "imageinfo", format: "json" },
    });
  });
});

describe("US-WUN-04 license and source are read from the answer, never guessed", () => {
  it("returns the download address, license and a credit with author and file page", () => {
    const r = readCommons(page());
    expect(r).toEqual({
      ok: true,
      file: {
        downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg",
        license: "CC BY-SA 4.0",
        source: "Anna Beispiel, https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg",
      },
    });
  });

  it.each(["CC0", "CC0 1.0", "Public domain", "PD-old-70", "CC BY 2.0", "CC BY-SA 3.0 de"])(
    "accepts the license %s",
    (license) => {
      expect(readCommons(page({}, { LicenseShortName: license })).ok).toBe(true);
    },
  );

  it.each(["CC BY-NC 4.0", "CC BY-ND 2.0", "GFDL", "Fair use", "All rights reserved", ""])(
    "refuses the license %j: not free to store",
    (license) => {
      expect(readCommons(page({}, { LicenseShortName: license }))).toEqual({
        ok: false,
        reason: "license_unsupported",
      });
    },
  );

  it("an answer without license information is refused, not assumed free", () => {
    const empty = page();
    const info = empty.query.pages["42"]?.imageinfo[0] as { extmetadata: object };
    info.extmetadata = {};
    expect(readCommons(empty)).toEqual({ ok: false, reason: "license_unsupported" });
  });

  it("a file marked non-free is refused whatever it claims", () => {
    expect(readCommons(page({}, { NonFree: "true" }))).toEqual({
      ok: false,
      reason: "license_unsupported",
    });
  });

  it("a missing file or an unreadable answer is not found, and the download must stay on Wikimedia", () => {
    expect(readCommons({ query: { pages: { "-1": { missing: "" } } } })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(readCommons("nonsense")).toEqual({ ok: false, reason: "not_found" });
    expect(readCommons(page({ url: "https://evil.test/x.jpg" }))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("without an author the credit names the file page only (unknown stays unknown, P-08)", () => {
    const r = readCommons(page({}, { Artist: "" }));
    expect(r.ok && r.file.source).toBe(
      "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg",
    );
  });

  it("a long credit never exceeds the 300 characters the wish keeps", () => {
    const long = readCommons(page({}, { Artist: "A".repeat(500) }));
    expect(long.ok && long.file.source.length).toBeLessThanOrEqual(300);
    const huge = readCommons(
      page({ descriptionurl: `https://commons.wikimedia.org/wiki/File:${"x".repeat(400)}.jpg` }),
    );
    expect(huge).toEqual({ ok: false, reason: "not_found" });
  });
});
