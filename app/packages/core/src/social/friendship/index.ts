// Public interface of the feature `friendship` (US-SOZ-01, US-SOZ-02).
export { friendInvite } from "./operations/invite";
export { friendRequest } from "./operations/request";
export { friendAnswer } from "./operations/answer";
export { friendList, friendRequests } from "./operations/requests";
export { FRIEND_CODE_VALIDITY_DAYS } from "./types";
export type { InviteDependencies, CreatedFriendCode } from "./operations/invite";
export type { AnswerDependencies } from "./operations/answer";
export type { RequestDependencies } from "./operations/request";
export type { OpenRequests, RequestsDependencies } from "./operations/requests";
export type { AnswerOutcome, Friend, FriendRequest, FriendStore, RedeemResult } from "./types";
