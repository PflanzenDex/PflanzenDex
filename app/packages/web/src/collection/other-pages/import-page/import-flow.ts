// The state of the CSV import page (US-BES-18): the three steps, the fixes and answers of the keeper, and the last answers
// of the server. The actions that change it live in import-controller.ts; a failure keeps the state (P-10).
import { useRef, useState } from "react";
import type { ConfirmResult, ImportPreview } from "@pflanzendex/core";
import type { ApiError } from "@/shared/data";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { actionsOf, type Ctx, type Refs } from "./import-controller";
import type { MarkerAnswer, RowFix } from "./import-api";

export type Step = "choose" | "preview" | "result";
/** The file the keeper picked: its name for the page and its text for the server. */
export interface Picked {
  readonly name: string;
  readonly text: string;
}
/** The keeper's fixes by line of the file (US-BES-18). */
export type Fixes = Readonly<Record<number, RowFix>>;
export type Token = () => Promise<string | undefined>;

export interface Flow {
  readonly step: Step;
  /** Counts the step changes: a step that arrives takes the focus once (route focus, DS-68). */
  readonly arrivals: number;
  readonly file: Picked | null;
  readonly fileError: string | null;
  readonly preview: ImportPreview | null;
  readonly fixes: Fixes;
  readonly answers: readonly MarkerAnswer[];
  readonly busy: boolean;
  /** The last request that failed: the page keeps what it showed and offers a retry (P-10). */
  readonly failure: ApiError | null;
  /** A note for the keeper about what the page did by itself (answers that no longer fit the file). */
  readonly notice: string | null;
  readonly result: ConfirmResult | null;
}

const START: Flow = {
  step: "choose",
  arrivals: 0,
  file: null,
  fileError: null,
  preview: null,
  fixes: {},
  answers: [],
  busy: false,
  failure: null,
  notice: null,
  result: null,
};

/** The page's state and its actions. The steps read the state and call the actions; nothing else changes the page. */
export function useImportFlow(api: string, token: Token) {
  const [flow, setFlow] = useState<Flow>(START);
  const announce = useAnnounce();
  // The refs hold what the server last accepted, so two quick actions build on each other, not on a stale render.
  const refs: Refs = {
    sequence: useRef(0),
    retry: useRef<() => void>(() => undefined),
    fixes: useRef<Fixes>({}),
    answers: useRef<readonly MarkerAnswer[]>([]),
  };
  const patch = (change: Partial<Flow>) => setFlow((cur) => ({ ...cur, ...change }));
  const moveTo = (step: Step, change: Partial<Flow> = {}) =>
    setFlow((cur) => ({ ...cur, ...change, step, arrivals: cur.arrivals + 1 }));
  const ctx: Ctx = { api, token, announce, flow, patch, moveTo, refs };
  return { flow, ...actionsOf(ctx) };
}

/** What the steps read and do: the state of the page and its actions. */
export type ImportFlow = ReturnType<typeof useImportFlow>;
