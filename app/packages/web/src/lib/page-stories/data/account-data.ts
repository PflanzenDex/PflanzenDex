import type { Account } from "@/account";

// Fixture data of the account screens (US-QS-14). Texts the user sees are German.
export const account: Account = {
  id: "konto-1",
  email: "mara.beispiel@example.org",
  displayName: "Mara",
  timeZone: "Europe/Berlin",
  emailConfirmed: true,
  mayShareWithFriends: true,
};

export const accountRoutes = {
  "/account/profile": {
    displayName: "Mara",
    timeZone: "Europe/Berlin",
    everythingPrivate: false,
    noRecommendations: true,
    notifications: {
      phase: true,
      treatment: true,
      measurement: false,
      watering: true,
      swap: false,
      friends: true,
    },
  },
};
