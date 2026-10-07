import type {
  CreatedFriendCode,
  Friend,
  FriendRequest,
  OpenRequests,
  SharingRow,
  SpecimenRow,
} from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** What the page shows: the open requests of both directions and the confirmed friends, loaded together (P-10). */
export interface FriendsData {
  readonly requests: OpenRequests;
  readonly friends: readonly Friend[];
  /** The keeper's own specimens and what is shared of them (US-SOZ-04). */
  readonly specimens: readonly Pick<SpecimenRow, "id" | "speciesId" | "name" | "status">[];
  readonly shared: readonly SharingRow[];
}

/** Loads requests, friends, own specimens and sharing in parallel; the first refusal wins, nothing is shown half. */
export async function loadFriends(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<FriendsData>> {
  const [requests, friends, specimens, sharing] = await Promise.all([
    call<OpenRequests>(fetchFn, `${api}/friends/requests`, token),
    call<{ friends: readonly Friend[] }>(fetchFn, `${api}/friends`, token),
    call<{ specimens: FriendsData["specimens"] }>(fetchFn, `${api}/specimens`, token),
    call<{ shared: readonly SharingRow[] }>(fetchFn, `${api}/sharing`, token),
  ]);
  if (!requests.ok) return requests;
  if (!friends.ok) return friends;
  if (!specimens.ok) return specimens;
  if (!sharing.ok) return sharing;
  return {
    ok: true,
    value: {
      requests: requests.value,
      friends: friends.value.friends,
      specimens: specimens.value.specimens,
      shared: sharing.value.shared,
    },
  };
}

/** A new friend code (US-SOZ-01); the answer carries it exactly once. */
export async function createFriendCode(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<CreatedFriendCode>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/friends/invitations", {});
  return r.ok ? { ok: true, value: r.value as CreatedFriendCode } : r;
}

/** Redeems a friend code of someone else and sends the request (US-SOZ-01). */
export async function sendFriendRequest(
  api: string,
  token: string,
  code: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<FriendRequest>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/friends/requests", { code });
  return r.ok ? { ok: true, value: r.value as FriendRequest } : r;
}

/** Accepts or declines a request someone sent to me (US-SOZ-02). */
export async function answerFriendRequest(
  api: string,
  token: string,
  target: { requestId: string; decision: "accept" | "decline" },
  fetchFn: FetchFn = fetch,
): Promise<Response<{ status: "confirmed" | "declined" }>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/friends/requests/${encodeURIComponent(target.requestId)}/answer`,
    { decision: target.decision },
  );
  return r.ok ? { ok: true, value: r.value as { status: "confirmed" | "declined" } } : r;
}

/** Ends a friendship on both sides at once (US-SOZ-03). */
export async function endFriendship(
  api: string,
  token: string,
  friendId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ status: "ended" }>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/friends/${encodeURIComponent(friendId)}/end`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as { status: "ended" } } : r;
}

/** Shares or withdraws one specimen (US-SOZ-04); private is the default. */
export async function setSpecimenSharing(
  api: string,
  token: string,
  target: { specimenId: string; share: boolean },
  fetchFn: FetchFn = fetch,
): Promise<Response<{ share: "private" | "friends" }>> {
  const r = await createWrite(api, token, fetchFn)(
    "PUT",
    `/sharing/specimens/${encodeURIComponent(target.specimenId)}`,
    { share: target.share ? "friends" : "private" },
  );
  return r.ok ? { ok: true, value: r.value as { share: "private" | "friends" } } : r;
}

/** Shares or withdraws every active specimen of a species (US-SOZ-04); the answer says how many were touched. */
export async function setSpeciesSharing(
  api: string,
  token: string,
  target: { speciesId: string; share: boolean },
  fetchFn: FetchFn = fetch,
): Promise<Response<{ changed: number }>> {
  const r = await createWrite(api, token, fetchFn)(
    "PUT",
    `/sharing/species/${encodeURIComponent(target.speciesId)}`,
    { share: target.share ? "friends" : "private" },
  );
  return r.ok ? { ok: true, value: r.value as { changed: number } } : r;
}
