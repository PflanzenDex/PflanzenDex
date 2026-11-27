import { renderToString as render } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { PhasesList } from "./phases-list";
import { Entry } from "./entry/entry";
import { loadCarePhases } from "../../shared/api/care-phases-api";
import { plain } from "@/shared/testing/plain-text";

/** The text of rendered markup, as a keeper reads it (the dot of a meta line follows a no-break space, issue 2606). */
const textOf = (html: string) => plain(html.replace(/<[^>]*>/g, ""));

const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
/** A compact row opens its plant with the router of the page around it (US-QS-19). */
const inRouter = (e: Parameters<typeof render>[0]) =>
  renderToString(<MemoryRouter>{e}</MemoryRouter>);
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const locations: LightLocation[] = [
  { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" },
];
const row = (extra: Partial<PhasesRow> = {}): PhasesRow => ({
  specimenId: "e1",
  name: "Bogenhanf",
  marker: null,
  speciesName: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
  photo: null,
  ...extra,
});

describe("US-PHA-01 client of the care phases API", () => {
  it("US-PHA-01 asks with bearer token and the time zone of the device", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { phases: [row()] }));
    const r = await loadCarePhases("http://api", "tok", fetchFn);
    expect(r).toMatchObject({ ok: true, value: [{ specimenId: "e1" }] });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(String(url)).toBe(`http://api/care-phases?timeZone=${encodeURIComponent(zone)}`);
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("US-PHA-01 an error of the API stays an error with code", async () => {
    const error = { code: "input.invalid", text: "Die Eingabe ist ungültig." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(400, { error }));
    expect(await loadCarePhases("http://api", "tok", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
  });
});

describe("US-PHA-01 list of the care phases", () => {
  it("US-PHA-01 shows phase, location and unknown target location per specimen (P-08)", () => {
    const h = renderToString(<PhasesList rows={[row()]} locations={locations} />);
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Pflegephase heute: Ruhephase");
    expect(h).toContain("Standort: Regal Süd");
    expect(h).toContain("Soll-Standort: unbekannt");
  });

  it("US-PHA-01 growth phase is named as such", () => {
    const h = renderToString(<PhasesList rows={[row({ phase: "growth" })]} locations={[]} />);
    expect(h).toContain("Pflegephase heute: Wachstumsphase");
    expect(h).toContain("Standort: unbekannt");
  });

  it("US-PHA-01 empty list says what to do (P-09)", () => {
    const h = renderToString(<PhasesList rows={[]} locations={[]} />);
    expect(h).toContain("Noch keine Pflanze hat eine Phase.");
    expect(h).toContain("Pflanze anlegen");
  });
});

describe("US-PHA-04 next phase change in the list", () => {
  const show = (nextChange: PhasesRow["nextChange"]) =>
    renderToString(<PhasesList rows={[row({ nextChange })]} locations={locations} />);

  it("US-PHA-04 a change today says 'heute'", () => {
    expect(show({ date: "2026-11-01", phase: "dormancy", days: 0 })).toContain(
      "Nächster Wechsel zur Ruhephase: heute",
    );
  });

  it("US-PHA-04 up to 14 days ahead: in N days with the date", () => {
    expect(show({ date: "2026-10-06", phase: "growth", days: 1 })).toContain(
      "Nächster Wechsel zur Wachstumsphase: in 1 Tag (06.10.2026)",
    );
    expect(show({ date: "2026-10-19", phase: "dormancy", days: 14 })).toContain(
      "Nächster Wechsel zur Ruhephase: in 14 Tagen (19.10.2026)",
    );
  });

  it("US-PHA-04 more than 14 days ahead: only the date", () => {
    const h = show({ date: "2026-10-20", phase: "dormancy", days: 15 });
    expect(h).toContain("Nächster Wechsel zur Ruhephase: 20.10.2026");
    expect(h).not.toContain("in 15 Tagen");
  });

  it("US-PHA-04 without a change in this and the next year it says so and what to check (P-08, P-09)", () => {
    const h = show(null);
    expect(h).toContain("Nächster Phasenwechsel: keiner in diesem und im nächsten Jahr.");
    expect(h).toContain("Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art.");
  });
});

describe("US-QS-19 compact entry hints (P-10)", () => {
  it("US-QS-19 two hints show the first and a visible count, the others stay reachable", () => {
    const h = inRouter(
      <Entry
        bare
        row={row({ nextChange: null })}
        locations={locations}
        busy={false}
        onConfirm={undefined}
      />,
    );
    expect(h).toContain("Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art.");
    expect(h).toContain("+1 weitere");
    expect(h).toContain("Wähle im Pflegeprofil der Art einen Soll-Standort");
  });
});

describe("US-QS-32 the phase row is the plant row: its own name, its species, one change line (SG-LIST-03, SG-LIST-07)", () => {
  /** The class names of the element whose text starts with `text` (the badge or line the text sits in). */
  const classOf = (html: string, text: string): string[] => {
    const at = html.indexOf(`>${text}`);
    const open = at < 0 ? -1 : html.lastIndexOf('class="', at);
    if (open < 0) return [];
    const start = open + 'class="'.length;
    return html.slice(start, html.indexOf('"', start)).split(" ");
  };
  const home: LightLocation[] = [
    ...locations,
    { id: "s2", name: "Keller", lightZoneId: null, kind: "indoor" },
  ];
  const onlyRow = (extra: Partial<PhasesRow>, onConfirm?: () => void) =>
    inRouter(
      <Entry
        bare
        row={row(extra)}
        locations={home}
        busy={false}
        onConfirm={onConfirm === undefined ? undefined : () => onConfirm()}
      />,
    );

  it("US-QS-32 a plant with its own name shows that name as the title and its species in the one meta line", () => {
    const h = onlyRow({ name: "Bogenhanf – Ableger", marker: "Ableger", speciesName: "Bogenhanf" });
    expect(h).toContain(">Ableger<");
    expect(textOf(h)).toContain("Bogenhanf · Nächster Wechsel zur Wachstumsphase: 16.03.2027");
  });

  it("US-QS-32 a plant without its own name shows its name as the title and no species again (SG-LIST-07)", () => {
    const h = onlyRow({});
    expect(h).toContain(">Bogenhanf<");
    expect(h).toContain("Nächster Wechsel zur Wachstumsphase: 16.03.2027");
    expect(h).not.toContain("· Bogenhanf");
  });

  it("US-QS-32 the phase row says 'Pflegephase' and never 'Soll-Phase' (SG-COPY-03)", () => {
    expect(onlyRow({})).not.toContain("Soll-Phase");
  });

  it("US-QS-32 a plant in place shows no place: neither the location nor a badge (owner answer Q-82)", () => {
    const h = onlyRow({ locationId: "s2", targetLocationId: "s2" });
    expect(h).not.toContain("Standort");
    expect(h).not.toContain("Weicht ab");
  });

  it("US-QS-32 a plant off its target shows 'Weicht ab' as the one trailing badge, amber (Q-36)", () => {
    const h = onlyRow({ locationId: "s1", targetLocationId: "s2" });
    expect(classOf(h, "Weicht ab")).toContain("bg-warning");
    expect(h).not.toContain("Abweichung");
    expect(h).not.toContain("Standort: Regal Süd");
  });

  it("US-QS-32 (issue 2150) a missing location is no badge: the row names 'Kein Standort' in a neutral chip, never amber (SG-COLOR-04)", () => {
    const h = onlyRow({ locationId: null, targetLocationId: "s2" });
    expect(h).not.toContain("Standort fehlt");
    expect(classOf(h, "Kein Standort")).toContain("bg-secondary");
    expect(classOf(h, "Kein Standort")).not.toContain("bg-warning");
  });

  it("US-QS-32 a plant that has to move shows the 'Umstellen' button, and only that as its trailing element", () => {
    const h = onlyRow({ locationId: "s1", targetLocationId: "s2" }, () => undefined);
    expect(h).toContain("Umstellen");
    expect(h).not.toContain("Weicht ab");
  });

  it("US-QS-32 the full entry keeps its wording, only the compact row changes", () => {
    const h = renderToString(
      <Entry
        row={row({ locationId: "s1", targetLocationId: "s2" })}
        locations={home}
        busy={false}
        onConfirm={undefined}
      />,
    );
    expect(h).toContain("Pflegephase heute: Ruhephase");
    expect(h).toContain("Weicht ab: steht am Standort");
  });

  it("US-QS-32 (issue 2150) the hint chip is neutral: 'Kein Standort' names the next step of a missing entry and carries no warning class (SG-COLOR-04)", () => {
    const h = onlyRow({ locationId: null, targetLocationId: "s2" });
    const chip = classOf(h, "Kein Standort");
    expect(chip).toContain("bg-secondary");
    expect(chip).toContain("text-foreground");
    expect(chip).not.toContain("bg-warning");
    expect(chip).not.toContain("text-warning-foreground");
    expect(chip).not.toContain("border-warning-border");
  });
});

describe("US-QS-32 the meta line of a phase row: species first, then the forecast or the target (Q-68, Q-82)", () => {
  const home: LightLocation[] = [
    ...locations,
    { id: "s2", name: "Keller", lightZoneId: null, kind: "indoor" },
  ];
  /** A compact row; `switchable` gives it the action of a move (the list with a confirmation). */
  const rowWith = (extra: Partial<PhasesRow>, switchable = false) =>
    inRouter(
      <Entry
        bare
        row={row(extra)}
        locations={home}
        busy={false}
        onConfirm={switchable ? () => undefined : undefined}
      />,
    );

  it("US-QS-32 the forecast is the US-PHA-04 text: 'heute' on the day of the change", () => {
    expect(rowWith({ nextChange: { date: "2026-11-01", phase: "dormancy", days: 0 } })).toContain(
      "Nächster Wechsel zur Ruhephase: heute",
    );
  });

  it("US-QS-32 without a change in this and the next year the row says so with the list's own text (P-08)", () => {
    expect(rowWith({ nextChange: null })).toContain(
      "Nächster Phasenwechsel: keiner in diesem und im nächsten Jahr.",
    );
  });

  it("US-QS-32 a plant with its own name: its species comes first, then the forecast", () => {
    expect(textOf(rowWith({ name: "Bogenhanf – Ableger", marker: "Ableger" }))).toContain(
      "Bogenhanf · Nächster Wechsel zur Wachstumsphase: 16.03.2027",
    );
  });

  it("US-QS-32 a plant that has to move names its target in the meta line, not the forecast, and keeps 'Umstellen'", () => {
    const h = rowWith({ locationId: "s1", targetLocationId: "s2" }, true);
    expect(h).toContain("Soll-Standort: Keller");
    expect(h).not.toContain("Nächster Wechsel");
    expect(h).toContain("Umstellen");
  });

  it("US-QS-32 a moving plant with its own name reads 'species · Soll-Standort: target'", () => {
    expect(
      textOf(
        rowWith(
          {
            name: "Bogenhanf – Ableger",
            marker: "Ableger",
            locationId: "s1",
            targetLocationId: "s2",
          },
          true,
        ),
      ),
    ).toContain("Bogenhanf · Soll-Standort: Keller");
  });

  it("US-QS-32 a missing location with a target keeps the switch hint: the place fact moves into the action (P-10)", () => {
    const h = rowWith({ locationId: null, targetLocationId: "s2" }, true);
    expect(h).toContain("Stelle die Pflanze an den Soll-Standort und tippe dann „Umstellen“.");
    expect(h).toContain("Soll-Standort: Keller");
    expect(h).not.toContain("Standort fehlt");
  });

  it("US-QS-32 (issue 2150) a missing location without a switch names 'Kein Standort' and offers 'Standort setzen', no badge (P-09, P-10)", () => {
    const h = rowWith({ locationId: null, targetLocationId: "s2" });
    expect(h).toContain("Kein Standort");
    expect(h).toContain("Standort setzen: Bogenhanf");
    expect(h).not.toContain("Standort fehlt");
    expect(h).not.toContain("Weise der Pflanze unter „Hinweise“");
  });
});

describe("US-QS-32 the full entry: a missing location is bold neutral text, the deviation paragraph stays amber", () => {
  const home: LightLocation[] = [
    ...locations,
    { id: "s2", name: "Keller", lightZoneId: null, kind: "indoor" },
  ];
  const classOf = (html: string, text: string): string[] => {
    const at = html.indexOf(`>${text}`);
    const open = at < 0 ? -1 : html.lastIndexOf('class="', at);
    if (open < 0) return [];
    const start = open + 'class="'.length;
    return html.slice(start, html.indexOf('"', start)).split(" ");
  };

  it("US-QS-32 a missing location is bold neutral text in the full entry too, and the full deviation paragraph stays amber", () => {
    const missing = renderToString(
      <ul>
        <Entry
          row={row({ locationId: null, targetLocationId: "s2" })}
          locations={home}
          busy={false}
          onConfirm={undefined}
        />
      </ul>,
    );
    expect(classOf(missing, "Standort fehlt")).toContain("font-semibold");
    expect(classOf(missing, "Standort fehlt")).not.toContain("bg-warning");
    const deviating = renderToString(
      <ul>
        <Entry
          row={row({ locationId: "s1", targetLocationId: "s2" })}
          locations={home}
          busy={false}
          onConfirm={undefined}
        />
      </ul>,
    );
    expect(classOf(deviating, "Weicht ab")).toContain("bg-warning");
  });
});
