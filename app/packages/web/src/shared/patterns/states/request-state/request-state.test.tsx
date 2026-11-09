// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SKELETON_DELAY_MS,
  STATUS_HOLD_MS,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { RequestState } from "./request-state";

afterEach(cleanup);

const props = { onRetry: () => undefined, skeleton: <p role="status">Lädt</p> };
/** A shaped skeleton of a list: one status with its loading text, decorative blocks (DS-52, DS-56). */
const shaped = (
  <SkeletonGroup label="Liste wird geladen …">
    <Skeleton className="h-8 w-full" />
  </SkeletonGroup>
);

describe("US-QS-09 · RequestState page heading (1.3.1, 2.4.6)", () => {
  it("US-QS-09 a failed page keeps its main heading above the error and the retry", () => {
    render(
      <RequestState {...props} status="error" errorText="Nicht erreichbar." heading="Sammlung" />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Nicht erreichbar.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-09 without a heading the error adds none, so a section never gets a second h1", () => {
    render(<RequestState {...props} status="error" />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("US-QS-07 · RequestState loading without a skeleton (DS-56)", () => {
  it("US-QS-07 pending without a skeleton shows the PlantLoader as the one loading status", async () => {
    render(<RequestState onRetry={() => undefined} status="pending" />);
    expect(await screen.findAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Lädt…");
  });
});

describe("US-QS-14 · RequestState waits the delay before its skeleton (DS-57, issue 1726)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("US-QS-14 a load that finishes within the delay shows no skeleton and no status (issue 1726)", () => {
    const { rerender, container } = render(
      <RequestState {...props} status="pending" skeleton={shaped} />,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    rerender(
      <RequestState {...props} status="ready">
        <p>Inhalt</p>
      </RequestState>,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS * 2);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-14 a slow load shows one shaped skeleton with one status after the delay (issue 1726)", () => {
    const { container } = render(<RequestState {...props} status="pending" skeleton={shaped} />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Liste wird geladen …");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("US-QS-14 an error or an offline note shows at once, without the delay (issue 1726)", () => {
    const { unmount } = render(
      <RequestState {...props} status="error" errorText="Nicht erreichbar." />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Nicht erreichbar.");
    unmount();
    render(
      <RequestState {...props} status="ready" offline>
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.getByRole("status").textContent).toBe("Offline - zuletzt geladene Daten");
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });
});

describe("US-QS-14 issue 1772 · RequestState holds a shown shapeless loader (D5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("US-QS-14 issue 1772 · a load that ends 250 ms after it started keeps its PlantLoader status until 500 ms, then the content shows", () => {
    const { rerender } = render(<RequestState onRetry={() => undefined} status="pending" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(screen.getByRole("status").textContent).toBe("Lädt…");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender(
      <RequestState onRetry={() => undefined} status="ready">
        <p>Inhalt</p>
      </RequestState>,
    );
    act(() => {
      vi.advanceTimersByTime(STATUS_HOLD_MS - 51);
    });
    expect(screen.getByRole("status").textContent).toBe("Lädt…");
    expect(screen.queryByText("Inhalt")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-14 issue 1772 · a shaped skeleton that ends at 250 ms is replaced at 250 ms, not held", () => {
    const { rerender, container } = render(
      <RequestState onRetry={() => undefined} status="pending" skeleton={shaped} />,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS + 50);
    });
    expect(screen.getByRole("status").textContent).toContain("Liste wird geladen …");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    rerender(
      <RequestState onRetry={() => undefined} status="ready">
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-14 issue 1772 · a load that ends within 200 ms shows no status and holds nothing", () => {
    const { rerender } = render(<RequestState onRetry={() => undefined} status="pending" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 50);
    });
    rerender(
      <RequestState onRetry={() => undefined} status="ready">
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(STATUS_HOLD_MS * 2);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-14 issue 1772 · a shapeless status text given as loader is held the same way", () => {
    const loader = <p role="status">Einstiegszahlen werden geladen …</p>;
    const { rerender } = render(
      <RequestState onRetry={() => undefined} status="pending" loader={loader} />,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS + 50);
    });
    rerender(
      <RequestState onRetry={() => undefined} status="ready" loader={loader}>
        <p>Inhalt</p>
      </RequestState>,
    );
    act(() => {
      vi.advanceTimersByTime(STATUS_HOLD_MS - 51);
    });
    expect(screen.getByRole("status").textContent).toBe("Einstiegszahlen werden geladen …");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-14 issue 1772 · an error that comes after a shown loader waits for the hold, then shows (P-10)", () => {
    const { rerender } = render(<RequestState onRetry={() => undefined} status="pending" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS + 50);
    });
    rerender(
      <RequestState onRetry={() => undefined} status="error" errorText="Nicht erreichbar." />,
    );
    act(() => {
      vi.advanceTimersByTime(STATUS_HOLD_MS - 51);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("alert").textContent).toContain("Nicht erreichbar.");
  });
});
