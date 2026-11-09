// The actions of the CSV import page (US-BES-18): each one sends the file, the fixes or the answers to the server and puts
// the server's answer into the page's state. A failed request keeps what the page showed and offers a retry (P-10). The
// server judges every row; the page never decides that a row is ready (P-01).
import type { ConfirmResult, ImportPreview } from "@pflanzendex/core";
import { SIGN_IN, isUnanswered, newRepeatKey, type Response } from "@/shared/data";
import { GENERIC_ERROR_TEXT, errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Api } from "@/shared/platform/announcer/context";
import table from "./import-page.de.json";
import {
  confirmRow,
  isReady,
  overridesOf,
  sendImport,
  sendPreview,
  tooLarge,
  withoutSpecies,
  type MarkerAnswer,
  type RowFix,
} from "./import-api";
import type { Fixes, Flow, Picked, Step, Token } from "./import-flow";

const ui = texts(table);

/** The refs of the page: the newest request, its retry, and the fixes and answers the server last accepted. */
export interface Refs {
  readonly sequence: { current: number };
  readonly retry: { current: () => void };
  readonly fixes: { current: Fixes };
  readonly answers: { current: readonly MarkerAnswer[] };
}

/** What an action reads and changes: the state of the render it was made in, and the setters of the page. */
export interface Ctx {
  readonly api: string;
  readonly token: Token;
  readonly announce: Api | null;
  readonly flow: Flow;
  readonly patch: (change: Partial<Flow>) => void;
  readonly moveTo: (step: Step, change?: Partial<Flow>) => void;
  readonly refs: Refs;
}

/** One preview request: the file as it is, with the fixes and answers it carries and the step it moves the page to. */
interface Ask {
  readonly file: Picked;
  readonly fixes: Fixes;
  readonly answers: readonly MarkerAnswer[];
  readonly step: Step | null;
}

async function askPreview(ctx: Ctx, ask: Ask): Promise<Response<ImportPreview>> {
  const credential = await ctx.token();
  if (!credential) return { ok: false, error: SIGN_IN };
  return sendPreview(ctx.api, credential, {
    csv: ask.file.text,
    overrides: overridesOf(ask.fixes),
    markers: ask.answers.map(withoutSpecies),
  });
}

/** The server accepted the preview: the page shows it, takes the fixes and answers as accepted, and says the counts. */
function showPreview(ctx: Ctx, ask: Ask, preview: ImportPreview): void {
  ctx.refs.fixes.current = ask.fixes;
  ctx.refs.answers.current = ask.answers;
  const c = preview.counts;
  ctx.announce?.announce(
    ui("announcePreview", {
      ready: c.ready,
      flagged: c.flagged,
      alreadyThere: c.alreadyThere,
      skipped: c.skipped,
    }),
  );
  const change = { busy: false, preview, fixes: ask.fixes, answers: ask.answers, notice: null };
  if (ask.step) ctx.moveTo(ask.step, change);
  else ctx.patch(change);
}

/**
 * One preview of the file. Only the newest request may answer; an answer set the server no longer takes is dropped once,
 * the keeper is told, and the file is judged again without it.
 */
async function previewWith(ctx: Ctx, ask: Ask): Promise<void> {
  const { patch, refs } = ctx;
  const mine = ++refs.sequence.current;
  refs.retry.current = () => void previewWith(ctx, ask);
  patch({ busy: true, failure: null });
  const r = await askPreview(ctx, ask);
  if (mine !== refs.sequence.current) return;
  if (!r.ok && r.error.code === "specimen.not_found" && ask.answers.length > 0) {
    refs.answers.current = [];
    patch({ notice: ui("answersReset") });
    return previewWith(ctx, { ...ask, answers: [] });
  }
  if (!r.ok) return patch({ busy: false, failure: r.error });
  showPreview(ctx, ask, r.value);
}

