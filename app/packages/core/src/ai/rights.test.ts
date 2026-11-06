import { describe, expect, it } from "vitest";
import { NOT_RELEASED_CALLS } from "./reads/areas/area-source";
import {
  AI_OPERATION_CLASSES,
  AI_RIGHTS,
  mayCall,
  rightNeeded,
  rightsOfScope,
  type OperationClass,
} from "./rights";

describe("US-KI-07 rights are ascending scopes", () => {
  it("US-KI-07 takes the highest of our scopes and ignores foreign ones", () => {
    expect(rightsOfScope("openid pflanzen:read")).toBe("read");
    expect(rightsOfScope("pflanzen:read pflanzen:draft")).toBe("drafts");
    expect(rightsOfScope("pflanzen:draft pflanzen:write email")).toBe("write");
    expect(rightsOfScope("openid email")).toBeNull();
    expect(rightsOfScope(undefined)).toBeNull();
  });

  it("US-KI-07 each right includes the lower ones (FR-KI-12)", () => {
    expect(AI_RIGHTS).toEqual(["read", "drafts", "write"]);
    expect(mayCall("read", "status")).toBe(true);
    expect(mayCall("drafts", "status")).toBe(true);
    expect(mayCall("write", "status")).toBe(true);
  });

  it("FR-KI-12 every operation has exactly one known class and the right matches it", () => {
    const classes: OperationClass[] = ["read", "draft", "write", "never"];
    for (const [name, cls] of Object.entries(AI_OPERATION_CLASSES)) {
      expect(classes).toContain(cls);
      const expected = { read: "read", draft: "drafts", write: "write", never: null }[cls];
      expect(rightNeeded(name)).toBe(expected);
    }
  });

  it("FR-KI-10 operations on friends, sharing, swaps, account and connections are never released, an unknown one neither", () => {
    for (const name of [
      "friends_data",
      "sharing_settings",
      "accept_swap",
      "hand_over",
      "delete_account",
      "export_account",
      "manage_connections",
      "partner_data",
      "unknown_operation",
    ])
      expect(mayCall("write", name)).toBe(false);
  });

  it("FR-KI-22 every operation of a human-only call is of class never, so no right reaches it", () => {
    for (const operation of new Set(Object.values(NOT_RELEASED_CALLS))) {
      expect(AI_OPERATION_CLASSES[operation]).toBe("never");
      for (const right of AI_RIGHTS) expect(mayCall(right, operation)).toBe(false);
    }
  });
});
