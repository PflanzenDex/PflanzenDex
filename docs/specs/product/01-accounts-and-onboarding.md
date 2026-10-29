# 01 – Epic ACC: Accounts and Onboarding

Goal: every person has their own account with their own data. Getting started takes a few minutes, also for the three start users with data from the prototype.

The prototype had no account. Everything in this epic is new.

Note (US-QS-14): the account view (US-ACC-01) and the settings (US-ACC-02) are the sections "Profil" and "Einstellungen" of one destination "Konto".

## User stories

### US-ACC-01 · Register and sign in · ✅ new

As a **plant keeper** I want to create an account and sign in securely.

Acceptance criteria:

- Registration with email and an established sign-in method (password, magic link or sign-in via a third-party provider; choice in E-03).
- The email address is confirmed before the account can share data with friends.
- The sign-in stays on the device but is revocable ("sign out on all devices").
- Wrong credentials do not reveal whether the email exists.
- Given the sign-in service still has a live session for this browser but the app holds no sign-in (lost token, other port, cleared site data), when the app opens, then the person is signed in without seeing a login page; without a live session the welcome page shows, and the attempt is made once per tab and never after an explicit sign-out.

### US-ACC-02 · Profile and settings · 🟨 new

As a **plant keeper** I want to set display name, time zone and notifications.

Acceptance criteria:

