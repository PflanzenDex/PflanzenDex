// Fixture data of "Freunde" (US-QS-14): confirmed friends, open requests, the own plants and what is shared.
export const socialRoutes = {
  "/friends": {
    friends: [
      { id: "f1", name: "Jonas", since: "2026-08-14T10:00:00Z", sharedSpecies: 2 },
      { id: "f2", name: "Lea", since: "2026-09-02T18:30:00Z", sharedSpecies: null },
    ],
  },
  "/friends/requests": {
    incoming: [
      {
        id: "r1",
        otherName: "Sven",
        direction: "received",
        status: "requested",
        requestedAt: "2026-10-05T09:00:00Z",
      },
    ],
    outgoing: [
      {
        id: "r2",
        otherName: "Mia",
        direction: "sent",
        status: "requested",
        requestedAt: "2026-10-06T16:00:00Z",
      },
    ],
  },
  "/specimens": {
    specimens: [
      { id: "s-a", speciesId: "art-a", name: "Aloe", status: "plant" },
      { id: "s-b", speciesId: "art-b", name: "Monstera", status: "plant" },
    ],
  },
  "/sharing": { shared: [{ specimenId: "s-a", photos: false }] },
  "/feed": {
    asOf: "2026-10-08T07:00:00Z",
    hint: { text: "Jonas hat eine neue Art.", nextAction: "Sieh dir seine Sammlung an." },
    events: [
      {
        friendId: "f1",
        friendName: "Jonas",
        type: "new_species",
        speciesLatin: "Haworthia fasciata",
        speciesGerman: "Zebra-Haworthie",
        date: "2026-10-04",
        count: 1,
      },
    ],
  },
  "/feed/banner": { firstVisit: false, count: 1, items: [], asOf: "2026-10-08T07:00:00Z" },
};

/** A new account has no friends yet: the page offers the code to invite someone (P-09). */
export const socialEmpty = {
  ...socialRoutes,
  "/friends": { friends: [] },
  "/friends/requests": { incoming: [], outgoing: [] },
  "/sharing": { shared: [] },
  "/feed": {
    asOf: "2026-10-08T07:00:00Z",
    hint: { text: "Noch gibt es nichts Neues.", nextAction: "Lade Freunde ein." },
    events: [],
  },
  "/feed/banner": { firstVisit: true, count: 0, items: [], asOf: "2026-10-08T07:00:00Z" },
};
