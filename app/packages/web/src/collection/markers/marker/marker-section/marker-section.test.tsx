// @vitest-environment jsdom
import { Suspense } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import type { ApiError } from "../../../../shared/data";
import { answerCardRead } from "../../../specimens/tests/cards-fake";
import type { CreateFields } from "../../../specimens/model/schemas";
import { markerFormStart, type MarkerRule } from "../marker-rule";
import { MarkerSection } from "./marker-section";

// One plant of the species, without a marker: the keeper owns the species, so the rule requires a marker.
const OWNED = [
  {
    id: "e5",
    name: "Monstera deliciosa",
    speciesId: "sp1",
    location: "Zuhause",
    caughtAt: "2026-02-01",
    marker: null,
  },
];

function stubCards(list: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      async (url) =>
        answerCardRead(new URL(String(url)), list as SpecimenCard[]) ??
        new Response("{}", { status: 404 }),
    ),
  );
}

/** The flow's side: it owns the form and receives the rule the section reports. */
function Harness(props: { report: (rule: MarkerRule | null) => void; refusal?: ApiError | null }) {
  const form = useForm<CreateFields>({ defaultValues: markerFormStart("2026-11-08") });
  return (
    <Suspense fallback={null}>
      <MarkerSection
        form={form}
        api="http://api"
        token={async () => "tok"}
        speciesId="sp1"
        speciesName="Monstera deliciosa"
        refusal={props.refusal ?? null}
        report={props.report}
      />
    </Suspense>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-03 · US-ONB-01 the marker section of step 2 (issue 1638)", () => {
  it("US-BES-03 · US-ONB-01 the section reports the rule of the chosen species to its flow and null once it leaves the step (issue 1638)", async () => {
    stubCards(OWNED);
    const report = vi.fn<(rule: MarkerRule | null) => void>();
    const { unmount } = render(<Harness report={report} />);
    expect(await screen.findByLabelText("Kennzeichen")).toBeTruthy();
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ required: true, missing: [] }),
    );
    unmount();
    expect(report).toHaveBeenLastCalledWith(null);
  });

  it("US-QS-15 · US-BES-03 the section shows the marker field for a refused marker the rule did not ask for (issue 1638)", async () => {
    stubCards([]);
    const report = vi.fn<(rule: MarkerRule | null) => void>();
    render(<Harness report={report} refusal={{ code: "specimen.marker_taken", text: "" }} />);
    expect(await screen.findByLabelText("Kennzeichen")).toBeTruthy();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ required: false }));
  });
});