- Display name (freely chosen, not unique; friends find each other via invitation, not via name search, see FR-SOZ-08).
- Given I save the profile with no display name (`null` or left out), when it is saved, then my stored display name stays unchanged; a display name can only be changed to a non-empty one (1 to 80 characters after trimming), an empty one is refused with `input.invalid` on `displayName` (owner decision 2026-10-05). Saving the other settings never needs a name.
- Time zone, prefilled from the device (the device's zone is only the prefill and the fallback while none is chosen). Phases, due dates and reminders use it (NFR-08).
- Notifications can be switched on and off per occasion (US-MON-08).
- Global switches "Everything private" (US-SOZ-04) and "No recommendations" (US-EQU-11).
- Buffer of the wishlist warning (US-WUN-02): whole number 0 to 10, 2 until changed (assumption, decided by the PO), 0 switches the warning off; `null` or left out keeps the stored value, a value outside the range or not a whole number is refused with `input.invalid` naming `replenishBuffer`. The wishlist warning and the Today list use the saved value at once.
- Global switch "Include my collection in the rarity of PflanzenDex" (US-POK-14): off until switched on (decided by the PO), `null` or left out keeps the stored value, anything but a boolean is refused with `input.invalid` naming `rarityConsent`.

### US-ACC-03 · Guided onboarding · ✅ new

As a **plant keeper** I want to get to my first plant quickly.

Acceptance criteria:

- The onboarding asks for: locations (where plants stand), light zones (take over the default four levels or adjust), first plant. Order and scope are replaced by epic ONB: first plant first, locations and zones later with defaults (US-ONB-01, US-ONB-02); the other criteria stay valid.
- Every step can be skipped; the app is usable afterwards. Missing details are shown later as a hint, never as an error.
- Without a plant "Heute" shows a clear next action instead of an empty page (moved to Heute by US-QS-16, 2026-10-29).
- Given an account whose plants are all archived, when it opens "Heute", then it is a returning keeper: it gets the normal "Heute" with the day's tasks and "Zum Bestand" as the next action when nothing is due, never the onboarding for a new account (owner decision 2026-10-04). The onboarding is only for an account without active and without archived plants.

### US-ACC-04 · Export data and delete account · ✅ new

As a **plant keeper** I want to be able to take my data with me or remove it completely.

Acceptance criteria:

- Export of all own data (specimens, measurements, treatments, wishlist, equipment, swap and friend data) in an open format; photos as files. The export is reproducible (same data, same file).
- Deleting the account removes all personal data, photos and sharing settings. Completed swaps remain with the swap partner with the stored display name, without any further connection.
- Deleting requires a confirmation and names what is removed. Running swaps are canceled (`canceled`, see US-SOZ-10).

State of implementation (export): `GET /account/export` answers a ZIP archive with `data.json` (every table row the keeper owns, read from the database catalog so a new table is included automatically; the guard test `privacy/tables.test.ts` fails for a table that is neither exported nor listed with a reason) and `photos/<name>` (measurement photos and stored wish images). The same data gives the same bytes (sorted keys and rows, fixed dates in the archive). Credentials (push endpoint and keys) and the operator's tables are left out; a photo the store no longer holds is listed with `file: null` and counted in the header `X-Missing-Photos` (P-10). Function groups that are switched off are exported all the same. Friendships and swaps appear with the keeper's own side.

State of implementation (deletion): `POST /account/deletion` with `{ "confirm": true }` requests the deletion; nothing is removed for **7 days** (assumption, decided by the PO deputy: long enough to change one's mind, short enough for the GDPR deadline of one month), `DELETE /account/deletion` withdraws it, `GET /account/deletion` says whether and when. After the deadline the background job `privacy.delete_account` (repeatable, retries while the object store is down) empties the object store by account prefix (also photos no row names any more), then calls `erase_account()`: running swaps are canceled with the cause `account_deleted` (visible to the partner), every table with an `account_id` loses the rows of the account (the generic test fills all tables with the module fixtures and checks that no row is left; a new table is covered by its foreign key and fails the test if it is not), friendships disappear on the partner's side, completed swaps stay with the partner with the stored display name and no connection (`other_id` null). Contributions to the shared catalog: approved species stay, anonymized (the creator of the review case becomes null); proposals nobody else can see are removed with the keeper's own specimens and care profiles that point at them. The log `deletion_log` keeps one anonymous row per deletion with the sign-in subject until the operator has removed the user at the sign-in service (stub `identityKept`; runbook `docs/guides/reference/account-deletion.md`).

State of implementation (screens): "Konto" has the section "Meine Daten" (`#daten`) with the download ("Daten herunterladen", says what the archive holds and names missing photos) and "Konto löschen …": the dialog names what is removed and what stays, asks to type the word LÖSCHEN, and afterwards the section shows the date of the deletion with "Löschung zurücknehmen". Not tried by hand in a real browser yet (no test protocol).

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
- **Cost per user from a manual monthly figure** (owner decision 2026-10-05, until TE-10 measures costs automatically): the operator enters the real hosting cost of one month (amount from 0 to 1,000,000.00 with at most two decimals, currency as a three-letter ISO 4217 code, month not after the current month in UTC; limits are an assumption, starting value). There is one figure per installation; a new entry replaces the old one. Only the operator can enter it, the database checks the role again; it is no tenant data.
  - Given a figure and at least one active account, when the operator opens the overview, then the cost per user is the amount divided by the number of active accounts, rounded half up to whole cents, shown with the currency, the month and "manuell eingetragen".
  - Given no figure, or a figure and no active account, then the cost per user is "unbekannt" with the reason (no figure entered / no active users); nothing is invented (P-08). The entered figure stays visible in both cases.
  - Given a plant keeper or a reviewer, when they enter a figure, then it is refused with `access.denied` and nothing is stored.
  - Given a month after the current month, then it is refused with `operator_cost.month_in_future`; an invalid amount or currency with `input.invalid` on the field.

Not yet (why this story is 🟨): the cost per user comes from the manual monthly figure above; an automatic cost measurement (NFR-16, TE-10) does not exist. Closing the self-registration at the sign-in service itself (Keycloak realm setting) is an operator configuration, not part of the app: the owner decided to close it when the invitation phase starts and to switch "registration only with invitation code" on for public deployments (decision 2026-10-05, #298; the default stays off for local development and tests). The steps are in the runbook `docs/guides/operations/invitation-phase.md`; they can run only once a public deployment with its own sign-in service exists. Until then a stranger can still create a sign-in identity, but the app gives it no account and no data.

### US-ACC-06 · Several accounts on one device · ⬜ new

As a **plant keeper** I want to add a second account in the app and switch between my accounts without signing in again, for example a household account next to my own, or a test account next to my real one.

Acceptance criteria:

- Given I am signed in, when I choose "Add account" and sign in as another person, then both accounts are listed (display name and email) and the added one is active.
- Given two or more accounts on the device, when I pick another account, then the app shows that account's data at once and asks for no password while its sign-in is valid.
- Given I switched accounts, then nothing of the previous account is visible or reachable in the new one: views, cached data, drafts and the outbox are separate per account (P-04, P-05).
- Given I add an account that is already listed, then the app switches to it; no duplicate entry appears.
- Given I sign out of one account, then only that account leaves the device and its session ends; the others stay signed in. "Sign out of all accounts" removes every account from the device.
- Given a listed account whose sign-in has expired or was revoked ("sign out on all devices"), when I pick it, then I am asked to sign in again for that account only; the entry stays listed with the note that the sign-in has expired (P-10).
- Given the device holds the limit of accounts, when I add another, then I am told the limit and offered to sign out of one.

Details (proposed with the story, for the owner to confirm):

- **Limit:** 5 accounts per device (assumption, starting value).
- **Local only:** the account list lives on the device. The server learns nothing about other accounts on the same device and never links them (P-05); there is no merging of data and no sharing between own accounts.
- **Same guarantees per account:** each sign-in stays revocable from the account itself (US-ACC-01), and a revoked account stops working on this device at the latest at its next request.
- **Adding must show the sign-in form** even if the sign-in service still holds a session for another person, and must never end in the "already signed in with another user" page. Whether that needs a prompt option or ending the service session first is an implementation spike (Keycloak behavior with `prompt=login` and with registration); the result goes into the implementation PR.
- **Silent pick-up (US-ACC-01) only applies when no account is stored on the device;** once accounts are listed, the list decides who is active.
- **The active account is remembered** across reloads; with several accounts and no remembered choice the app asks which one to use instead of guessing.
- **Offline:** switching between accounts with a valid sign-in works offline; adding an account needs a connection.
- **Out of scope:** account linking, one login for several people, and an "admin acts as another user" mode.

## Requirements

| ID        | Requirement                                                                                                                                              | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-ACC-01 | Account data (email, display name) is stored separately from collection data and accessible only to the account itself.                                  | ✅     |
| FR-ACC-02 | Every user-related row carries the account id from the first version on (P-04, NFR-09).                                                                  | ⬜     |
| FR-ACC-03 | Passwords and credentials are never stored by ourselves if an established service manages them (NFR-10).                                                 | ✅     |
| FR-ACC-04 | Minors: clarify age limit and notices before the app becomes public (NFR-11).                                                                            | ⬜     |
| FR-ACC-05 | The sign-in service must also serve as an authorization server for AI connections (OAuth with own scopes, consent page, revocation; E-03, FR-KI-13).     | ⬜     |
| FR-ACC-06 | Several accounts on one device are isolated per account (data, caches, outbox, drafts) and each keeps its own revocable sign-in (US-ACC-06, P-04, P-05). | ⬜     |
