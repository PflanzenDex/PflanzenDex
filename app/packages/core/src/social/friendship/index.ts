// Public interface of the feature `friendship` (US-SOZ-01 to US-SOZ-03).
export { friendInvite } from "./operations/invite";
export { friendRequest } from "./operations/request";
export { friendAnswer } from "./operations/lifecycle/answer";
export { friendEnd } from "./operations/lifecycle/end";
export { friendAccount, friendList, friendRequests } from "./operations/requests";
export { FRIEND_CODE_VALIDITY_DAYS } from "./types";
export type { InviteDependencies, CreatedFriendCode } from "./operations/invite";
export type { EndDependencies } from "./operations/lifecycle/end";
export type { AnswerDependencies } from "./operations/lifecycle/answer";
export type { RequestDependencies } from "./operations/request";
export type { OpenRequests, RequestsDependencies } from "./operations/requests";
export type {
  AnswerOutcome,
  Friend,
  FriendRecord,
  FriendRequest,
  FriendStore,
  RedeemResult,
} from "./types";
