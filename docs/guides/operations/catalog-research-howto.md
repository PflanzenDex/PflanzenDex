# Researching start-catalog attributes

How to research the species attributes of the start catalog (US-ENT-09, issue #1005) so that `catalog:load` can bring them to the server. Research happens offline; the app itself never asks a foreign source for them. Loading and checking: `release-and-rollback.md`, section "Filling the catalog".

## Rules

- **Nothing sourced, nothing written.** A value goes in only when you read it yourself at the linked source. If no allowed source states it, leave the attribute out: it stays "unbekannt" (P-08). Never estimate, average, derive from the genus or take an AI answer as a fact (US-KI-06).
- **Allowed sources and hosts (E-25):** GBIF (`gbif.org`, `api.gbif.org`, `sourceName` `gbif`), Wikidata (`wikidata.org`, `www.wikidata.org`, `wikidata`), Wikipedia and Commons (`de.wikipedia.org`, `en.wikipedia.org`, `commons.wikimedia.org`, `wikipedia`). Commercial care sites, shops, blogs, forums and the ASPCA site itself are never a source, even when Wikipedia cites them.
- **Licenses:** only `CC0-1.0` (Wikidata, most GBIF API data), `CC-BY-4.0`, `CC-BY-SA-4.0` (Wikipedia text today), `CC-BY-SA-3.0` (older Wikipedia text). Name the license of the page you read.
- **Facts yes, running text no.** Store the value (`true`, `"high"`, `12`), never a sentence from the page. The optional `note` (at most 300 characters) says where on the page the fact stands ("Section Toxicity"), in your own words.
- **Link a fixed version.** For Wikipedia use the permanent link of the revision you read (`https://en.wikipedia.org/w/index.php?title=<Title>&oldid=<revid>`, "Permanent link" in the sidebar or `revid` from the API); for Wikidata the item page or `Special:EntityData/<Q>.json`; for GBIF the species page or API record.
- **Read Wikipedia through the API, not WebFetch.** Read the cited revision with `action=query&prop=revisions&revids=<revid>` (`rvprop=content`, `rvslots=main`; plain text: `prop=extracts`). WebFetch paraphrases and does not give verbatim sentences. Check every quote you cite as a substring of that text before you commit.
- **Direction of error decides `toxicToPets`.** `toxicToPets: true` (a warning) may rest on a clear statement of the Wikipedia revision, even when the article attributes it to the ASPCA; the note says so. `toxicToPets: false` (reassurance) needs a statement that names dogs or cats explicitly and does not rest on the ASPCA alone. Both concern the species itself (not the genus, hybrids or overwintering outdoors) and, for care attributes, indoor use.

## Which attribute, which source

Only the attributes of DM-ENT-01. The light need of DM-BES-01 (light zone) is not part of this data; what a source says about light is the attribute `lightDescription`, a statement only that never sets a zone (P-08).

| Attribute        | Values                                                | Where to look                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toxicToPets`    | `true` / `false`                                      | Wikipedia section "Toxicity" (or the German "Giftigkeit"). The direction-dependent rule is under Rules; "toxic to humans" alone never counts.              |
| `minTemperature` | °C, -30 to 30                                         | Wikipedia "Cultivation" (a stated minimum the plant tolerates). A hardiness zone alone is not a temperature. If the page gives several numbers (growth stops, frost kills), leave it out unless one is clearly the minimum. |
| `humidity`       | `low` / `medium` / `high`                             | Wikipedia "Cultivation" with an explicit statement about air humidity. Native habitat ("humid forest") is not a care need.                                                                                                  |
| `growthSize`     | `small` (< 0.5 m), `medium` (to 2 m), `large` (> 2 m) | **Not researched.** No research file carries `growthSize`. The job `catalog.fill_attributes` sets it from Wikidata P2048, the natural height of the species (not a pot size); the class limits are starting values (assumption, US-ENT-09).                                                                                             |
| `lightDescription` | `low` / `medium` / `bright_indirect` / `direct_sun` | Wikipedia "Cultivation" with an explicit statement about the light the plant needs indoors ("bright indirect light" = `bright_indirect`, "full sun" = `direct_sun`, "shade" or "low light" = `low`, "partial shade" = `medium`). Native habitat does not count. The value set is an assumption, revisable. |

GBIF and Wikidata rarely hold these five as structured values (checked for Monstera deliciosa, Epipremnum aureum and Dracaena trifasciata on 2026-10-30: none). Check them first anyway, then Wikipedia.

## File format

One file per part: `app/packages/api/src/catalog/load/research/data/batch-NN/part-N.json`, at most 5 parts per batch folder and about 6 species per part (files stay under 200 lines). Names in kebab case. Each file is a JSON list:

```json
[
  {
    "species": "Monstera deliciosa",
    "attributes": {
      "toxicToPets": {
        "value": true,
        "sourceUrl": "https://en.wikipedia.org/w/index.php?title=Monstera_deliciosa&oldid=1374208594",
        "sourceName": "wikipedia",
        "license": "CC-BY-SA-4.0",
        "retrievedOn": "2026-10-30",
        "note": "Section Toxicity: states the plant is moderately toxic to cats and dogs."
      }
    }
  }
]
```

`species` is the Latin name exactly as in the start list (`app/packages/api/src/catalog/load/start-species.ts`), also when the source uses a newer name (say so in the note). Each species appears once over all files. `retrievedOn` is the day you read the page (YYYY-MM-DD).

## Checklist before the commit

1. `npm run catalog:check-data -w @pflanzendex/api` prints "Research data ok" (it names file, species and attribute for every problem).
2. Every link opens the version you read and the value stands there; toxicity and minimum temperature are checked twice.
3. No sentence copied from a page; notes are short and your own.
4. Attributes you could not source are absent, not guessed.
5. `make ci`, then the PR lists the species and fields added, for the human review (toxicity and minimum temperature first).
