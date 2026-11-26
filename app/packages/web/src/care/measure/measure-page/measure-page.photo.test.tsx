// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { MeasurePage } from "./measure-page";

// US-QS-15 (owner decision 2026-11-22, issue 2424): "Foto" of the quick actions of the plant layer opens the measure form with the photo picker
// started. The form is the existing one, no new write: the keeper still enters a value and saves.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const specimen = { id: "e1", name: "Bogenhanf" };

function fakeServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            specimenId: "e1",
            growthMeasure: "height",
            etiolationSigns: null,
            measurements: [],
            last: null,
            lastRating: null,
            growth: { count: 0, ratePerYear: null, trend: null, signal: null },
          }),
          { status: 200 },
        ),
    ),
  );
}

function show(props: { startWithPhoto?: boolean; onPhotoStarted?: () => void } = {}) {
  const view = (extra: typeof props) => (
    <MemoryRouter>
      <LayerHost>
        <MeasurePage
          api="http://api"
          token={async () => "tok"}
          specimen={specimen}
          onBack={vi.fn()}
          {...extra}
        />
      </LayerHost>
    </MemoryRouter>
  );
  const result = render(view(props));
  return { ...result, again: (extra: typeof props) => result.rerender(view(extra)) };
}

describe("US-QS-15 · issue 2424 the measure form opens with the photo picker started when the keeper chose Foto", () => {
  it("US-QS-15 · issue 2424 Mehr Angaben is open, the photo field has the focus and its picker is started once, which the page reports", async () => {
    fakeServer();
    setViewportWidth(360);
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const onPhotoStarted = vi.fn();
    show({ startWithPhoto: true, onPhotoStarted });
    const choose = await screen.findByLabelText("Foto wählen");
    const more = screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement;
    expect(more.open).toBe(true);
    expect(document.activeElement).toBe(choose);
    expect(click.mock.contexts.filter((input) => input === choose)).toHaveLength(1);
    expect(onPhotoStarted).toHaveBeenCalledTimes(1);
  });

  it("US-QS-15 · issue 2424 the picker starts once: once the page has reported it, a new render of the form does not start it again or close Mehr Angaben", async () => {
    fakeServer();
    setViewportWidth(360);
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const view = show({ startWithPhoto: true, onPhotoStarted: vi.fn() });
    const choose = await screen.findByLabelText("Foto wählen");
    view.again({ startWithPhoto: false });
    expect(click.mock.contexts.filter((input) => input === choose)).toHaveLength(1);
    expect((screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement).open).toBe(
      true,
    );
  });

  it("US-QS-15 · issue 2424 without Foto the form opens as before: Mehr Angaben closed, no picker, no focus on the photo field", async () => {
    fakeServer();
    setViewportWidth(360);
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const onPhotoStarted = vi.fn();
    show({ onPhotoStarted });
    await screen.findByLabelText("Messwert (cm, in Schritten von 0,5)");
    const more = screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(onPhotoStarted).not.toHaveBeenCalled();
  });
});
