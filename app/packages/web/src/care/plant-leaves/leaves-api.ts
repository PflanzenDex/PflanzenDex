import type { LeafLogView, LeafRow } from "@pflanzendex/core";
import {
  call,
  createWrite,
  currentTimeZone,
  type Response,
  type WriteOptions,
} from "../../shared/data";

type FetchFn = typeof fetch;

/** The optional parts of a leaf: a tap sends none of them (US-WAC-07). */
export interface LeafInput {
  /** `YYYY-MM-DD`; without a statement today in the keeper's time zone applies on the server. */
  date?: string;
  lengthMm?: number;
  widthMm?: number;
  note?: string;
}

export interface LeafAccess {
  api: string;
  token: string;
  fetchFn?: FetchFn;
}

/** The leaf log of one plant: count, comparison and the leaves, newest first (US-WAC-07). */
export function loadLeafLog(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<LeafLogView>> {
  return call<LeafLogView>(
    fetchFn,
    `${api}/specimens/${encodeURIComponent(specimenId)}/leaves`,
    token,
  );
}

/** Records a leaf; the repeat-guard key stays with the write until it is answered (US-QS-03). */
export async function recordLeaf(
  access: LeafAccess,
  specimenId: string,
  input: LeafInput,
  options: WriteOptions = {},
): Promise<Response<LeafRow>> {
  const r = await createWrite(
    access.api,
    access.token,
    access.fetchFn ?? fetch,
    options.key,
  )("POST", `/specimens/${encodeURIComponent(specimenId)}/leaves`, {
    ...input,
    timeZone: currentTimeZone(),
  });
  return r.ok ? { ok: true, value: r.value as LeafRow } : r;
}

/** Removes one leaf of the plant (US-WAC-07); the caller asks before it calls this (P-10). */
export async function removeLeaf(
  access: LeafAccess,
  specimenId: string,
  leafId: string,
  options: WriteOptions = {},
): Promise<Response<{ id: string }>> {
  const r = await createWrite(
    access.api,
    access.token,
    access.fetchFn ?? fetch,
    options.key,
  )("DELETE", `/specimens/${encodeURIComponent(specimenId)}/leaves/${encodeURIComponent(leafId)}`);
  return r.ok ? { ok: true, value: r.value as { id: string } } : r;
}
