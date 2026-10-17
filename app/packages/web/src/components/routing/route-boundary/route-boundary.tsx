import { Component, Fragment, Suspense, type ErrorInfo, type ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { PageSkeleton } from "@/components/shared/states/page-skeleton/page-skeleton";
import { isOnline } from "@/platform/network";
import { retryFailedPages } from "@/components/routing/lazy-page/lazy-page";

type BoundaryProps = {
  resetKey: string;
  children: ReactNode;
  /** Replaces the page error view, e.g. for a lazy part inside a page (DS-55). Gets the retry action. */
  errorView?: (retry: () => void) => ReactNode;
};
type BoundaryState = { failed: boolean; attempt: number };

const TEXT = "Die Seite konnte nicht geladen werden.";
const OFFLINE_TEXT = "Du bist offline. Diese Seite wurde noch nicht geladen.";

/** Catches a page chunk that cannot be fetched and offers "Erneut versuchen" (DS-08, DS-11, P-09, P-10). */
export class ChunkErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, attempt: 0 };
  private lastKey = this.props.resetKey;

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The user sees the German text; the cause stays in the console for diagnosis (P-10).
    console.error("Page chunk failed to load", error, info.componentStack);
  }

  override componentDidUpdate(): void {
    // Navigating to another address leaves the failed page.
    if (this.props.resetKey !== this.lastKey) {
      this.lastKey = this.props.resetKey;
      if (this.state.failed) this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
    }
  }

  private retry = () => {
    retryFailedPages();
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  override render(): ReactNode {
    if (this.state.failed)
      return (
        this.props.errorView?.(this.retry) ?? (
          <EmptyState
            variant="error"
            title={isOnline() ? TEXT : OFFLINE_TEXT}
            action={{ label: "Erneut versuchen", onClick: this.retry }}
          />
        )
      );
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

/**
 * The one boundary around the routes (DS-08, DS-55): the shell renders at once, the page's skeleton shows while its
 * chunk loads, a failed chunk shows an error with retry. `resetKey` is the address; changing it clears an error.
 */
export function RouteBoundary({ resetKey, children }: BoundaryProps) {
  return (
    <ChunkErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
