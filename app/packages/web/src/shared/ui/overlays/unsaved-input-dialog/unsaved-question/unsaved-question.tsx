import * as React from "react";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";

/** The question "Eingabe verwerfen?" (US-QS-32): its own chunk (DS-08), which the first typed input starts. */
const Question = lazyPage(() =>
  import("../unsaved-input-dialog").then((m) => ({ default: m.UnsavedInputDialog })),
);

/** Starts loading the question, so it is there when the person asks for it. */
export function preloadUnsavedQuestion(): void {
  void Question.load().catch(() => undefined);
}

/**
 * The question of a layer. Radix does not move the focus when it closes: the layer puts it back (`focusLayer`), so the
 * default return is switched off here.
 */
export function UnsavedQuestion(props: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <React.Suspense fallback={null}>
      <Question
        open
        onKeep={props.onKeep}
        onDiscard={props.onDiscard}
        onCloseAutoFocus={(event) => event.preventDefault()}
      />
    </React.Suspense>
  );
}
