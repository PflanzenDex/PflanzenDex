// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { growthTrend, type GrowthTrend, type MeasurementView } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, type Response as ApiResponse } from "@/shared/data";
import { growthLines } from "../../measure/measurement-header/growth-summary/growth-text";
import { GROWTH_READINGS, UNMEASURED_READINGS } from "./growth-frame/growth-frame";
import { PlantGrowth } from "./plant-growth";
import { PlantGrowthSkeleton } from "./plant-growth.skeleton";

// The trend of the overview is loaded through the measure view of the specimen (US-QS-23, US-QS-32).
const answer = vi.hoisted(() => ({
  load: (): Promise<unknown> => new Promise(() => undefined),
}));
vi.mock("../../shared/api/measurements-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shared/api/measurements-api")>()),
  loadMeasurementView: () => answer.load(),
}));

afterEach(cleanup);

const token = async () => "tok";
const never = () => new Promise<never>(() => undefined);
const loadedWith =
  (growth: GrowthTrend): (() => Promise<ApiResponse<MeasurementView>>) =>
  async () => ({ ok: true, value: { growth } as unknown as MeasurementView });

function renderGrowth(extra: { measured?: boolean } = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <PlantGrowth api="http://api.test" token={token} specimenId="specimen-1" {...extra} />
    </QueryClientProvider>,
  );
}

/** The sizer copies of the frame: the invisible, aria-hidden readings (US-QS-32). */
function sizers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('div[aria-hidden="true"].invisible > p'));
}

/**
 * The text a copy draws, read from its `data-reading` attributes: the copies hold no text node, so their text is in
 * attributes and CSS only (US-QS-32).
 */
function drawn(copy: HTMLElement): string {
  return Array.from(copy.querySelectorAll<HTMLElement>("[data-reading]"))
    .map((span) => span.dataset["reading"] ?? "")
    .join("");
}

/** The visible cell of the frame: its last child, after the sizer copies. */
function visibleCell(frame: HTMLElement): HTMLElement {
  const cell = frame.lastElementChild;
  if (!(cell instanceof HTMLElement)) throw new Error("the frame has no visible cell");
  return cell;
}

/**
 * The wording of a line with its rate's digits left out: the frame reserves its readings with one sample rate, so a
 * loaded line is compared by its words and its trend (US-QS-32).
 */
const wording = (text: string | null | undefined): string =>
  (text ?? "").replace(/[\d.,]+\scm\/Jahr/, "RATE");

const GROWING: GrowthTrend = { count: 3, ratePerYear: 13.8, trend: "faster", signal: "success" };

/**
 * Courses of measurements that `growthTrend` derives (US-WAC-03, US-WAC-04): 0 to 4 measurements, on one day or on
 * several, with each shape of trend, the last one healthy or etiolated.
 */
const DAYS = ["2026-01-01", "2026-04-11", "2026-07-20", "2026-10-28"] as const;
const SHAPES: Record<string, number[]> = {
  stable: [10, 20, 30, 40],
  faster: [10, 11, 12, 30],
  slower: [10, 20, 30, 31],
  flat: [5, 5, 5, 5],
};
function derivedCourses() {
  return Object.entries(SHAPES).flatMap(([shape, values]) =>
    Array.from({ length: values.length + 1 }, (_, n) => n).flatMap((n) =>
      [false, true].flatMap((sameDay) =>
        (["healthy", "etiolated"] as const).map((last) => ({
          name: `${shape} n=${n} sameDay=${sameDay} last=${last}`,
          points: values.slice(0, n).map((value, i) => ({
            date: sameDay ? DAYS[0] : (DAYS[i] ?? DAYS[0]),
            value,
            quality: i === n - 1 ? last : ("healthy" as const),
          })),
        })),
      ),
    ),
  );
}

