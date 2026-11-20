// Names a client may try for data or a function that is never released (FR-KI-10, FR-KI-22). They are not listed in
// tools/list and have no tool of their own: a call answers `ai.not_released` through `GET /mcp/not-released/<subject>`,
// logged with the operation of its subject (NOT_RELEASED_CALLS, core). The arguments are never checked, the route has none.
import type { NotReleasedCall } from "@pflanzendex/core";

/** Each name and the subject of its call. The names are what a client would plausibly try (verb_object, E-27). */
export const NOT_RELEASED_TOOLS: Readonly<Record<string, NotReleasedCall>> = {
  list_friends: "friends",
  get_friend_collection: "friends",
  get_feed: "feed",
  get_sharing_settings: "sharing",
  list_offers: "offers",
  list_swaps: "swaps",
  get_recommendations: "recommendations",
  // Equipment of friends, the own sharing and the product suggestions (US-EQU-10, US-EQU-12): only the own equipment is read.
  get_friend_equipment: "friends",
  get_equipment_sharing: "sharing",
  list_equipment_recommendations: "recommendations",
  // The keeper's profile and display name; `get_profile` stays a released read.
  update_profile: "profile",
  set_display_name: "profile",
  // Push subscriptions of a device (`/reminders/subscriptions`).
  subscribe_push: "push",
  unsubscribe_push: "push",
  set_calm_mode: "calm-mode",
  set_onboarding_style: "onboarding",
  dismiss_onboarding_hint: "onboarding",
  // Keeper switches (US-ONB-09): the one switch of a feature, named as the route names it.
  switch_feature: "switches",
  "account.switch_feature": "switches",
  // Visibility of wishes and equipment for friends.
  set_wish_visibility: "visibility",
  set_equipment_visibility: "visibility",
  set_equipment_sharing: "visibility",
  // Reviewer functions (`/review`).
  decide_proposal: "review",
  list_review_proposals: "review",
  // Operator functions (`/operator`, `/registration`).
  set_registration_mode: "operator",
  create_invitation_code: "operator",
  // Connections, including the own rights (`/ai/connections`).
  change_connection_rights: "connections",
  revoke_connection: "connections",
  allow_connection_again: "connections",
  // Swaps: acceptance and handover (`/swaps/:id/answer`, `/swaps/:id/handover`).
  accept_swap: "swap-accept",
  answer_swap: "swap-accept",
  hand_over: "handover",
  // Account deletion and export (`/deletion`, `/export`).
  delete_account: "account-deletion",
  request_account_deletion: "account-deletion",
  export_account: "account-export",
};
