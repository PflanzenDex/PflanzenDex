import type { CreatedFriendCode, Friend, FriendRequest, OpenRequests } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** What the page shows: the open requests of both directions and the confirmed friends, loaded together (P-10). */
export interface FriendsData {
  readonly requests: OpenRequests;
  readonly friends: readonly Friend[];
}

/** Loads requests and friends in parallel; the first refusal wins, nothing is shown half. */
export async function loadFriends(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<FriendsData>> {
  const [requests, friends] = await Promise.all([
    call<OpenRequests>(fetchFn, `${api}/friends/requests`, token),
    call<{ friends: readonly Friend[] }>(fetchFn, `${api}/friends`, token),
  ]);
  if (!requests.ok) return requests;
  if (!friends.ok) return friends;
  return { ok: true, value: { requests: requests.value, friends: friends.value.friends } };
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
