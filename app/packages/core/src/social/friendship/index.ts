// Public interface of the feature `friendship` (US-SOZ-01).
export { friendInvite } from "./operations/invite";
export { friendRequest } from "./operations/request";
export { friendRequests } from "./operations/requests";
export { FRIEND_CODE_VALIDITY_DAYS } from "./types";
export type { InviteDependencies, CreatedFriendCode } from "./operations/invite";
export type { RequestDependencies } from "./operations/request";
export type { OpenRequests, RequestsDependencies } from "./operations/requests";
export type { FriendRequest, FriendStore, RedeemResult } from "./types";
