import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { START_SPECIES } from "../start-species.ts";
import { runCheckData } from "./check-cli.ts";
import { ALLOWED_HOSTS, NOTE_MAX, checkResearchData, issueLine } from "./check-data.ts";
import { readResearchData } from "./read-data.ts";

// US-ENT-09 (#1005): the researched start-catalog data is checked before `catalog:load` may write it. Every value needs
// a citable source on an allowed host, a free license and a retrieval date that is not in the future (P-08, E-25).
const START = ["Monstera deliciosa", "Epipremnum aureum"];
const TODAY = "2026-10-30";
const good = {
  value: true,
  sourceUrl: "https://en.wikipedia.org/w/index.php?title=Monstera_deliciosa&oldid=1",
  sourceName: "wikipedia",
  license: "CC-BY-SA-4.0",
  retrievedOn: "2026-10-29",
};
const file = (records: unknown, path = "batch-01/part-1.json") => ({ path, json: records });
const one = (attributes: Record<string, unknown>, species = "Monstera deliciosa") =>
  checkResearchData([file([{ species, attributes }])], START, TODAY);
const problems = (attributes: Record<string, unknown>) =>
  one(attributes).issues.map((i) => i.problem);

describe("US-ENT-09 catalog:check-data, the check of the researched data", () => {
  it("US-ENT-09: Given a light statement from the fixed value set, then it is accepted; outside the set it is refused", () => {
    const light = (value: unknown) => ({ lightDescription: { ...good, value } });
    expect(one(light("bright_indirect")).facts).toEqual([
      expect.objectContaining({ field: "lightDescription", value: "bright_indirect" }),
    ]);
    expect(problems(light("sunny"))).toEqual(["attribute.value_invalid"]);
  });

  it("US-ENT-09: Given a value with a citable source, https link, free license and date, then it is accepted as a fact", () => {
    const check = one({ toxicToPets: good, humidity: { ...good, value: "high" } });
    expect(check.issues).toEqual([]);
    expect(check.facts).toEqual([
      {
        species: "Monstera deliciosa",
        field: "toxicToPets",
        value: true,
        evidence: {
          source: "wikipedia",
          url: good.sourceUrl,
          license: "CC-BY-SA-4.0",
          retrievedAt: "2026-10-29",
        },
      },
      expect.objectContaining({ field: "humidity", value: "high" }),
    ]);
  });

  it("US-ENT-09 P-08: Given a species without an attribute, then the attribute stays unknown and nothing is invented", () => {
    const check = one({});
    expect(check.issues).toEqual([]);
    expect(check.facts).toEqual([]);
    expect(check.species).toBe(1);
  });

  it("US-ENT-09: Given a value without a source URL, then it is refused", () => {
    expect(problems({ toxicToPets: { ...good, sourceUrl: undefined } })).toEqual([
      "attribute.url_invalid",
    ]);
  });

  it("US-ENT-09: Given an http link, then it is refused", () => {
    expect(
      problems({ toxicToPets: { ...good, sourceUrl: "http://en.wikipedia.org/wiki/X" } }),
    ).toEqual(["attribute.url_invalid"]);
  });

  it("US-ENT-09 E-25: Given a host that is not a citable source (a commercial care site), then it is refused", () => {
    expect(
      problems({
        toxicToPets: { ...good, sourceUrl: "https://www.example-plantshop.com/monstera" },
      }),
    ).toEqual(["data.host_not_allowed"]);
  });

  it("US-ENT-09 E-25: Given a host that does not belong to the named source, then it is refused", () => {
    expect(
      problems({ toxicToPets: { ...good, sourceUrl: "https://www.wikidata.org/wiki/Q161077" } }),
    ).toEqual(["data.host_not_allowed"]);
    expect(Object.keys(ALLOWED_HOSTS)).toEqual([
      "gbif.org",
      "api.gbif.org",
      "wikidata.org",
      "www.wikidata.org",
      "de.wikipedia.org",
      "en.wikipedia.org",
      "commons.wikimedia.org",
    ]);
  });

  it("US-ENT-09 US-KI-06: Given an unknown source name (an AI statement), then it is refused", () => {
    expect(problems({ toxicToPets: { ...good, sourceName: "ai" } })).toEqual([
      "attribute.source_unknown",
      "data.host_not_allowed",
    ]);
  });

  it("US-ENT-09 E-25: Given a value without a free license or with a non-free one, then it is refused", () => {
    expect(problems({ toxicToPets: { ...good, license: undefined } })).toEqual([
      "attribute.license_missing",
    ]);
    expect(problems({ toxicToPets: { ...good, license: "CC-BY-NC-4.0" } })).toEqual([
      "attribute.license_missing",
    ]);
  });

  it("US-ENT-09: Given a retrieval date in the future or no valid date, then it is refused", () => {
    expect(problems({ toxicToPets: { ...good, retrievedOn: "2026-10-31" } })).toEqual([
      "data.date_in_future",
    ]);
    expect(problems({ toxicToPets: { ...good, retrievedOn: "30.10.2026" } })).toEqual([
      "attribute.date_invalid",
    ]);
  });

  it("US-ENT-09: Given an attribute DM-ENT-01 does not know, then it is refused", () => {
    expect(problems({ lightNeed: good })).toEqual(["attribute.field_unknown"]);
  });

  it("US-ENT-09: Given a value outside the type or range of the field, then it is refused", () => {
    expect(problems({ minTemperature: { ...good, value: 45 } })).toEqual([
      "attribute.value_invalid",
    ]);
    expect(problems({ humidity: { ...good, value: "very high" } })).toEqual([
      "attribute.value_invalid",
    ]);
    expect(problems({ toxicToPets: { ...good, value: "yes" } })).toEqual([
      "attribute.value_invalid",
    ]);
  });

  it("US-ENT-09 E-25: Given an unknown key or an overlong note (running text), then it is refused", () => {
    expect(problems({ toxicToPets: { ...good, text: "The plant is …" } })).toEqual([
      "data.key_unknown",
    ]);
    expect(problems({ toxicToPets: { ...good, note: "x".repeat(NOTE_MAX + 1) } })).toEqual([
      "data.note_invalid",
    ]);
  });

  it("US-ENT-09: Given a species twice or a species outside the start list, then it is refused with file and species", () => {
    const check = checkResearchData(
      [
        file([{ species: "Monstera deliciosa", attributes: {} }]),
        file([{ species: "Monstera deliciosa", attributes: {} }], "batch-01/part-2.json"),
        file([{ species: "Ficus benjamina", attributes: {} }], "batch-01/part-3.json"),
      ],
      START,
      TODAY,
    );
    expect(check.issues.map(issueLine)).toEqual([
      "batch-01/part-2.json: Monstera deliciosa: data.species_duplicate",
      "batch-01/part-3.json: Ficus benjamina: data.species_not_in_start_list",
    ]);
  });

  it("US-ENT-09 P-10: Given one bad value, then every problem is named with file and attribute and no fact is passed on", () => {
    const check = checkResearchData(
      [
        file([
          { species: "Monstera deliciosa", attributes: { toxicToPets: good } },
          { species: "Epipremnum aureum", attributes: { humidity: { ...good, license: "x" } } },
        ]),
      ],
      START,
      TODAY,
    );
    expect(check.issues.map(issueLine)).toEqual([
      "batch-01/part-1.json: Epipremnum aureum / humidity: attribute.value_invalid",
      "batch-01/part-1.json: Epipremnum aureum / humidity: attribute.license_missing",
    ]);
    expect(check.facts).toEqual([]);
  });

  it("US-ENT-09: Given a file that is not JSON or not a list of records, then it is refused", () => {
    const check = checkResearchData(
      [file(undefined), file({ species: "x" }, "b.json"), file([{ species: 1 }], "c.json")],
      START,
      TODAY,
    );
    expect(check.issues.map((i) => i.problem)).toEqual([
      "data.json_invalid",
      "data.format_invalid",
      "data.format_invalid",
    ]);
  });

  it("US-ENT-09: Given a data folder, when the command runs, then it reads every file and exits 1 on a problem", () => {
    const dir = mkdtempSync(join(tmpdir(), "research-"));
    mkdirSync(join(dir, "batch-01"));
    writeFileSync(
      join(dir, "batch-01", "part-1.json"),
      JSON.stringify([{ species: "Monstera deliciosa", attributes: { toxicToPets: good } }]),
    );
    writeFileSync(join(dir, "batch-01", "part-2.json"), "{ not json");
    const out: string[] = [];
    const code = runCheckData({
      readData: () => readResearchData(dir),
      startList: START,
      out: (l) => out.push(l),
      now: () => new Date("2026-10-30T10:00:00"),
    });
    expect(code).toBe(1);
    expect(out).toEqual([
      "batch-01/part-2.json: data.json_invalid",
      "Research data refused: 1 problems in 2 files.",
    ]);
  });

  it("US-ENT-09: Given the data folder of the repo, then every value passes the check against the start list", () => {
    const out: string[] = [];
    const code = runCheckData({
      readData: () => readResearchData(),
      startList: START_SPECIES.map((s) => s.latin),
      out: (l) => out.push(l),
      now: () => new Date(),
    });
    expect(out.at(-1)).toMatch(/^Research data ok: \d+ files, \d+ species, \d+ values\.$/);
    expect(code).toBe(0);
  });
});