/** The keeper picked a file: a file over the size limit is refused here, before any request (FR-BES-26). */
async function chooseFile(ctx: Ctx, picked: File | undefined): Promise<void> {
  if (!picked) return ctx.patch({ file: null, fileError: null });
  if (tooLarge(picked))
    return ctx.patch({ file: null, fileError: errorText("import.too_large"), preview: null });
  try {
    const text = await picked.text();
    ctx.patch({ file: { name: picked.name, text }, fileError: null });
  } catch {
    ctx.patch({ file: null, fileError: GENERIC_ERROR_TEXT });
  }
}

/** "Vorschau ansehen": the first preview of the file; nothing is written. */
function review(ctx: Ctx): void {
  const file = ctx.flow.file;
  if (!file) return;
  ctx.refs.fixes.current = {};
  ctx.refs.answers.current = [];
  void previewWith(ctx, { file, fixes: {}, answers: [], step: "preview" });
}

/** One fix of a row, sent as a new preview of the whole file (US-BES-18). */
function fixRow(ctx: Ctx, line: number, change: RowFix): void {
  const file = ctx.flow.file;
  if (!file) return;
  const current = ctx.refs.fixes.current;
  const fixes = { ...current, [line]: { ...current[line], ...change } };
  void previewWith(ctx, { file, fixes, answers: ctx.refs.answers.current, step: null });
}

/** A marker the keeper gave an existing specimen (US-BES-03); the new preview judges it. */
function answerMarker(ctx: Ctx, answer: MarkerAnswer): void {
  const file = ctx.flow.file;
  if (!file) return;
  const others = ctx.refs.answers.current.filter((a) => a.specimenId !== answer.specimenId);
  void previewWith(ctx, {
    file,
    fixes: ctx.refs.fixes.current,
    answers: [...others, answer],
    step: null,
  });
}

/** "n Pflanzen importieren": only the ready rows of the last preview go out, with the answers their species needs. */
async function confirmImport(
  ctx: Ctx,
  { key = newRepeatKey() }: { key?: string | undefined } = {},
): Promise<void> {
  const preview = ctx.flow.preview;
  if (!preview) return;
  const rows = preview.rows.filter(isReady).map(confirmRow);
  const ready = new Set(rows.map((r) => r.speciesId));
  const markers = ctx.refs.answers.current
    .filter((a) => ready.has(a.speciesId))
    .map(withoutSpecies);
  ctx.patch({ busy: true, failure: null });
  const credential = await ctx.token();
  const r: Response<ConfirmResult> = credential
    ? await sendImport(ctx.api, credential, { rows, markers }, { key })
    : { ok: false, error: SIGN_IN };
  if (!r.ok) {
    ctx.refs.retry.current = () =>
      void confirmImport(ctx, { key: isUnanswered(r.error) ? key : undefined });
    return ctx.patch({ busy: false, failure: r.error });
  }
  ctx.announce?.announce(
    ui("announceResult", {
      created: r.value.created.length,
      skipped: r.value.skipped.length,
      refused: r.value.refused.length,
    }),
  );
  ctx.moveTo("result", { busy: false, result: r.value });
}

/** Back to the first step with the given state; the fixes and answers the server accepted are dropped. */
function startOver(ctx: Ctx, change: Partial<Flow>): void {
  ctx.refs.fixes.current = {};
  ctx.refs.answers.current = [];
  ctx.moveTo("choose", { fixes: {}, answers: [], failure: null, notice: null, ...change });
}

/** The page's actions, bound to the state of this render. */
export function actionsOf(ctx: Ctx) {
  return {
    choose: (picked: File | undefined) => chooseFile(ctx, picked),
    review: () => review(ctx),
    fix: (line: number, change: RowFix) => fixRow(ctx, line, change),
    answer: (answer: MarkerAnswer) => answerMarker(ctx, answer),
    confirm: () => confirmImport(ctx),
    /** Retries the last request that failed, with the same input. */
    retry: () => ctx.refs.retry.current(),
    /** "Andere Datei wählen": back to the file; the preview and its fixes are dropped. */
    back: () => startOver(ctx, { preview: null }),
    /** A new import after the result: the page starts over with no file. */
    again: () => startOver(ctx, { file: null, preview: null, fileError: null, result: null }),
  };
}
