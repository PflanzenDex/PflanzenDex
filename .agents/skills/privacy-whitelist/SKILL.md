---
name: privacy-whitelist
description: Use when an output leaves an account for another person (friend views, feed and banner, swap and match cards, shared equipment, partner outputs): adds or changes its field whitelist and the contract test that proves only whitelisted fields appear (QG-D2, P-05, US-QG-05).
---

# Privacy whitelist

A friend gets a whitelist, not a filtered copy of the owner's data: the response carries exactly the keys the spec names, and no others. The spec names the fields per output (US-SOZ-04 in `docs/specs/product/10-social.md`: species names, specimen name, caught date, cutting flag, photo flag). The contract test in the API proves the response matches.

1. Read the spec of the output: the story's criteria and the QG-D2 rule in `docs/specs/product/18-architecture-and-quality-gates.md`. A field the spec does not name is not allowed, even when it looks harmless.
2. Stop a field at the route when core still needs it: `withoutKey(value, "field")` (`app/packages/api/src/kernel/route-helpers.ts`) drops one key and changes nothing else. Examples: `repottedAt` stays in the friend view for the feed's "Potted" event and is removed in `app/packages/api/src/social/sharing/sharing-routes.ts`; `ownerId` is removed in `app/packages/api/src/swap/exchange/exchange-routes.ts`; `otherId` in `app/packages/api/src/swap/answer/swap-routes.ts`.
3. Write the shape as a constant of the test file: a `KeyShape` from `app/packages/api/src/exact-keys-test-helpers.ts`, one per output. A key maps to `true`, to a nested shape, or to `[shape]` for an array. Examples: `SHARED_SPECIMEN` and `COLLECTION_CARD` in `app/packages/api/src/social/sharing/sharing.test.ts`; `EXCHANGE_OFFER`, `MATCH_CARD` and `MATCH_REASONS` in `app/packages/api/src/swap/exchange/exchange-shapes.test-helpers.ts`.
4. Assert with `expectExactKeys(body, shape, "GET /path")`. It fails on any extra or missing key and names the path, for example `response.cards[0].ownerId`. Name the test `US-QG-05 QG-D2 …` and carry the story ID too, as in `app/packages/api/src/social/friends/friends.test.ts`.
5. The scenario must produce a row. The helper fails on an empty array on purpose: seed both sides of the friendship and at least one row of each list.
6. A nullable nested object is not inspected (`null` passes). The test asserts it non-null next to the call and then checks its keys, as in `app/packages/api/src/swap/exchange/exchange.test.ts` (`expect(mine.health.lastTreated).not.toBeNull()`, then `expectExactKeys(mine.health.lastTreated, …)`).
7. A key the spec does not allow is a privacy finding (P-05). Never widen the shape to make the test pass. Remove the field at the route or stop it in the query, and tell the owner. A shape changes only together with a spec change, spec first (`AGENTS.md`, step 1).
8. Database side: friend reads go through database functions that return only their columns, such as `friend_shares()` (`app/packages/db/migrations/0044_swap_swap_request.sql` names the pattern). Their contract test selects the columns and compares the field names, see `app/packages/db/src/wish-friends.test.ts` ("QG-D2 contract").
9. Name a new or changed output in `docs/guides/reference/app.md` under its epic, with its whitelist.

## Check

```bash
make test
```

Expected: every test named "US-QG-05 QG-D2" passes. An extra key in a response fails the test and names its path. The database tests need Docker; without it they run only in CI (`make ci`).
