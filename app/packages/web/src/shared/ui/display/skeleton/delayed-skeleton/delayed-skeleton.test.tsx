// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense, lazy } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedSkeleton, SKELETON_DELAY_MS } from "./delayed-skeleton";
import { Skeleton, SkeletonGroup } from "../skeleton";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

const loading = (
  <DelayedSkeleton>
    <SkeletonGroup label="Lädt…">
      <Skeleton className="h-24 w-full" />
    </SkeletonGroup>
  </DelayedSkeleton>
);

describe("DelayedSkeleton (US-QS-14, DS-57, issue 1697)", () => {
  it("US-QS-14 issue 1697 · the starting value of the delay is 200 ms (assumption)", () => {
    expect(SKELETON_DELAY_MS).toBe(200);
  });

  it("US-QS-14 issue 1697 · a fast load shows no skeleton and no status at all", () => {
    const { unmount } = render(loading);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[aria-hidden='true']")).toBeNull();
    // The part arrives and the fallback goes: the timer ends with the wait, so nothing shows afterwards either.
    unmount();
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS * 2);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-14 issue 1697 · a slow load shows exactly one skeleton once the delay has passed", () => {
    render(loading);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Lädt…");
  });

  it("US-QS-14 issue 1697 · the delay is a parameter, a zero delay shows at once", () => {
    render(
      <DelayedSkeleton delayMs={0}>
        <SkeletonGroup label="Lädt…">
          <Skeleton />
        </SkeletonGroup>
      </DelayedSkeleton>,
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("DelayedSkeleton inside a Suspense boundary (US-QS-14, issue 1697)", () => {
  function deferred() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("US-QS-14 issue 1697 · a part that loads within the delay shows no status and then only its content", async () => {
    const part = deferred();
    const Part = lazy(async () => {
      await part.promise;
      return { default: () => <p>Inhalt</p> };
    });
    render(
      <Suspense
        fallback={
          <DelayedSkeleton>
            <SkeletonGroup label="Lädt…">
              <Skeleton />
            </SkeletonGroup>
          </DelayedSkeleton>
        }
      >
        <Part />
      </Suspense>,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 50);
    });
    await act(async () => {
      part.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-14 issue 1697 · a part that loads longer than the delay shows exactly one skeleton, then the content", async () => {
    const part = deferred();
    const Part = lazy(async () => {
      await part.promise;
      return { default: () => <p>Inhalt</p> };
    });
    render(
      <Suspense
        fallback={
          <DelayedSkeleton>
            <SkeletonGroup label="Lädt…">
              <Skeleton />
            </SkeletonGroup>
          </DelayedSkeleton>
        }
      >
        <Part />
      </Suspense>,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await act(async () => {
      part.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });
});
