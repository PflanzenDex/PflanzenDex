import { list, text, type Api, type Body } from "./query-count-api-test-helpers";
import {
  equipmentOf,
  EVERY_SECOND,
  letters,
  profile,
  speciesBody,
  TZ,
  type Seat,
} from "./query-count-seed-test-helpers";

// US-QG-07: friends, their shared specimens and offers, and the swaps between the keeper and both friends (the reads of
// friends, feed, exchange, match and swaps take their rows from here).
export const friendName = (run: string, tag: string): string => `Friend ${tag} ${run}`;

/** A friend with `n` species and specimens; every second one is shared and offered (no treatment, no confirmation). The
 * species have a dormancy period, so the offers of the friend show a care phase (the exchange reads it as the owner). */
export async function seedFriend(seat: Seat, n: number, gear: boolean): Promise<void> {
  const { api, sub, run, tag } = seat;
  await api.ok(sub, "PUT", "/account/profile", profile(friendName(run, tag)));
  for (let i = 0; i < n; i++) {
    const species = await api.ok(sub, "POST", "/species", {
      ...speciesBody(run, tag, i),
      dormancyFrom: "11-01",
      dormancyUntil: "02-28",
    });
    const specimen = await api.ok(sub, "POST", "/specimens", {
      speciesId: text(species, "id"),
      timeZone: TZ,
      marker: `pot ${letters(i)}`,
    });
    if (i % EVERY_SECOND !== 0) continue;
    const specimenId = text(specimen, "id");
    await api.ok(sub, "PUT", `/sharing/specimens/${specimenId}`, { share: "friends" });
    await api.ok(sub, "POST", "/offers", { specimenId, type: "cutting", mode: "swap" });
  }
  if (gear) {
    const timer = await equipmentOf(seat, "Timer", `Friend timer ${run}`);
    await api.ok(sub, "PUT", `/equipment/${timer}/sharing`, { share: "friends" });
  }
}

/** Invitation by code (US-SOZ-01): the keeper invites, the friend redeems the code, the keeper accepts. Returns the
 * friendship id that the friend routes take. */
export async function befriend(
  api: Api,
  keeper: string,
  friend: string,
  name: string,
): Promise<string> {
  const { code } = await api.ok(keeper, "POST", "/friends/invitations", {});
  await api.ok(friend, "POST", "/friends/requests", { code });
  const request = list(await api.ok(keeper, "GET", "/friends/requests"), "incoming")[0];
  if (!request) throw new Error(`seed: no incoming friend request for ${name}`);
  await api.ok(keeper, "POST", `/friends/requests/${text(request, "id")}/answer`, {
    decision: "accept",
  });
  const friends = list(await api.ok(keeper, "GET", "/friends"), "friends");
  const found = friends.find((f) => f["name"] === name);
  if (!found) throw new Error(`seed: ${name} is not a friend of the keeper`);
  return text(found, "id");
}

/** Answers the open requests of `giver`: accepted when `accept(i)`, otherwise declined with a reason. */
async function answerRequests(
  api: Api,
  giver: string,
  accept: (i: number) => boolean,
): Promise<void> {
  const received = list(await api.ok(giver, "GET", "/swaps"), "received");
  const requested = received.filter((s) => s["status"] === "requested");
  for (const [i, swap] of requested.entries()) {
    const answer: Body = accept(i)
      ? { action: "accept" }
      : { action: "decline", reason: "Not this time." };
    await api.ok(giver, "POST", `/swaps/${text(swap, "swapId")}/answer`, answer);
  }
}

/**
 * Swap requests both ways: the keeper asks every offer of friend A, friend B asks every second offer of the keeper, the
 * givers answer (accept, or decline with a reason). The accepted ones are swaps in progress (US-SOZ-10). No handover: a
 * handover needs a species of the approved catalog, and the friends' species are proposals (the recipient cannot see them).
 */
export async function seedSwaps(api: Api, keeper: string, a: string, b: string): Promise<void> {
  for (const offer of list(await api.ok(a, "GET", `/offers?timeZone=${TZ}`), "offers"))
    await api.ok(keeper, "POST", `/offers/${text(offer, "id")}/request`, {});
  const mine = list(await api.ok(keeper, "GET", `/offers?timeZone=${TZ}`), "offers");
  for (const [i, offer] of mine.entries())
    if (i % EVERY_SECOND === 0) await api.ok(b, "POST", `/offers/${text(offer, "id")}/request`, {});
  await answerRequests(api, a, (i) => i % EVERY_SECOND === 0);
  await answerRequests(api, keeper, (i) => i % EVERY_SECOND === 0);
  const sent = list(await api.ok(keeper, "GET", "/swaps"), "sent");
  if (!sent.some((s) => s["status"] === "accepted")) throw new Error("seed: no swap in progress");
}
