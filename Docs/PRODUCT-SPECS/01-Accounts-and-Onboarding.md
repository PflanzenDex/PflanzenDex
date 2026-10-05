# 01 – Epic ACC: Accounts and Onboarding

Goal: every person has their own account with their own data. Getting started takes a few minutes, also for the three start users with data from the prototype.

The prototype had no account. Everything in this epic is new.

## User stories

### US-ACC-01 · Register and sign in · ✅ new

As a **plant keeper** I want to create an account and sign in securely.

Acceptance criteria:

- Registration with email and an established sign-in method (password, magic link or sign-in via a third-party provider; choice in E-03).
- The email address is confirmed before the account can share data with friends.
- The sign-in stays on the device but is revocable ("sign out on all devices").
- Wrong credentials do not reveal whether the email exists.

### US-ACC-02 · Profile and settings · 🟨 new

As a **plant keeper** I want to set display name, time zone and notifications.

Acceptance criteria:

- Display name (freely chosen, not unique; friends find each other via invitation, not via name search, see FR-SOZ-08).
- Time zone, prefilled from the device (the device's zone is only the prefill and the fallback while none is chosen). Phases, due dates and reminders use it (NFR-08).
- Notifications can be switched on and off per occasion (US-MON-08).
- Global switches "Everything private" (US-SOZ-04) and "No recommendations" (US-EQU-11).

### US-ACC-03 · Guided onboarding · ✅ new

As a **plant keeper** I want to get to my first plant quickly.

Acceptance criteria:

- The onboarding asks for: locations (where plants stand), light zones (take over the default four levels or adjust), first plant.
- Every step can be skipped; the app is usable afterwards. Missing details are shown later as a hint, never as an error.
- Without a plant the start page shows a clear next action instead of an empty page.
- Given an account whose plants are all archived, when it opens the start page, then it is a returning keeper: it gets the normal start page with "next plant" as the next action, never the onboarding for a new account (owner decision 2026-10-04). The onboarding is only for an account without active and without archived plants.

### US-ACC-04 · Export data and delete account · ⬜ new

As a **plant keeper** I want to be able to take my data with me or remove it completely.

Acceptance criteria:

- Export of all own data (specimens, measurements, treatments, wishlist, equipment, swap and friend data) in an open format; photos as files. The export is reproducible (same data, same file).
- Deleting the account removes all personal data, photos and sharing settings. Completed swaps remain with the swap partner with the stored display name, without any further connection.
- Deleting requires a confirmation and names what is removed. Running swaps are canceled (`canceled`, see US-SOZ-10).

### US-ACC-05 · Access by invitation only (initial phase) · 🟨 new

As an **operator** I want to limit access at the beginning.

Acceptance criteria:

- Registration only with a valid invitation code, as long as the operator has set it that way. Codes are single-use and expire.
- The operator sees the number of accounts, active users and cost per user (NFR-16), no content.

Details (decided with the story):

- The operator switches "registration only with invitation code" on and off in the operator area. It is off by default, so nothing changes for existing installations until the operator switches it on. Existing accounts always sign in as before.
- A person who signed in at the sign-in service but has no account yet enters the code before the account is created. Without a valid code no account and no data exist.
- A code is unguessable (120 bits), shown to the operator exactly once, and valid for 7 days by default (assumption, starting value; the operator picks 1 to 30 days). The system stores only a hash of it. An unknown, used, expired or malformed code gets the same answer, so a refusal says nothing about which case it was.
- An account counts as active if it opened the app in the last 30 days (assumption, starting value).
- Only the operator role (not the reviewer role) uses the operator area; the database checks the role again. The operator sees counts and the state of invitations, never the content of an account.

Not yet (why this story is 🟨): the cost per user is shown as "unknown" because the cost measurement (NFR-16, TE-10) does not exist; no number is invented (P-08). Closing the self-registration at the sign-in service itself (Keycloak realm setting) is an operator configuration, not part of the app: until the owner turns it off there, a stranger can still create a sign-in identity, but the app gives it no account and no data.

## Requirements

| ID        | Requirement                                                                                                                                          | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-ACC-01 | Account data (email, display name) is stored separately from collection data and accessible only to the account itself.                              | ✅     |
| FR-ACC-02 | Every user-related row carries the account id from the first version on (P-04, NFR-09).                                                              | ⬜     |
| FR-ACC-03 | Passwords and credentials are never stored by ourselves if an established service manages them (NFR-10).                                             | ✅     |
| FR-ACC-04 | Minors: clarify age limit and notices before the app becomes public (NFR-11).                                                                        | ⬜     |
| FR-ACC-05 | The sign-in service must also serve as an authorization server for AI connections (OAuth with own scopes, consent page, revocation; E-03, FR-KI-13). | ⬜     |
