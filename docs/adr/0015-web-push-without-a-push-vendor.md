# 0015 · Reminders go out as standard web push, without a push vendor

- **Status:** proposed (2026-10-21), for the product owner to accept in the PR. Revisable.
- **Refines:** E-10 (default delivery channel: web push plus optional email, decided by the PO), E-21 / ADR 0006 (PWA first, Capacitor as the native path), US-MON-01, US-MON-08
- **Affects:** `app/packages/api/src/monitoring/runtime.ts` (the stub `ReminderChannel`), `docs/specs/product/09-reminders-and-sensors.md`

## Context

E-10 settled the channel (web push plus optional email) but not how a push gets from our server to the device. A recurring question is whether to use Firebase Cloud Messaging (FCM) or a hosted notification service. What is already built (US-MON-01, US-MON-08):

- The daily job `monitoring.send_reminders` bundles one message per account and local day and stores it in the in-app inbox before any send (P-10).
- Delivery sits behind the port `ReminderChannel`; the app root composes a stub that sends nothing.
- Push subscriptions are stored as standard Web Push subscriptions (`delivery_channel`: `endpoint`, `p256dh`, `auth`), already part of the data export.

Facts that frame the choice:

- **Web Push is an open standard** (RFC 8030 push protocol, RFC 8291 message encryption, RFC 8292 VAPID). Chrome, Edge, Firefox and Safari implement it; each browser picks its own push service (Chrome's is FCM, Safari's is APNs). The sender only talks to the `endpoint` in the subscription.
- **The payload is end-to-end encrypted** to the browser's key; the push service sees the endpoint, size and timing, not the content.
- **The FCM web SDK wraps the same browser API.** It adds a Firebase project, a Google SDK in the client bundle and Google as a processor of tokens, without a capability the standard lacks for a web app.
- **iOS and iPadOS** deliver web push only to a web app added to the home screen (since iOS 16.4), and the permission prompt must follow a user gesture.
- **Native apps cannot avoid the platform services:** a Capacitor build receives pushes only through FCM (Android) and APNs (iOS).
- Operation is self-hosted on own hardware (E-01, R-11); the product is private by default (P-05).

## Decision

1. **The real `ReminderChannel` for the PWA is a Web Push adapter that sends directly** to the subscription's `endpoint` with VAPID, using a server-side Web Push library. No FCM, no Firebase SDK, no hosted notification service.
2. **The VAPID key pair is operator configuration.** The private key is a deployment secret; the public key is served to the web app for `pushManager.subscribe`. Without keys the stub stays in place and reminders remain in the inbox with status `in_app`, as today.
3. **Dead subscriptions are removed, not retried forever.** A `404` or `410` from the push service deletes that `delivery_channel` row; other failures make the delivery fail, so the job retries and the third failure leaves the reminder `failed` and visible in the inbox (FR-MON-08); one delivered subscription is enough. Nothing fails silently (P-10). (Refined while building the adapter, #941.)
4. **The web app gets a service worker** that shows the push and handles `notificationclick`. The actions "watered", "done" and "moved" call the existing idempotent endpoints (e.g. `POST /watering` with `Idempotency-Key`); every action also works as a link into the app, because not every browser shows action buttons.
5. **Asking for permission** happens only after a tap in the reminder settings, never on load. On iOS without an installed web app the settings say how to install it instead of offering a switch that cannot work (P-09).
6. **Email stays the optional second channel** (SMTP of the operator's choice) as a separate adapter behind the same port.
7. **FCM and APNs come with the Capacitor shell, not before.** When the native app exists, a second adapter behind `ReminderChannel` sends to native device tokens (FCM HTTP v1 for Android, APNs or FCM for iOS); the device registration then carries the platform next to the token. The job, the bundle and the idempotency do not change.

## Alternatives considered

| Option                                              | Verdict                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| FCM for web                                         | Rejected for the PWA: same browser API plus a Google project and SDK, no gain. Kept for the native shell (item 7).                            |
| Hosted push services (OneSignal, Pusher Beams, ...) | Rejected: a third party with its own tracking and pricing for one bundled message a day; conflicts with self-operation and P-05.              |
| Notification orchestration (Novu, Knock, Courier)   | Rejected: bundling, quiet hours, pause and idempotency already exist in `core`; a second place for that logic would split it (P-02).          |
| ntfy / UnifiedPush                                  | Not now: self-hostable and Google-free on Android, but needs an extra app on the keeper's device. Revisit if native Android users ask for it. |
| Telegram bot                                        | Not part of E-10.                                                                                                                             |

## Consequences

- One server dependency (a Web Push library) in `api`; no new client dependency apart from the service worker.
- **Operator tasks** (unchanged from `09`): generate the VAPID key pair (`npx web-push generate-vapid-keys`) and store the private key as a secret; for email an SMTP account and sender address.
- **Follow-up work** (stories in epic MON): the Web Push adapter replacing the stub, the service worker with the action buttons, the permission flow with the iOS hint in the settings.
- The push service of each browser vendor still sees the endpoint and delivery metadata; the privacy policy (E-12) names this.
- Revisit when the Capacitor shell is built (item 7), or when measured delivery on a platform turns out unreliable.