describe("US-QS-32 the growth line reserves its final height in every state (issue 2318)", () => {
  it("US-QS-32 the frame holds the sizer of every reading while the trend loads, before the status shows", () => {
    answer.load = never;
    const { container } = renderGrowth();
    const frame = container.firstElementChild as HTMLElement;
    expect(sizers(frame)).toHaveLength(GROWTH_READINGS.length);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-32 exactly one status while the trend loads, after the delay", async () => {
    answer.load = never;
    renderGrowth();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Trend wird geladen …");
  });

  it.each([
    ["no measurement", { count: 0, ratePerYear: null, trend: null, signal: null }],
    ["one measurement", { count: 1, ratePerYear: null, trend: null, signal: null }],
    [
      "two measurements on the same day",
      { count: 2, ratePerYear: null, trend: null, signal: null },
    ],
    ["two measurements", { count: 2, ratePerYear: 36.5, trend: null, signal: null }],
    ["three without a usable trend", { count: 3, ratePerYear: 20, trend: null, signal: null }],
    ["a slower trend", { count: 4, ratePerYear: 20, trend: "slower", signal: null }],
    ["a stable trend", { count: 4, ratePerYear: 20, trend: "stable", signal: null }],
    ["a faster trend with the success signal", GROWING],
    [
      "an etiolated last measurement",
      { count: 3, ratePerYear: 20, trend: "faster", signal: "etiolated" },
    ],
    [
      "one etiolated measurement",
      { count: 1, ratePerYear: null, trend: null, signal: "etiolated" },
    ],
  ] as const)(
    "US-QS-32 the loaded reading (%s) renders in the same frame, as one of the reserved readings",
    async (_name, growth) => {
      answer.load = loadedWith(growth);
      const { container } = renderGrowth();
      const frame = container.firstElementChild as HTMLElement;
      await waitFor(() => expect(visibleCell(frame).querySelector("p")).not.toBeNull());
      const loaded = visibleCell(frame).querySelector("p")?.textContent ?? "";
      expect(loaded).toContain("Wachstum:");
      expect(sizers(frame)).toHaveLength(GROWTH_READINGS.length);
      expect(sizers(frame).map((p) => wording(drawn(p)))).toContain(wording(loaded));
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it("US-QS-32 the sizer text is hidden from assistive technology", () => {
    answer.load = never;
    const { container } = renderGrowth();
    const copies = sizers(container);
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy.parentElement?.getAttribute("aria-hidden")).toBe("true");
      expect(copy.parentElement?.classList.contains("invisible")).toBe(true);
      expect(copy.getAttribute("role")).toBeNull();
      expect(copy.matches("[tabindex], a, button, input")).toBe(false);
      // No text node in the copy: its words are attributes that CSS draws (US-QS-32).
      expect(copy.textContent).toBe("");
    }
    expect(screen.queryAllByText(/Wachstum:|Trend:/)).toHaveLength(0);
  });

  it("US-QS-32 getByText finds a loaded trend as exactly one element, the reserved copies do not match", async () => {
    answer.load = loadedWith({ count: 4, ratePerYear: 20, trend: "stable", signal: null });
    renderGrowth();
    expect(await screen.findByText("Trend: stabil")).toBeTruthy();
    expect(screen.getAllByText("Trend: stabil")).toHaveLength(1);
    expect(screen.getAllByText(/Trend: stabil/)).toHaveLength(1);
    expect(screen.getByText("Wachstum: 20 cm/Jahr")).toBeTruthy();
  });

  it("US-QS-32 the chunk fallback reserves the same sizer and shows one status after the delay", async () => {
    answer.load = never;
    const loading = renderGrowth();
    const loadingTexts = sizers(loading.container).map((p) => drawn(p));
    loading.unmount();

    const fallback = render(<PlantGrowthSkeleton label="Lädt …" />);
    expect(sizers(fallback.container)).toHaveLength(GROWTH_READINGS.length);
    expect(screen.queryByRole("status")).toBeNull();
    const status = await screen.findByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status.textContent).toContain("Lädt …");
    expect(sizers(status).map((p) => drawn(p))).toEqual(loadingTexts);
  });

  it("US-QS-32 the reserved readings cover every reading the core derives from a course, but the same-day etiolated ones (P-08)", () => {
    const key = (growth: GrowthTrend) => {
      const lines = growthLines(growth);
      return `${wording(lines.rate)}\u0000${lines.trend}`;
    };
    const reserved = new Set(GROWTH_READINGS.map(key));
    const missing = derivedCourses()
      .filter((course) => !reserved.has(key(growthTrend(course.points))))
      .map((course) => course.name);
    // The one allowed exception (owner decision 2026-11-20, issue 2318, option b): measurements that all fall on one day, the
    // last one etiolated. Two of them give this reading; three or four give the same wording, so the same height. Any other
    // derived reading that is not reserved fails this test.
    expect(missing).toEqual(
      Object.keys(SHAPES).flatMap((shape) =>
        [2, 3, 4].map((n) => `${shape} n=${n} sameDay=true last=etiolated`),
      ),
    );
  });
});

describe("US-QS-23 the growth line of a plant without a measurement reserves one line only (issue 2384)", () => {
  const NONE: GrowthTrend = { count: 0, ratePerYear: null, trend: null, signal: null };

  it("US-QS-23 the unmeasured frame holds one sizer, the reading 'no measurement', and the measured frame still holds every reading (US-QS-32)", () => {
    answer.load = never;
    const unmeasured = renderGrowth({ measured: false });
    const copies = sizers(unmeasured.container);
    expect(copies).toHaveLength(1);
    expect(UNMEASURED_READINGS).toHaveLength(1);
    expect(drawn(copies[0] as HTMLElement)).toContain("noch keine Messung");
    unmeasured.unmount();
    const measured = renderGrowth({ measured: true });
    expect(sizers(measured.container)).toHaveLength(GROWTH_READINGS.length);
    expect(GROWTH_READINGS.length).toBeGreaterThan(1);
    measured.unmount();
    // Without the flag the frame keeps every reading, as before.
    expect(sizers(renderGrowth().container)).toHaveLength(GROWTH_READINGS.length);
  });

  it("US-QS-23 the loaded 'no measurement' reading renders in the one-line frame, as the reading it reserves", async () => {
    answer.load = loadedWith(NONE);
    const { container } = renderGrowth({ measured: false });
    const frame = container.firstElementChild as HTMLElement;
    await waitFor(() => expect(visibleCell(frame).querySelector("p")).not.toBeNull());
    const loaded = visibleCell(frame).querySelector("p")?.textContent ?? "";
    expect(sizers(frame)).toHaveLength(1);
    expect(wording(drawn(sizers(frame)[0] as HTMLElement))).toBe(wording(loaded));
  });

  it("US-QS-23 the chunk fallback of a plant without a measurement reserves the same one sizer", () => {
    expect(
      sizers(render(<PlantGrowthSkeleton label="Lädt …" measured={false} />).container),
    ).toHaveLength(1);
    cleanup();
    expect(sizers(render(<PlantGrowthSkeleton label="Lädt …" />).container)).toHaveLength(
      GROWTH_READINGS.length,
    );
  });
});
